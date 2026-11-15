import { Injectable, NotFoundException } from '@nestjs/common';
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

  /**
   * Actualiza un ítem específico de la lista de la compra usando arrayFilters.
   *
   * Usa `$set` sobre `items.$` (operador posicional) con el filtro
   * `{ "items._id": itemId }` para modificar solo el ítem coincidente.
   * Esto permite actualizaciones atómicas: dos personas marcando ítems a la vez
   * no se pisan porque MongoDB aplica el set sobre la versión leída y el
   * documento se actualiza en una sola operación en el servidor.
   *
   * @param householdId ID del hogar
   * @param weekStart Lunes de la semana
   * @param itemId ID del ítem dentro de la lista (embedded document _id)
   * @param updates Parches a aplicar (quantity, checked, checkedBy)
   * @returns La lista actualizada
   */
  async updateItem(
    householdId: string,
    weekStart: Date,
    itemId: Types.ObjectId,
    updates: Partial<ShoppingItemInput>,
  ): Promise<ShoppingList | null> {
    // Construir las operaciones $set solo con los campos definidos
    const $set: Record<string, unknown> = {};

    if (updates.quantity !== undefined) {
      $set.quantity = updates.quantity;
    }
    if (updates.checked !== undefined) {
      $set.checked = updates.checked;
    }
    if (updates.checkedBy !== undefined) {
      $set.checkedBy = updates.checkedBy;
    }

    // Si no hay nada que actualizar, devolvemos null
    if (Object.keys($set).length === 0) {
      return null;
    }

    return this.shoppingListModel
      .findOneAndUpdate(
        { householdId, weekStart, 'items._id': itemId },
        { $set },
        { new: true, runValidators: true },
      )
      .lean<ShoppingList>()
      .exec();
  }

  /**
   * Añade un nuevo ítem manual a la lista de la compra.
   *
   * Usa `$push` para añadir el ítem al array. Si la lista no existe, se crea
   * (gracias a `upsert: true` en el caller o al usar `replaceItems` antes).
   *
   * @param householdId ID del hogar
   * @param weekStart Lunes de la semana
   * @param item El ítem manual a añadir
   * @returns La lista actualizada
   */
  async addManualItem(
    householdId: string,
    weekStart: Date,
    item: ShoppingItemInput,
  ): Promise<ShoppingList | null> {
    return this.shoppingListModel
      .findOneAndUpdate(
        { householdId, weekStart },
        { $push: { items: item } },
        { new: true, upsert: true, setDefaultsOnInsert: true, runValidators: true },
      )
      .lean<ShoppingList>()
      .exec();
  }
}