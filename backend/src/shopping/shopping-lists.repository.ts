import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Unit } from '@recipe-planner/contracts';
import type { Model, Types } from 'mongoose';
import { ShoppingList, type ShoppingItemSource } from './shopping-list.schema.js';

export interface ShoppingItemInput {
  name: string;
  quantity: number;
  unit: Unit;
  checked?: boolean;
  checkedBy?: Types.ObjectId;
  source?: ShoppingItemSource;
}

/**
 * Único punto de acceso a la colección `shopping_lists`.
 *
 * Filtra siempre por `householdId` y usa `lean()` en las lecturas. Las escrituras de ítems
 * concretos se harán con `arrayFilters` sobre `items._id` cuando exista la edición parcial;
 * regenerar la lista reemplaza el array entero, que es una operación del servicio.
 */
@Injectable()
export class ShoppingListsRepository {
  constructor(
    @InjectModel(ShoppingList.name) private readonly shoppingListModel: Model<ShoppingList>,
  ) {}

  async findByWeek(householdId: string, weekStart: Date): Promise<ShoppingList | null> {
    return this.shoppingListModel.findOne({ householdId, weekStart }).lean<ShoppingList>().exec();
  }

  /**
   * Guarda la lista generada para la semana y la crea si todavía no existe.
   *
   * `$setOnInsert` solo rellena el documento nuevo; en uno existente reemplaza los ítems y deja
   * que el servicio decida qué conservar (marcados, añadidos a mano).
   */
  async replaceItems(
    householdId: string,
    weekStart: Date,
    items: ShoppingItemInput[],
  ): Promise<ShoppingList | null> {
    return this.shoppingListModel
      .findOneAndUpdate(
        { householdId, weekStart },
        { $set: { items }, $setOnInsert: { householdId, weekStart } },
        { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true, runValidators: true },
      )
      .lean<ShoppingList>()
      .exec();
  }
}
