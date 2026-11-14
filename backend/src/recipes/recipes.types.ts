import type { RecipeImage, RecipeIngredient, RecipeSource, RecipeStep } from './recipe.schema.js';

/** Receta tal como la devuelve la API. Los identificadores viajan como strings. */
export interface RecipeResponse {
  id: string;
  householdId: string;
  title: string;
  description?: string;
  servings: number;
  prepMinutes: number;
  cookMinutes: number;
  tags: string[];
  ingredients: RecipeIngredient[];
  steps: RecipeStep[];
  image?: RecipeImage;
  source?: RecipeSource;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

/** Página del recetario. `nextCursor` es `null` en la última página. */
export interface RecipeListResponse {
  items: RecipeResponse[];
  nextCursor: string | null;
}
