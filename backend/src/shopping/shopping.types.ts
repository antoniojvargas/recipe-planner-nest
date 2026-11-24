import type { Unit } from '@recipe-planner/contracts';
import { Expose, Type } from 'class-transformer';
import { toResponseDto } from '../common/response.js';
import type { ShoppingItemSource, ShoppingList } from './shopping-list.schema.js';

export class ShoppingItemResponse {
  @Expose()
  _id: string;

  @Expose()
  name: string;

  @Expose()
  quantity: number;

  @Expose()
  unit: Unit;

  @Expose()
  checked: boolean;

  @Expose()
  checkedBy?: string;

  @Expose()
  source: ShoppingItemSource;
}

/** Lista de la compra tal como la consume el frontend; `version` es su control optimista. */
export class ShoppingListResponse {
  @Expose()
  _id: string;

  @Expose()
  householdId: string;

  @Expose()
  weekStart: Date;

  @Expose()
  @Type(() => ShoppingItemResponse)
  items: ShoppingItemResponse[];

  @Expose()
  version: number;
}

export function toShoppingListResponse(list: ShoppingList): ShoppingListResponse {
  return toResponseDto(ShoppingListResponse, {
    _id: list._id.toString(),
    householdId: list.householdId.toString(),
    weekStart: list.weekStart,
    items: list.items.map((item) => ({
      _id: item._id.toString(),
      name: item.name,
      quantity: item.quantity,
      unit: item.unit,
      checked: item.checked,
      ...(item.checkedBy === undefined ? {} : { checkedBy: item.checkedBy.toString() }),
      source: item.source,
    })),
    version: list.version,
  });
}
