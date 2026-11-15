import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { ParseObjectIdPipe } from '../common/pipes/parse-object-id.pipe.js';
import { HouseholdMemberGuard } from '../households/guards/household-member.guard.js';
import { ShoppingListsService, type UpdateShoppingItemInput } from './shopping-lists.service.js';
import type { ShoppingList } from './shopping-list.schema.js';

/**
 * Lista de la compra de una semana.
 *
 * El guard comprueba la membresía antes de tocar nada. Las escrituras viven en el servicio,
 * que publica el evento de Socket.IO después de guardar.
 */
@Controller('households/:householdId/shopping-lists')
@UseGuards(HouseholdMemberGuard)
export class ShoppingListsController {
  constructor(private readonly shoppingListsService: ShoppingListsService) {}

  /** Regenera los ítems `plan` conservando los `manual` y el estado `checked`. */
  @Post(':weekStart/generate')
  @HttpCode(HttpStatus.OK)
  async generate(
    @Param('householdId', ParseObjectIdPipe) householdId: string,
    @Param('weekStart') weekStart: string,
  ): Promise<ShoppingList> {
    return this.shoppingListsService.generate(householdId, new Date(weekStart));
  }

  /**
   * Actualiza un ítem con `$set` sobre la posición que coincide con `items._id`: dos personas
   * marcando ítems distintos a la vez no reescriben el documento entero ni se pisan.
   */
  @Patch(':weekStart/items/:itemId')
  @HttpCode(HttpStatus.OK)
  async updateItem(
    @Param('householdId', ParseObjectIdPipe) householdId: string,
    @Param('weekStart') weekStart: string,
    @Param('itemId') itemId: string,
    @Body()
    updates: {
      quantity?: number;
      checked?: boolean;
      checkedBy?: string;
    },
  ): Promise<ShoppingList> {
    const partialUpdates: UpdateShoppingItemInput = {};

    if (updates.quantity !== undefined) {
      partialUpdates.quantity = updates.quantity;
    }
    if (updates.checked !== undefined) {
      partialUpdates.checked = updates.checked;
    }
    if (updates.checkedBy !== undefined) {
      partialUpdates.checkedBy = new Types.ObjectId(updates.checkedBy);
    }

    return this.shoppingListsService.updateItem(
      householdId,
      new Date(weekStart),
      new Types.ObjectId(itemId),
      partialUpdates,
    );
  }

  /** Añade un ítem manual; si la lista de la semana no existe, la crea. */
  @Post(':weekStart/items')
  @HttpCode(HttpStatus.OK)
  async addManualItem(
    @Param('householdId', ParseObjectIdPipe) householdId: string,
    @Param('weekStart') weekStart: string,
    @Body()
    item: {
      name: string;
      quantity: number;
      unit: string;
      checked?: boolean;
      checkedBy?: string;
    },
  ): Promise<ShoppingList> {
    return this.shoppingListsService.addManualItem(householdId, new Date(weekStart), {
      name: item.name,
      quantity: item.quantity,
      unit: item.unit as ShoppingList['items'][number]['unit'],
      source: 'manual',
      checked: item.checked ?? false,
      ...(item.checkedBy === undefined ? {} : { checkedBy: new Types.ObjectId(item.checkedBy) }),
    });
  }
}
