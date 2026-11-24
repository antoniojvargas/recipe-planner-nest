import type { Unit } from '@recipe-planner/contracts';
import { Expose, Type } from 'class-transformer';

/** Imagen de la receta con URLs de lectura temporales firmadas en cada respuesta. */
export class RecipeImageResponse {
  @Expose()
  key: string;

  @Expose()
  width: number;

  @Expose()
  height: number;

  @Expose()
  originalUrl: string;

  @Expose()
  smallUrl: string;

  @Expose()
  largeUrl: string;
}

export class RecipeIngredientResponse {
  @Expose()
  name: string;

  @Expose()
  quantity: number;

  @Expose()
  unit: Unit;

  @Expose()
  note?: string;
}

export class RecipeStepResponse {
  @Expose()
  text: string;
}

export class RecipeSourceResponse {
  @Expose()
  url: string;

  @Expose()
  importedAt: Date;
}

/** Receta tal como la devuelve la API. Los identificadores viajan como strings. */
export class RecipeResponse {
  @Expose()
  id: string;

  @Expose()
  householdId: string;

  @Expose()
  title: string;

  @Expose()
  description?: string;

  @Expose()
  servings: number;

  @Expose()
  prepMinutes: number;

  @Expose()
  cookMinutes: number;

  @Expose()
  tags: string[];

  @Expose()
  @Type(() => RecipeIngredientResponse)
  ingredients: RecipeIngredientResponse[];

  @Expose()
  @Type(() => RecipeStepResponse)
  steps: RecipeStepResponse[];

  @Expose()
  @Type(() => RecipeImageResponse)
  image?: RecipeImageResponse;

  @Expose()
  @Type(() => RecipeSourceResponse)
  source?: RecipeSourceResponse;

  @Expose()
  createdBy: string;

  @Expose()
  createdAt: Date;

  @Expose()
  updatedAt: Date;
}

/** Página del recetario. `nextCursor` es `null` en la última página. */
export class RecipeListResponse {
  @Expose()
  @Type(() => RecipeResponse)
  items: RecipeResponse[];

  @Expose()
  nextCursor: string | null;
}
