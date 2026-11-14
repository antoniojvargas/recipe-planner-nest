import { HttpStatus, Injectable } from '@nestjs/common';
import { ERROR_CODES } from '@recipe-planner/contracts';
import { Types, type UpdateQuery } from 'mongoose';
import { AppException } from '../common/exceptions/app.exception.js';
import type { ConfirmImageDto } from '../media/dto/confirm-image.dto.js';
import { MediaService } from '../media/media.service.js';
import { CreateRecipeDto } from './dto/create-recipe.dto.js';
import { ListRecipesQueryDto, RECIPES_DEFAULT_PAGE_SIZE } from './dto/list-recipes-query.dto.js';
import { UpdateRecipeDto } from './dto/update-recipe.dto.js';
import type { Recipe } from './recipe.schema.js';
import {
  decodeCursor,
  encodeCursor,
  type RecipesCursor,
  type RecipesSearchCursor,
} from './recipes.cursor.js';
import { RecipesRepository } from './recipes.repository.js';
import type { RecipeListResponse, RecipeResponse } from './recipes.types.js';

function toResponse(recipe: Recipe): RecipeResponse {
  return {
    id: recipe._id.toString(),
    householdId: recipe.householdId.toString(),
    title: recipe.title,
    ...(recipe.description === undefined ? {} : { description: recipe.description }),
    servings: recipe.servings,
    prepMinutes: recipe.prepMinutes,
    cookMinutes: recipe.cookMinutes,
    tags: [...recipe.tags],
    ingredients: recipe.ingredients.map((ingredient) => ({
      name: ingredient.name,
      quantity: ingredient.quantity,
      unit: ingredient.unit,
      ...(ingredient.note === undefined ? {} : { note: ingredient.note }),
    })),
    steps: recipe.steps.map((step) => ({ text: step.text })),
    ...(recipe.image === undefined
      ? {}
      : {
          image: {
            key: recipe.image.key,
            width: recipe.image.width,
            height: recipe.image.height,
          },
        }),
    ...(recipe.source === undefined
      ? {}
      : { source: { url: recipe.source.url, importedAt: recipe.source.importedAt } }),
    createdBy: recipe.createdBy.toString(),
    createdAt: recipe.createdAt,
    updatedAt: recipe.updatedAt,
  };
}

function notFound(): AppException {
  return new AppException({
    status: HttpStatus.NOT_FOUND,
    code: ERROR_CODES.NOT_FOUND,
    message: 'Receta no encontrada',
  });
}

function invalidCursor(message: string): AppException {
  return new AppException({
    status: HttpStatus.BAD_REQUEST,
    code: ERROR_CODES.VALIDATION_ERROR,
    message: 'El cursor no es válido',
    details: [{ field: 'cursor', message }],
  });
}

/**
 * Casos de uso del recetario de un hogar.
 *
 * No conoce HTTP: recibe el `householdId` ya comprobado por `HouseholdMemberGuard` y el autor
 * autenticado, y devuelve datos de dominio o lanza `AppException`.
 */
@Injectable()
export class RecipesService {
  constructor(
    private readonly recipes: RecipesRepository,
    private readonly media: MediaService,
  ) {}

  async create(householdId: string, userId: string, dto: CreateRecipeDto): Promise<RecipeResponse> {
    const recipe = await this.recipes.create({
      householdId: new Types.ObjectId(householdId),
      createdBy: new Types.ObjectId(userId),
      title: dto.title,
      servings: dto.servings,
      ...(dto.description === undefined ? {} : { description: dto.description }),
      ...(dto.prepMinutes === undefined ? {} : { prepMinutes: dto.prepMinutes }),
      ...(dto.cookMinutes === undefined ? {} : { cookMinutes: dto.cookMinutes }),
      ...(dto.tags === undefined ? {} : { tags: dto.tags }),
      ...(dto.ingredients === undefined ? {} : { ingredients: dto.ingredients }),
      ...(dto.steps === undefined ? {} : { steps: dto.steps }),
    });

    return toResponse(recipe);
  }

  /**
   * Página del recetario: la más reciente primero, filtrada por etiquetas y, si llega `q`, por
   * relevancia del índice de texto. Pide una fila de más para saber si hay página siguiente.
   */
  async list(householdId: string, query: ListRecipesQueryDto): Promise<RecipeListResponse> {
    const limit = query.limit ?? RECIPES_DEFAULT_PAGE_SIZE;
    const tags = query.tags ?? [];
    let cursor: RecipesCursor | undefined;

    if (query.cursor !== undefined) {
      const decoded = decodeCursor(query.cursor);

      if (decoded === null) {
        throw invalidCursor('El cursor no se puede decodificar');
      }

      cursor = decoded;
    }

    if (query.q !== undefined) {
      if (cursor !== undefined && cursor.score === undefined) {
        throw invalidCursor('El cursor no corresponde a una búsqueda');
      }

      const page = await this.recipes.searchPage(householdId, {
        q: query.q,
        tags,
        limit: limit + 1,
        ...(cursor === undefined ? {} : { cursor: cursor as RecipesSearchCursor }),
      });

      return this.toPage(page, limit, true);
    }

    const page = await this.recipes.findPage(householdId, {
      limit: limit + 1,
      tags,
      ...(cursor === undefined ? {} : { cursor }),
    });

    return this.toPage(page, limit, false);
  }

  async findOne(householdId: string, recipeId: string): Promise<RecipeResponse> {
    const recipe = await this.recipes.findById(householdId, recipeId);

    if (recipe === null) {
      throw notFound();
    }

    return toResponse(recipe);
  }

  /**
   * Confirma la imagen que el navegador acaba de subir: comprueba el objeto en el bucket,
   * guarda la clave y las dimensiones reales y encola las miniaturas.
   *
   * Primero se actualiza la receta y después se encola: si la receta no existe o la imagen no
   * es válida, no se crea trabajo huérfano. Un fallo de la cola deja la imagen puesta y la
   * petición falla, para que el cliente pueda reintentar.
   */
  async confirmImage(
    householdId: string,
    recipeId: string,
    dto: ConfirmImageDto,
  ): Promise<RecipeResponse> {
    const image = await this.media.inspectImage(householdId, dto.key);
    const recipe = await this.recipes.updateById(householdId, recipeId, {
      $set: {
        image: { key: image.key, width: image.width, height: image.height },
      },
    });

    if (recipe === null) {
      throw notFound();
    }

    await this.media.enqueueThumbnail({ householdId, recipeId, key: image.key });

    return toResponse(recipe);
  }

  async update(
    householdId: string,
    recipeId: string,
    dto: UpdateRecipeDto,
  ): Promise<RecipeResponse> {
    const patch: Partial<
      Pick<
        Recipe,
        | 'title'
        | 'description'
        | 'servings'
        | 'prepMinutes'
        | 'cookMinutes'
        | 'tags'
        | 'ingredients'
        | 'steps'
      >
    > = {};

    if (dto.title !== undefined) patch.title = dto.title;
    if (dto.description !== undefined) patch.description = dto.description;
    if (dto.servings !== undefined) patch.servings = dto.servings;
    if (dto.prepMinutes !== undefined) patch.prepMinutes = dto.prepMinutes;
    if (dto.cookMinutes !== undefined) patch.cookMinutes = dto.cookMinutes;
    if (dto.tags !== undefined) patch.tags = dto.tags;
    if (dto.ingredients !== undefined) patch.ingredients = dto.ingredients;
    if (dto.steps !== undefined) patch.steps = dto.steps;

    if (Object.keys(patch).length === 0) {
      const recipe = await this.recipes.findById(householdId, recipeId);

      if (recipe === null) {
        throw notFound();
      }

      return toResponse(recipe);
    }

    const update: UpdateQuery<Recipe> = { $set: patch };
    const recipe = await this.recipes.updateById(householdId, recipeId, update);

    if (recipe === null) {
      throw notFound();
    }

    return toResponse(recipe);
  }

  async remove(householdId: string, recipeId: string): Promise<void> {
    const deleted = await this.recipes.deleteById(householdId, recipeId);

    if (!deleted) {
      throw notFound();
    }
  }

  private toPage(
    recipes: (Recipe & { score?: number })[],
    limit: number,
    withScore: boolean,
  ): RecipeListResponse {
    const hasMore = recipes.length > limit;
    const items = hasMore ? recipes.slice(0, limit) : recipes;
    const last: (Recipe & { score?: number }) | undefined = items.at(-1);

    const nextCursor =
      hasMore && last !== undefined
        ? encodeCursor({
            updatedAt: last.updatedAt,
            id: last._id,
            ...(withScore && last.score !== undefined ? { score: last.score } : {}),
          })
        : null;

    return { items: items.map(toResponse), nextCursor };
  }
}
