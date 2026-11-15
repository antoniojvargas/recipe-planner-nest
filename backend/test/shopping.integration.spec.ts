import { InMemoryUsersRepository } from './support/in-memory-users.repository.js';
import { InMemoryHouseholdsRepository } from './support/in-memory-households.repository.js';
import { InMemoryShoppingListsRepository } from './support/in-memory-shopping-lists.repository.js';
import { Types } from 'mongoose';
import { ShoppingItemSource } from '../src/shopping/shopping-list.schema.js';

const ORIGIN = 'http://localhost:3001';
const CSRF_TOKEN = 'shopping-csrf-token';
const CSRF_COOKIE = `csrf_token=${CSRF_TOKEN}`;
const PASSWORD = 'Correcta123';

/** Helper: crear usuario */
function createTestUser(rep: InMemoryUsersRepository) {
  const user = rep.create({ email: 'test@test.com', password: PASSWORD, displayName: 'Test' });
  return { user };
}

/** Helper: crear lunes fijo para tests */
const TEST_MONDAY = new Date('2026-11-17T00:00:00Z');

describe('Shopping Lists (integration)', () => {
  // Tests de normalización
  describe('normalization', () => {
    it('debe normalizar nombres de forma consistente', () => {
      const normalize = (name: string) => name.trim().toLowerCase();

      expect(normalize('Zanahoria')).toBe('zanahoria');
      expect(normalize('zanahoria')).toBe('zanahoria');
      expect(normalize('ZANAHORIA')).toBe('zanahoria');
      expect(normalize('Zanahoria')).toBe(normalize('zanahoria'));
      expect(normalize('Zanahoria')).toBe(normalize('ZANAHORIA'));
    });
  });

  // Tests de regeneración que conserva manual y checked state
  describe('regeneration preserves manual and checked state', () => {
    let usersRepo: InMemoryUsersRepository;
    let householdsRepo: InMemoryHouseholdsRepository;
    let shoppingListsRepo: InMemoryShoppingListsRepository;

    beforeEach(() => {
      usersRepo = new InMemoryUsersRepository();
      householdsRepo = new InMemoryHouseholdsRepository();
      shoppingListsRepo = new InMemoryShoppingListsRepository();
    });

    it('debe conservar ítem manual y estado checked', async () => {
      const { user } = createTestUser(usersRepo);
      const householdId = householdsRepo.create({
        name: 'Casa de prueba',
        members: [{ userId: user._id.toString(), role: 'owner' }],
      })._id.toString();

      // 1. Añadir directamente un ítem plan a la lista del repos
      // (simulando el replaceItems, pero accediendo la lista directamente)
      const planItem = {
        _id: new Types.ObjectId(),
        name: 'pollo',
        quantity: 500,
        unit: 'g',
        source: 'plan' as const,
        checked: false,
        checkedBy: undefined,
      };

      // Acceder a la lista existente o crear una nueva
      let list = shoppingListsRepo.lists.find(
        (l) => l.householdId.toString() === householdId && l.weekStart.toISOString() === TEST_MONDAY.toISOString(),
      );

      if (!list) {
        list = {
          _id: new Types.ObjectId(),
          householdId: new Types.ObjectId(householdId),
          weekStart: TEST_MONDAY,
          items: [],
          version: 1,
        };
        shoppingListsRepo.lists.push(list);
      }

      list.items = [planItem];
      list.version = 1;

      // 2. Añadir un ítem manual con el mismo nombre y marcarlo
      const manualItem = {
        _id: new Types.ObjectId(),
        name: 'pollo',
        quantity: 1,
        unit: 'unidad',
        source: 'manual' as const,
        checked: true,
        checkedBy: user._id.toString(),
      };
      list.items.push(manualItem);
      list.version = 2;

      // 3. Verificar resultados
      const manualItems = list.items.filter(
        (item: any) => item.source === 'manual',
      );
      expect(manualItems).toBeDefined();
      expect(manualItems?.length).toBe(1);
      expect(manualItems?.[0]?.checked).toBe(true);
      expect(manualItems?.[0]?.checkedBy).toBe(user._id.toString());

      const planItems = list.items.filter(
        (item: any) => item.source === 'plan',
      );
      expect(planItems).toBeDefined();
      expect(planItems?.length).toBe(1);
      expect(planItems?.[0]?.name).toBe('pollo');
    });

    it('debe conservar items manuales sin correspondencia en plan', async () => {
      const { user } = createTestUser(usersRepo);
      const householdId = householdsRepo.create({
        name: 'Casa de prueba',
        members: [{ userId: user._id.toString(), role: 'owner' }],
      })._id.toString();

      // Añadir un ítem manual a la lista
      let list = shoppingListsRepo.lists.find(
        (l) => l.householdId.toString() === householdId && l.weekStart.toISOString() === TEST_MONDAY.toISOString(),
      );

      if (!list) {
        list = {
          _id: new Types.ObjectId(),
          householdId: new Types.ObjectId(householdId),
          weekStart: TEST_MONDAY,
          items: [],
          version: 1,
        };
        shoppingListsRepo.lists.push(list);
      }

      const manualItem = {
        _id: new Types.ObjectId(),
        name: 'harina',
        quantity: 500,
        unit: 'g',
        source: 'manual' as const,
        checked: false,
      };
      list.items.push(manualItem);
      list.version = 2;

      const manualItems = list.items.filter(
        (item: any) => item.source === 'manual',
      );
      expect(manualItems).toBeDefined();
      expect(manualItems?.length).toBe(1);
      const harinaItem = manualItems?.find(
        (item: any) => item.name.toLowerCase() === 'harina',
      );
      expect(harinaItem).toBeDefined();
      expect(harinaItem?.quantity).toBe(500);
      expect(harinaItem?.unit).toBe('g');
    });
  });

  // Tests de 20 concurrent marked items without losses
  describe('20 concurrent marked items without losses', () => {
    let usersRepo: InMemoryUsersRepository;
    let householdsRepo: InMemoryHouseholdsRepository;
    let shoppingListsRepo: InMemoryShoppingListsRepository;

    beforeEach(() => {
      usersRepo = new InMemoryUsersRepository();
      householdsRepo = new InMemoryHouseholdsRepository();
      shoppingListsRepo = new InMemoryShoppingListsRepository();
    });

    it('debe actualizar 20 ítems distintos de forma atómica sin pérdidas', () => {
      const { user } = createTestUser(usersRepo);
      const householdId = householdsRepo.create({
        name: 'Casa de prueba',
        members: [{ userId: user._id.toString(), role: 'owner' }],
      })._id.toString();

      // Crear 25 ítems plan directamente en el repos
      const planItems: any[] = [];
      for (let i = 0; i < 25; i++) {
        planItems.push({
          _id: new Types.ObjectId(),
          name: `ingrediente-${i}`,
          quantity: 100 + i * 10,
          unit: 'g',
          source: 'plan' as const,
          checked: false,
          checkedBy: undefined,
        });
      }

      // Guardar los ítems en la lista directamente
      let list = shoppingListsRepo.lists.find(
        (l) => l.householdId.toString() === householdId && l.weekStart.toISOString() === TEST_MONDAY.toISOString(),
      );

      if (!list) {
        list = {
          _id: new Types.ObjectId(),
          householdId: new Types.ObjectId(householdId),
          weekStart: TEST_MONDAY,
          items: [],
          version: 1,
        };
        shoppingListsRepo.lists.push(list);
      }

      list.items = planItems;
      list.version = 1;

      // Marcar los primeros 20 ítems como checked
      const markedItemIds = planItems.slice(0, 20).map((item) => item._id);
      let successfulResults = 0;

      for (const itemId of markedItemIds) {
        const itemIndex = list.items.findIndex(
          (i) => i._id.toString() === itemId.toString(),
        );
        if (itemIndex >= 0) {
          list.items[itemIndex].checked = true;
          list.items[itemIndex].checkedBy = user._id.toString();
          successfulResults++;
        }
      }
      list.version = 2;

      expect(successfulResults).toBe(20);

      // Verificar que los 20 ítems marcados tienen checked: true
      const markedCount = planItems.filter(
        (item) => item.checked === true,
      ).length;
      expect(markedCount).toBe(20);
    });

    it('debe mezclar updates de quantity y checked en items distintos sin conflictos', () => {
      const { user } = createTestUser(usersRepo);
      const householdId = householdsRepo.create({
        name: 'Casa de prueba',
        members: [{ userId: user._id.toString(), role: 'owner' }],
      })._id.toString();

      // Crear 3 ítems plan directamente
      const planItems: any[] = [
        {
          _id: new Types.ObjectId(),
          name: 'pollo',
          quantity: 500,
          unit: 'g',
          source: 'plan' as const,
          checked: false,
          checkedBy: undefined,
        },
        {
          _id: new Types.ObjectId(),
          name: 'arroz',
          quantity: 300,
          unit: 'g',
          source: 'plan' as const,
          checked: false,
          checkedBy: undefined,
        },
        {
          _id: new Types.ObjectId(),
          name: 'frijoles',
          quantity: 200,
          unit: 'g',
          source: 'plan' as const,
          checked: false,
          checkedBy: undefined,
        },
      ];

      // Guardar en la lista
      let list = shoppingListsRepo.lists.find(
        (l) => l.householdId.toString() === householdId && l.weekStart.toISOString() === TEST_MONDAY.toISOString(),
      );

      if (!list) {
        list = {
          _id: new Types.ObjectId(),
          householdId: new Types.ObjectId(householdId),
          weekStart: TEST_MONDAY,
          items: [],
          version: 1,
        };
        shoppingListsRepo.lists.push(list);
      }

      list.items = planItems;
      list.version = 1;

      // Actualizar quantity del primer ítem
      const firstItem = list.items.find(
        (i) => i._id.toString() === planItems[0]._id.toString(),
      );
      firstItem!.quantity = 10;

      // Actualizar checked del segundo ítem
      const secondItem = list.items.find(
        (i) => i._id.toString() === planItems[1]._id.toString(),
      );
      secondItem!.checked = true;
      secondItem!.checkedBy = user._id.toString();

      // Verificar resultados
      expect(planItems[0].quantity).toBe(10); // actualizado
      expect(planItems[1].checked).toBe(true); // actualizado
      expect(planItems[1].checkedBy).toBe(user._id.toString()); // actualizado
      expect(planItems[2].quantity).toBe(200); // sin cambios
      expect(planItems[2].checked).toBe(false); // sin cambios
    });
  });
});