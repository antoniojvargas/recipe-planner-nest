import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model, PipelineStage, QueryFilter, UpdateQuery } from 'mongoose';
import { Recipe, type RecipeDocument } from './recipe.schema.js';
import type { RecipesCursor, RecipesSearchCursor } from './recipes.cursor.js';

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

/** Opciones de una página del recetario. */
export interface RecipePageOptions {
  limit: number;
  tags?: string[];
  cursor?: RecipesCursor;
}

/** Búsqueda de texto con la misma paginación por cursor. */
export interface RecipeSearchOptions extends Omit<RecipePageOptions, 'cursor'> {
  q: string;
  cursor?: RecipesSearchCursor;
}

/** Receta con la puntuación que Mongo asigna a la búsqueda de texto. */
export type ScoredRecipe = Recipe & { score: number };

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

  /**
   * Página del recetario ordenada por `updatedAt` y `_id`, ambos descendentes.
   *
   * La clave de orden incluye `_id` porque dos recetas pueden compartir `updatedAt` al
   * milisegundo (una importación en lote, por ejemplo); sin el desempate, la paginación por
   * cursor podría repetir o saltarse documentos en el borde de la página.
   */
  async findPage(
    householdId: string,
    { limit, tags, cursor }: RecipePageOptions,
  ): Promise<Recipe[]> {
    const filter: QueryFilter<Recipe> = { householdId };

    if (tags !== undefined && tags.length > 0) {
      filter.tags = { $all: tags };
    }

    if (cursor !== undefined) {
      filter.$or = [
        { updatedAt: { $lt: cursor.updatedAt } },
        { updatedAt: cursor.updatedAt, _id: { $lt: cursor.id } },
      ];
    }

    return this.recipeModel
      .find(filter)
      .sort({ updatedAt: -1, _id: -1 })
      .limit(limit)
      .lean<Recipe[]>()
      .exec();
  }

  /**
   * Busca en el índice de texto y pagina por cursor en orden de relevancia.
   *
   * `textScore` solo se puede proyectar, no comparar en un `find`, así que la búsqueda va por
   * agregación: se calcula la puntuación con `$meta`, y a partir de ahí es un campo más y el
   * cursor puede exigir «relevancia menor, o igual con fecha/`_id` menores».
   */
  async searchPage(
    householdId: string,
    { q, limit, tags, cursor }: RecipeSearchOptions,
  ): Promise<ScoredRecipe[]> {
    const match: QueryFilter<Recipe> = { householdId, $text: { $search: q } };

    if (tags !== undefined && tags.length > 0) {
      match.tags = { $all: tags };
    }

    const pipeline: PipelineStage[] = [
      { $match: match },
      { $addFields: { score: { $meta: 'textScore' } } },
    ];

    if (cursor !== undefined) {
      pipeline.push({
        $match: {
          $expr: {
            $or: [
              { $lt: ['$score', cursor.score] },
              {
                $and: [
                  { $eq: ['$score', cursor.score] },
                  { $lt: ['$updatedAt', cursor.updatedAt] },
                ],
              },
              {
                $and: [
                  { $eq: ['$score', cursor.score] },
                  { $eq: ['$updatedAt', cursor.updatedAt] },
                  { $lt: ['$_id', cursor.id] },
                ],
              },
            ],
          },
        },
      });
    }

    pipeline.push({ $sort: { score: -1, updatedAt: -1, _id: -1 } }, { $limit: limit });

    return this.recipeModel.aggregate<ScoredRecipe>(pipeline).exec();
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
