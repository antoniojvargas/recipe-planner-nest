import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MealPlan, MealPlanSchema } from './meal-plan.schema.js';

/**
 * Plan semanal: upsert del plan vacío y asignación de recetas a cada hueco.
 */
@Module({
  imports: [MongooseModule.forFeature([{ name: MealPlan.name, schema: MealPlanSchema }])],
  exports: [MongooseModule],
})
export class MealPlansModule {}
