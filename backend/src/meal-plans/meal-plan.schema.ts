import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { SchemaTypes, Types, type HydratedDocument } from 'mongoose';
import { WEEK_START_VALIDATION } from '../common/week.js';

/** Comidas del día que admite un hueco del plan. */
export const MEALS = ['breakfast', 'lunch', 'dinner'] as const;

export type Meal = (typeof MEALS)[number];

/**
 * Hueco del plan semanal: qué receta se cocina un día y una comida concretos.
 *
 * `_id: false` porque el hueco se identifica por `(day, meal)` dentro del plan y se
 * actualiza con `arrayFilters`; no se consulta por separado.
 */
@Schema({ _id: false })
export class MealPlanSlot {
  /** Día de la semana con el lunes como 0 y el domingo como 6. */
  @Prop({
    type: Number,
    required: true,
    min: 0,
    max: 6,
    validate: {
      validator: (value: number) => Number.isInteger(value),
      message: 'day debe ser un entero entre 0 (lunes) y 6 (domingo)',
    },
  })
  day: number;

  @Prop({ type: String, enum: [...MEALS], required: true })
  meal: Meal;

  /** Referencia a la receta; el plan no copia sus ingredientes ni sus pasos. */
  @Prop({ type: SchemaTypes.ObjectId, ref: 'Recipe', required: true })
  recipeId: Types.ObjectId;

  /** Raciones para este hueco, por si se cocina para más o menos comensales. */
  @Prop({ type: Number, required: true, min: 1 })
  servings: number;
}

export const MealPlanSlotSchema = SchemaFactory.createForClass(MealPlanSlot);

@Schema({ timestamps: true, collection: 'meal_plans' })
export class MealPlan {
  _id: Types.ObjectId;

  /** Hogar al que pertenece el plan; límite de aislamiento de todas las consultas. */
  @Prop({ type: SchemaTypes.ObjectId, ref: 'Household', required: true })
  householdId: Types.ObjectId;

  /**
   * Lunes de la semana a las 00:00 UTC. Se guarda como fecha y se valida el día para que
   * un plan no quede asociado a una semana distinta por una hora o una zona horaria.
   */
  @Prop({ type: Date, required: true, validate: WEEK_START_VALIDATION })
  weekStart: Date;

  @Prop({ type: [MealPlanSlotSchema], default: [] })
  slots: MealPlanSlot[];

  createdAt: Date;
  updatedAt: Date;
}

export type MealPlanDocument = HydratedDocument<MealPlan>;

export const MealPlanSchema = SchemaFactory.createForClass(MealPlan);

// Un plan por hogar y semana: el upsert del plan vacío no puede crear duplicados.
MealPlanSchema.index({ householdId: 1, weekStart: 1 }, { unique: true });
