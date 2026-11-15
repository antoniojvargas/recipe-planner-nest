import { Types } from 'mongoose';
import type { MealPlansRepository } from '../meal-plans/meal-plans.repository.js';
import type { PantryRepository } from '../pantry/pantry.repository.js';
import type { UsersRepository } from '../users/users.repository.js';
import type { ShoppingListGenerator } from './shopping-list.generator.js';
import type { ShoppingList } from './shopping-list.schema.js';
import type { ShoppingListsRepository } from './shopping-lists.repository.js';
import { ShoppingListsService } from './shopping-lists.service.js';

const householdId = new Types.ObjectId().toString();
const weekStart = new Date('2026-11-16T00:00:00.000Z');
const userId = new Types.ObjectId();

interface Harness {
  service: ShoppingListsService;
  lists: {
    findByWeek: ReturnType<typeof vi.fn>;
    replaceItems: ReturnType<typeof vi.fn>;
    updateItem: ReturnType<typeof vi.fn>;
    addManualItem: ReturnType<typeof vi.fn>;
  };
  generator: { generate: ReturnType<typeof vi.fn> };
  mealPlans: { findByWeek: ReturnType<typeof vi.fn> };
  pantry: { findByHousehold: ReturnType<typeof vi.fn> };
  users: { findById: ReturnType<typeof vi.fn> };
  publisher: { publish: ReturnType<typeof vi.fn> };
}

function createService(): Harness {
  const lists = {
    findByWeek: vi.fn(),
    replaceItems: vi.fn(),
    updateItem: vi.fn(),
    addManualItem: vi.fn(),
  };
  const generator = { generate: vi.fn().mockResolvedValue([]) };
  const mealPlans = { findByWeek: vi.fn().mockResolvedValue(null) };
  const pantry = { findByHousehold: vi.fn().mockResolvedValue([]) };
  const users = { findById: vi.fn() };
  const publisher = { publish: vi.fn() };
  const service = new ShoppingListsService(
    lists as unknown as ShoppingListsRepository,
    generator as unknown as ShoppingListGenerator,
    mealPlans as unknown as MealPlansRepository,
    pantry as unknown as PantryRepository,
    users as unknown as UsersRepository,
    publisher,
  );

  return { service, lists, generator, mealPlans, pantry, users, publisher };
}

describe('ShoppingListsService', () => {
  it('publica el ítem marcado con quién lo marcó', async () => {
    const { service, lists, users, publisher } = createService();
    const itemId = new Types.ObjectId();
    const list = {
      _id: new Types.ObjectId(),
      householdId: new Types.ObjectId(householdId),
      weekStart,
      version: 5,
      items: [
        {
          _id: itemId,
          name: 'arroz',
          quantity: 1.5,
          unit: 'kg',
          checked: true,
          checkedBy: userId,
          source: 'plan',
        },
      ],
    } as unknown as ShoppingList;

    lists.updateItem.mockResolvedValue(list);
    users.findById.mockResolvedValue({ displayName: 'Ana' });

    await service.updateItem(householdId, weekStart, itemId, { checked: true });

    expect(publisher.publish).toHaveBeenCalledWith('shopping.item.updated', {
      householdId,
      weekStart: '2026-11-16',
      itemId: itemId.toString(),
      checked: true,
      checkedBy: { userId: userId.toString(), displayName: 'Ana' },
      quantity: 1.5,
      unit: 'kg',
      version: 5,
    });
  });

  it('publica la lista regenerada y conserva manuales y marcados', async () => {
    const { service, lists, generator, mealPlans, publisher } = createService();
    const manual = {
      _id: new Types.ObjectId(),
      name: 'servilletas',
      quantity: 1,
      unit: 'unit',
      checked: false,
      source: 'manual',
    };
    const previousPlan = {
      _id: new Types.ObjectId(),
      name: 'arroz',
      quantity: 1,
      unit: 'kg',
      checked: true,
      checkedBy: userId,
      source: 'plan',
    };

    lists.findByWeek.mockResolvedValue({ items: [manual, previousPlan], version: 3 });
    mealPlans.findByWeek.mockResolvedValue({
      householdId,
      weekStart,
      slots: [],
    });
    generator.generate.mockResolvedValue([
      { name: 'arroz', quantity: 2, unit: 'kg' },
      { name: 'sal', quantity: 10, unit: 'g' },
    ]);
    lists.replaceItems.mockResolvedValue({
      householdId,
      weekStart,
      items: [],
      version: 4,
    });

    await service.generate(householdId, weekStart);

    const [, , items] = lists.replaceItems.mock.calls[0] as [
      string,
      Date,
      { name: string; checked: boolean; checkedBy?: Types.ObjectId }[],
    ];

    expect(items.map((item) => item.name)).toEqual(['servilletas', 'arroz', 'sal']);
    expect(items.find((item) => item.name === 'arroz')?.checked).toBe(true);
    expect(items.find((item) => item.name === 'arroz')?.checkedBy).toEqual(userId);
    expect(publisher.publish).toHaveBeenCalledWith('shopping.list.regenerated', {
      householdId,
      weekStart: '2026-11-16',
      version: 4,
    });
  });
});
