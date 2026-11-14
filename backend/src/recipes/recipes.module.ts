import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Recipe, RecipeSchema } from './recipe.schema.js';
import { RecipesRepository } from './recipes.repository.js';

/**
 * CRUD, búsqueda y paginación de recetas dentro de un hogar.
 */
@Module({
  imports: [MongooseModule.forFeature([{ name: Recipe.name, schema: RecipeSchema }])],
  providers: [RecipesRepository],
  exports: [MongooseModule, RecipesRepository],
})
export class RecipesModule {}
