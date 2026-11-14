import { Types } from 'mongoose';
import type { Recipe } from '../../src/recipes/recipe.schema.js';
import type {
  CreateRecipeInput,
  RecipePageOptions,
  RecipeSearchOptions,
  ScoredRecipe,
} from '../../src/recipes/recipes.repository.js';

type StoredRecipe = Recipe & { _id: Types.ObjectId; createdAt: Date; updatedAt: Date };

function newestFirst(left: StoredRecipe, right: StoredRecipe): number {
  const byDate = right.updatedAt.getTime() - left.updatedAt.getTime();

  return byDate !== 0 ? byDate : right._id.toHexString().localeCompare(left._id.toHexString());
}

/** Puntuación mínima de la búsqueda: cuenta apariciones de cada palabra de `q`. */
function scoreOf(recipe: StoredRecipe, q: string): number {
  const haystack = [recipe.title, ...recipe.tags, ...recipe.ingredients.map((item) => item.name)]
    .join(' ')
    .toLowerCase();

  return q
    .toLowerCase()
    .split(/\s+/)
    .filter((word) => word.length > 0)
    .reduce((score, word) => score + haystack.split(word).length - 1, 0);
}

/** Repositorio de recetas en memoria para pruebas de integración/e2e. */
export class InMemoryRecipesRepository {
  readonly recipes: StoredRecipe[] = [];

  create(input: CreateRecipeInput): Promise<StoredRecipe> {
    const now = new Date();
    const recipe: StoredRecipe = {
      _id: new Types.ObjectId(),
      householdId: input.householdId,
      title: input.title,
      description: input.description,
      servings: input.servings,
      prepMinutes: input.prepMinutes ?? 0,
      cookMinutes: input.cookMinutes ?? 0,
      tags: input.tags ?? [],
      ingredients: input.ingredients ?? [],
      steps: input.steps ?? [],
      image: input.image,
      source: input.source,
      createdBy: input.createdBy,
      createdAt: now,
      updatedAt: now,
    };
    this.recipes.push(recipe);

    return Promise.resolve(recipe);
  }

  findById(householdId: string, recipeId: string): Promise<Recipe | null> {
    const recipe = this.recipes.find(
      (item) => item.householdId.toString() === householdId && item._id.toString() === recipeId,
    );

    // Como las lecturas reales usan `lean()`, se devuelve una copia: mutar el resultado no
    // debe cambiar el documento guardado.
    return Promise.resolve(recipe === undefined ? null : Object.assign({}, recipe));
  }

  findByHousehold(householdId: string, { limit = 50, skip = 0 } = {}): Promise<Recipe[]> {
    const recipes = this.recipes
      .filter((item) => item.householdId.toString() === householdId)
      .sort(newestFirst)
      .slice(skip, skip + limit);

    return Promise.resolve(recipes);
  }

  findPage(
    householdId: string,
    { limit, tags = [], cursor }: RecipePageOptions,
  ): Promise<Recipe[]> {
    const recipes = this.recipes
      .filter((item) => item.householdId.toString() === householdId)
      .filter((item) => tags.every((tag) => item.tags.includes(tag)))
      .filter(
        (item) =>
          cursor === undefined ||
          item.updatedAt.getTime() < cursor.updatedAt.getTime() ||
          (item.updatedAt.getTime() === cursor.updatedAt.getTime() &&
            item._id.toHexString() < cursor.id.toHexString()),
      )
      .sort(newestFirst)
      .slice(0, limit);

    return Promise.resolve(recipes);
  }

  searchPage(
    householdId: string,
    { q, limit, tags = [], cursor }: RecipeSearchOptions,
  ): Promise<ScoredRecipe[]> {
    const scored = this.recipes
      .filter((item) => item.householdId.toString() === householdId)
      .filter((item) => tags.every((tag) => item.tags.includes(tag)))
      .map((item) => Object.assign({}, item, { score: scoreOf(item, q) }))
      .filter((item) => item.score > 0)
      .filter(
        (item) =>
          cursor === undefined ||
          item.score < cursor.score ||
          (item.score === cursor.score &&
            (item.updatedAt.getTime() < cursor.updatedAt.getTime() ||
              (item.updatedAt.getTime() === cursor.updatedAt.getTime() &&
                item._id.toHexString() < cursor.id.toHexString()))),
      )
      .sort((left, right) => right.score - left.score || newestFirst(left, right))
      .slice(0, limit);

    return Promise.resolve(scored);
  }

  updateById(
    householdId: string,
    recipeId: string,
    update: { $set?: Partial<Record<keyof Recipe, unknown>> },
  ): Promise<Recipe | null> {
    const recipe = this.recipes.find(
      (item) => item.householdId.toString() === householdId && item._id.toString() === recipeId,
    );

    if (recipe === undefined) {
      return Promise.resolve(null);
    }

    Object.assign(recipe, update.$set ?? {}, { updatedAt: new Date() });

    return Promise.resolve(recipe);
  }

  deleteById(householdId: string, recipeId: string): Promise<boolean> {
    const index = this.recipes.findIndex(
      (item) => item.householdId.toString() === householdId && item._id.toString() === recipeId,
    );

    if (index === -1) {
      return Promise.resolve(false);
    }

    this.recipes.splice(index, 1);

    return Promise.resolve(true);
  }
}
