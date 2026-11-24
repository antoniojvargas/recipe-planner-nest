import type { Unit } from '@recipe-planner/contracts';
import { Expose } from 'class-transformer';
import { toResponseDto } from '../common/response.js';
import type { PantryItem } from './pantry-item.schema.js';

export class PantryItemResponse {
  @Expose()
  _id: string;

  @Expose()
  householdId: string;

  @Expose()
  name: string;

  @Expose()
  quantity: number;

  @Expose()
  unit: Unit;

  @Expose()
  createdAt: Date;

  @Expose()
  updatedAt: Date;
}

export function toPantryItemResponse(item: PantryItem): PantryItemResponse {
  return toResponseDto(PantryItemResponse, {
    _id: item._id.toString(),
    householdId: item.householdId.toString(),
    name: item.name,
    quantity: item.quantity,
    unit: item.unit,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  });
}
