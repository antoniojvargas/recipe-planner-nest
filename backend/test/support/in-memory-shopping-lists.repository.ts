import { Types } from 'mongoose';
import type { ShoppingList, ShoppingItemSource } from '../src/shopping/shopping-list.schema.js';

/** Repositorio de listas de la compra en memoria para pruebas de integración. */
export class InMemoryShoppingListsRepository {
  readonly lists: ShoppingList[] = [];

  async findByWeek(householdId: string, weekStart: Date): Promise<ShoppingList | null> {
    return (
      this.lists.find(
        (list) =>
          list.householdId.toString() === householdId &&
          list.weekStart.toISOString() === weekStart.toISOString(),
      ) ?? null
    );
  }

  async replaceItems(
    householdId: string,
    weekStart: Date,
    items: any[],
  ): Promise<ShoppingList | null> {
    const objectId = new Types.ObjectId(householdId);
    const date = new Date(weekStart);

    // Buscar si ya existe la lista
    const list = this.lists.find(
      (l) =>
        l.householdId.toString() === householdId &&
        l.weekStart.toISOString() === date.toISOString(),
    );

    if (list) {
      // Actualizar items existentes
      list.items = items;
      list.version = (list.version ?? 0) + 1;
      return list;
    } else {
      // Crear nueva lista
      const newList: ShoppingList = {
        _id: new Types.ObjectId(),
        householdId: objectId,
        weekStart: date,
        items: [],
        version: 1,
      };
      newList.items = items;
      this.lists.push(newList);
      return newList;
    }
  }

  async updateItem(
    householdId: string,
    weekStart: Date,
    itemId: Types.ObjectId,
    updates: Partial<{ quantity: number; checked: boolean; checkedBy: Types.ObjectId }>,
  ): Promise<ShoppingList | null> {
    const date = new Date(weekStart);

    // Encontrar la lista
    const list = this.lists.find(
      (l) =>
        l.householdId.toString() === householdId &&
        l.weekStart.toISOString() === date.toISOString(),
    );

    if (!list) {
      return null;
    }

    // Encontrar y actualizar el ítem
    const itemIndex = list.items.findIndex((item) => item._id.toString() === itemId.toString());

    if (itemIndex === -1) {
      return null;
    }

    // Aplicar las actualizaciones
    if (updates.quantity !== undefined) {
      list.items[itemIndex].quantity = updates.quantity;
    }
    if (updates.checked !== undefined) {
      list.items[itemIndex].checked = updates.checked;
    }
    if (updates.checkedBy !== undefined) {
      list.items[itemIndex].checkedBy = updates.checkedBy;
    }

    list.version = (list.version ?? 0) + 1;
    return list;
  }

  async addManualItem(
    householdId: string,
    weekStart: Date,
    item: any,
  ): Promise<ShoppingList | null> {
    const date = new Date(weekStart);

    // Buscar si ya existe la lista
    let list = this.lists.find(
      (l) =>
        l.householdId.toString() === householdId &&
        l.weekStart.toISOString() === date.toISOString(),
    );

    if (!list) {
      // Crear nueva lista
      const objectId = new Types.ObjectId(householdId);
      list = {
        _id: new Types.ObjectId(),
        householdId: objectId,
        weekStart: date,
        items: [],
        version: 1,
      };
      this.lists.push(list);
    }

    // Añadir el ítem con source: 'manual'
    const newItem = {
      ...item,
      _id: new Types.ObjectId(),
      source: 'manual',
    };

    list.items.push(newItem);
    list.version = (list.version ?? 0) + 1;
    return list;
  }
}
