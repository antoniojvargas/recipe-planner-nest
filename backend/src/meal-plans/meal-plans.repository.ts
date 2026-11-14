import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { MealPlan } from './meal-plan.schema.js';

/**
 * Único punto de acceso a la colección `meal_plans`.
 *
 * Filtra siempre por `householdId` y usa `lean()` en las lecturas. La semana se identifica por
 * `weekStart`, así que todas las búsquedas llevan las dos claves del índice único.
 */
@Injectable()
export class MealPlansRepository {
  constructor(@InjectModel(MealPlan.name) private readonly mealPlanModel: Model<MealPlan>) {}

  async findByWeek(householdId: string, weekStart: Date): Promise<MealPlan | null> {
    return this.mealPlanModel.findOne({ householdId, weekStart }).lean<MealPlan>().exec();
  }

  /**
   * Devuelve el plan de la semana y lo crea vacío si no existe.
   *
   * `$setOnInsert` no toca un plan ya existente: abrir la semana nunca borra sus huecos.
   */
  async upsertEmpty(householdId: string, weekStart: Date): Promise<MealPlan | null> {
    return this.mealPlanModel
      .findOneAndUpdate(
        { householdId, weekStart },
        { $setOnInsert: { householdId, weekStart, slots: [] } },
        { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true, runValidators: true },
      )
      .lean<MealPlan>()
      .exec();
  }
}
