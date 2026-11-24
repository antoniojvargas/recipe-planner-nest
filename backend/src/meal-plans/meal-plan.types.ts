import { Expose, Type } from 'class-transformer';
import { toResponseDto } from '../common/response.js';
import type { Meal, MealPlan } from './meal-plan.schema.js';

export class MealPlanSlotResponse {
  @Expose()
  day: number;

  @Expose()
  meal: Meal;

  @Expose()
  recipeId: string;

  @Expose()
  servings: number;
}

/** Plan semanal tal como lo consume el frontend, sin el `__v` de Mongoose. */
export class MealPlanResponse {
  @Expose()
  _id: string;

  @Expose()
  householdId: string;

  @Expose()
  weekStart: Date;

  @Expose()
  @Type(() => MealPlanSlotResponse)
  slots: MealPlanSlotResponse[];

  @Expose()
  createdAt: Date;

  @Expose()
  updatedAt: Date;
}

export function toMealPlanResponse(plan: MealPlan): MealPlanResponse {
  return toResponseDto(MealPlanResponse, {
    _id: plan._id.toString(),
    householdId: plan.householdId.toString(),
    weekStart: plan.weekStart,
    slots: plan.slots.map((slot) => ({
      day: slot.day,
      meal: slot.meal,
      recipeId: slot.recipeId.toString(),
      servings: slot.servings,
    })),
    createdAt: plan.createdAt,
    updatedAt: plan.updatedAt,
  });
}
