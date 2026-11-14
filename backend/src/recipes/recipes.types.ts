import type { RecipeImage, RecipeIngredient, RecipeSource, RecipeStep } from './recipe.schema.js';

/** Imagen de la receta con URLs de lectura temporales firmadas en cada respuesta. */
export interface RecipeImageResponse extends RecipeImage {
  /** Original tal como se subió. */
  originalUrl: string;
  /** Variante WebP de 320 px, para listas y tarjetas. */
  smallUrl: string;
  /** Variante WebP de 960 px, para la ficha de la receta. */
  largeUrl: string;
}

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
  image?: RecipeImageResponse;
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
