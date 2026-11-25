import type { Unit } from '@recipe-planner/contracts';
import { Types } from 'mongoose';
import type { PantryItemInput } from '../../src/pantry/pantry.repository.js';

export interface StoredPantryItem {
  _id: Types.ObjectId;
  householdId: Types.ObjectId;
  name: string;
  quantity: number;
  unit: Unit;
  createdAt: Date;
  updatedAt: Date;
}

/** Repositorio de despensa en memoria, con la misma forma que devuelve Mongo. */
export class InMemoryPantryRepository {
  readonly items: StoredPantryItem[] = [];

  findByHousehold(householdId: string): Promise<StoredPantryItem[]> {
    return Promise.resolve(
      this.items
        .filter((item) => item.householdId.toString() === householdId)
        .sort((left, right) => left.name.localeCompare(right.name)),
    );
  }

  /** Crea el artículo o actualiza cantidad y unidad si ya existe con ese nombre. */
  upsert(householdId: string, item: PantryItemInput): Promise<StoredPantryItem | null> {
    const name = item.name.trim().toLowerCase();
    const existing = this.items.find(
      (stored) => stored.householdId.toString() === householdId && stored.name === name,
    );

    if (existing !== undefined) {
      existing.quantity = item.quantity;
      existing.unit = item.unit;
      existing.updatedAt = new Date();

      return Promise.resolve(existing);
    }

    const now = new Date();
    const stored: StoredPantryItem = {
      _id: new Types.ObjectId(),
      householdId: new Types.ObjectId(householdId),
      name,
      quantity: item.quantity,
      unit: item.unit,
      createdAt: now,
      updatedAt: now,
    };

    this.items.push(stored);

    return Promise.resolve(stored);
  }

  remove(householdId: string, name: string): Promise<boolean> {
    const normalizedName = name.trim().toLowerCase();
    const index = this.items.findIndex(
      (item) => item.householdId.toString() === householdId && item.name === normalizedName,
    );

    if (index === -1) {
      return Promise.resolve(false);
    }

    this.items.splice(index, 1);

    return Promise.resolve(true);
  }
}
