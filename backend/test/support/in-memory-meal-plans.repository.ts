import { Types } from 'mongoose';
import type { MealPlan, MealPlanSlot } from '../../src/meal-plans/meal-plan.schema.js';

export type StoredMealPlan = MealPlan & {
  _id: Types.ObjectId;
  householdId: Types.ObjectId;
  weekStart: Date;
  slots: MealPlanSlot[];
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Repositorio de planes semanales en memoria.
 *
 * Reproduce lo que la app ve de Mongo: un plan por `(householdId, weekStart)`, creado vacío si
 * no existe y sin tocar los huecos de un plan ya guardado.
 */
export class InMemoryMealPlansRepository {
  readonly plans: StoredMealPlan[] = [];

  findByWeek(householdId: string, weekStart: Date): Promise<MealPlan | null> {
    return Promise.resolve(this.find(householdId, weekStart) ?? null);
  }

  upsertEmpty(householdId: string, weekStart: Date): Promise<MealPlan | null> {
    return Promise.resolve(
      this.find(householdId, weekStart) ?? this.create(householdId, weekStart),
    );
  }

  replaceSlots(
    householdId: string,
    weekStart: Date,
    slots: MealPlanSlot[],
  ): Promise<MealPlan | null> {
    const plan = this.find(householdId, weekStart) ?? this.create(householdId, weekStart);

    plan.slots = slots;
    plan.updatedAt = new Date();

    return Promise.resolve(plan);
  }

  private find(householdId: string, weekStart: Date): StoredMealPlan | undefined {
    return this.plans.find(
      (plan) =>
        plan.householdId.toString() === householdId &&
        plan.weekStart.toISOString() === weekStart.toISOString(),
    );
  }

  private create(householdId: string, weekStart: Date): StoredMealPlan {
    const now = new Date();
    const plan: StoredMealPlan = {
      _id: new Types.ObjectId(),
      householdId: new Types.ObjectId(householdId),
      weekStart: new Date(weekStart),
      slots: [],
      createdAt: now,
      updatedAt: now,
    };

    this.plans.push(plan);

    return plan;
  }
}
