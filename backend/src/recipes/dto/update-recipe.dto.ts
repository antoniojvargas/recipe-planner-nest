import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { RECIPE_LIMITS } from './recipe-limits.js';
import { RecipeIngredientDto } from './recipe-ingredient.dto.js';
import { RecipeStepDto } from './recipe-step.dto.js';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

const normalizeTags = ({ value }: { value: unknown }): unknown =>
  Array.isArray(value)
    ? (value as unknown[]).map((tag) => (typeof tag === 'string' ? tag.trim().toLowerCase() : tag))
    : value;

/**
 * Cuerpo de `PATCH /households/:householdId/recipes/:id`.
 *
 * Todo es opcional: solo se valida lo que llega. Las listas se reemplazan enteras, así que cada
 * ingrediente y cada paso deben venir completos, no como parches parciales.
 */
export class UpdateRecipeDto {
  @Transform(trim)
  @IsOptional()
  @IsString({ message: 'El título debe ser texto' })
  @MinLength(1, { message: 'El título no puede estar vacío' })
  @MaxLength(RECIPE_LIMITS.title, {
    message: `El título no puede superar los ${String(RECIPE_LIMITS.title)} caracteres`,
  })
  title?: string;

  @Transform(trim)
  @IsOptional()
  @IsString({ message: 'La descripción debe ser texto' })
  @MaxLength(RECIPE_LIMITS.description, {
    message: `La descripción no puede superar los ${String(RECIPE_LIMITS.description)} caracteres`,
  })
  description?: string;

  @Type(() => Number)
  @IsOptional()
  @IsInt({ message: 'Las raciones deben ser un número entero' })
  @Min(1, { message: 'Las raciones deben ser al menos 1' })
  servings?: number;

  @Type(() => Number)
  @IsOptional()
  @IsInt({ message: 'Los minutos de preparación deben ser un número entero' })
  @Min(0, { message: 'Los minutos de preparación no pueden ser negativos' })
  prepMinutes?: number;

  @Type(() => Number)
  @IsOptional()
  @IsInt({ message: 'Los minutos de cocción deben ser un número entero' })
  @Min(0, { message: 'Los minutos de cocción no pueden ser negativos' })
  cookMinutes?: number;

  @Transform(normalizeTags)
  @IsOptional()
  @IsArray({ message: 'Las etiquetas deben ser una lista' })
  @ArrayMaxSize(RECIPE_LIMITS.tags, {
    message: `No se pueden añadir más de ${String(RECIPE_LIMITS.tags)} etiquetas`,
  })
  @IsString({ each: true, message: 'Cada etiqueta debe ser texto' })
  @MaxLength(RECIPE_LIMITS.tagLength, {
    each: true,
    message: `Cada etiqueta no puede superar los ${String(RECIPE_LIMITS.tagLength)} caracteres`,
  })
  tags?: string[];

  @IsOptional()
  @IsArray({ message: 'Los ingredientes deben ser una lista' })
  @ArrayMaxSize(RECIPE_LIMITS.ingredients, {
    message: `No se pueden añadir más de ${String(RECIPE_LIMITS.ingredients)} ingredientes`,
  })
  @ValidateNested({ each: true })
  @Type(() => RecipeIngredientDto)
  ingredients?: RecipeIngredientDto[];

  @IsOptional()
  @IsArray({ message: 'Los pasos deben ser una lista' })
  @ArrayMaxSize(RECIPE_LIMITS.steps, {
    message: `No se pueden añadir más de ${String(RECIPE_LIMITS.steps)} pasos`,
  })
  @ValidateNested({ each: true })
  @Type(() => RecipeStepDto)
  steps?: RecipeStepDto[];
}
