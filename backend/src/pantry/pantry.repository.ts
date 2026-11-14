import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { PantryItem } from './pantry-item.schema.js';
import type { Unit } from '@recipe-planner/contracts';

export interface PantryItemInput {
  name: string;
  quantity: number;
  unit: Unit;
}

/** El nombre se compara en la misma forma en que lo guarda el esquema. */
function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

/**
 * Único punto de acceso a la colección `pantry_items`.
 *
 * Filtra siempre por `householdId`, normaliza el nombre antes de consultar para que coincida
 * con el valor guardado y usa `lean()` en las lecturas.
 */
@Injectable()
export class PantryRepository {
  constructor(@InjectModel(PantryItem.name) private readonly pantryModel: Model<PantryItem>) {}

  async findByHousehold(householdId: string): Promise<PantryItem[]> {
    return this.pantryModel.find({ householdId }).sort({ name: 1 }).lean<PantryItem[]>().exec();
  }

  /** Crea el artículo o actualiza su cantidad y unidad si ya existe con ese nombre. */
  async upsert(householdId: string, item: PantryItemInput): Promise<PantryItem | null> {
    const name = normalizeName(item.name);

    return this.pantryModel
      .findOneAndUpdate(
        { householdId, name },
        { $set: { quantity: item.quantity, unit: item.unit }, $setOnInsert: { householdId, name } },
        { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true, runValidators: true },
      )
      .lean<PantryItem>()
      .exec();
  }

  async remove(householdId: string, name: string): Promise<boolean> {
    const result = await this.pantryModel
      .deleteOne({ householdId, name: normalizeName(name) })
      .exec();

    return result.deletedCount === 1;
  }
}
