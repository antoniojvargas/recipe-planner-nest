import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { HouseholdsModule } from '../households/households.module.js';
import { RealtimePublisherModule } from '../realtime/realtime-publisher.module.js';
import { RecipesModule } from '../recipes/recipes.module.js';
import { MealPlan, MealPlanSchema } from './meal-plan.schema.js';
import { MealPlansController } from './meal-plans.controller.js';
import { MealPlansRepository } from './meal-plans.repository.js';
import { MealPlansService } from './meal-plans.service.js';

/**
 * Plan semanal: upsert del plan vacío y asignación de recetas a cada hueco.
 *
 * Importa `RecipesModule` para validar la receta del hueco, `HouseholdsModule` para que el
 * guard resuelva la membresía y el publicador para notificar `meal-plan.updated`.
 */
@Module({
  imports: [
    MongooseModule.forFeature([{ name: MealPlan.name, schema: MealPlanSchema }]),
    HouseholdsModule,
    RecipesModule,
    RealtimePublisherModule,
  ],
  controllers: [MealPlansController],
  providers: [MealPlansRepository, MealPlansService],
  exports: [MongooseModule, MealPlansRepository],
})
export class MealPlansModule {}
