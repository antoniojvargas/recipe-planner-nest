import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MealPlan, MealPlanSchema } from './meal-plan.schema.js';
import { MealPlansRepository } from './meal-plans.repository.js';

/**
 * Plan semanal: upsert del plan vacío y asignación de recetas a cada hueco.
 */
@Module({
  imports: [MongooseModule.forFeature([{ name: MealPlan.name, schema: MealPlanSchema }])],
  providers: [MealPlansRepository],
  exports: [MongooseModule, MealPlansRepository],
})
export class MealPlansModule {}
