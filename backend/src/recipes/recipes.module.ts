import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { HouseholdsModule } from '../households/households.module.js';
import { Recipe, RecipeSchema } from './recipe.schema.js';
import { RecipesController } from './recipes.controller.js';
import { RecipesRepository } from './recipes.repository.js';
import { RecipesService } from './recipes.service.js';

/**
 * CRUD, búsqueda y paginación de recetas dentro de un hogar.
 *
 * Importa `HouseholdsModule` para que `HouseholdMemberGuard` resuelva el repositorio que
 * comprueba la membresía del `:householdId` de la ruta.
 */
@Module({
  imports: [
    MongooseModule.forFeature([{ name: Recipe.name, schema: RecipeSchema }]),
    HouseholdsModule,
  ],
  controllers: [RecipesController],
  providers: [RecipesRepository, RecipesService],
  exports: [MongooseModule, RecipesRepository],
})
export class RecipesModule {}
