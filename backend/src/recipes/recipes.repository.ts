import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model, UpdateQuery } from 'mongoose';
import { Recipe, type RecipeDocument } from './recipe.schema.js';

export type CreateRecipeInput = Pick<Recipe, 'householdId' | 'title' | 'servings' | 'createdBy'> &
  Partial<
    Pick<
      Recipe,
      | 'description'
      | 'prepMinutes'
      | 'cookMinutes'
      | 'tags'
      | 'ingredients'
      | 'steps'
      | 'image'
      | 'source'
    >
  >;

export interface ListRecipesOptions {
  limit?: number;
  skip?: number;
}

/**
 * Único punto de acceso a la colección `recipes`.
 *
 * Todas las consultas incluyen `householdId` en el filtro, aunque el llamador ya lo haya
 * comprobado: el aislamiento entre hogares no depende de la capa de arriba. Las lecturas usan
 * `lean()` porque la API devuelve datos planos y no necesita documentos de Mongoose.
 */
@Injectable()
export class RecipesRepository {
  constructor(@InjectModel(Recipe.name) private readonly recipeModel: Model<Recipe>) {}

  async create(input: CreateRecipeInput): Promise<RecipeDocument> {
    return this.recipeModel.create(input);
  }

  async findById(householdId: string, recipeId: string): Promise<Recipe | null> {
    return this.recipeModel.findOne({ householdId, _id: recipeId }).lean<Recipe>().exec();
  }

  async findByHousehold(
    householdId: string,
    { limit = 50, skip = 0 }: ListRecipesOptions = {},
  ): Promise<Recipe[]> {
    return this.recipeModel
      .find({ householdId })
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean<Recipe[]>()
      .exec();
  }

  async updateById(
    householdId: string,
    recipeId: string,
    update: UpdateQuery<Recipe>,
  ): Promise<Recipe | null> {
    return this.recipeModel
      .findOneAndUpdate({ householdId, _id: recipeId }, update, {
        returnDocument: 'after',
        runValidators: true,
      })
      .lean<Recipe>()
      .exec();
  }

  async deleteById(householdId: string, recipeId: string): Promise<boolean> {
    const result = await this.recipeModel.deleteOne({ householdId, _id: recipeId }).exec();

    return result.deletedCount === 1;
  }
}
