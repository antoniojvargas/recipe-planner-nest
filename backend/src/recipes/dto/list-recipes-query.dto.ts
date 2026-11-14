import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

/** Tope de resultados por página: lo que cabe en una pantalla y evita respuestas enormes. */
export const RECIPES_PAGE_SIZE = 50;
export const RECIPES_DEFAULT_PAGE_SIZE = 20;

/** `?q=` vacío equivale a no buscar. */
const emptyToUndefined = ({ value }: { value: unknown }) => {
  const trimmed = typeof value === 'string' ? value.trim() : value;

  return trimmed === '' ? undefined : trimmed;
};

/**
 * Acepta `?tags=a,b` (lo habitual) y también `?tags=a&tags=b` (lo que parsea Fastify por
 * defecto): en ambos casos devuelve la lista normalizada a minúsculas, como se guarda en Mongo.
 */
const normalizeTags = ({ value }: { value: unknown }): unknown => {
  if (value === undefined) {
    return undefined;
  }

  const raw = typeof value === 'string' ? value.split(',') : value;

  if (!Array.isArray(raw)) {
    return raw;
  }

  return (raw as unknown[])
    .map((tag) => (typeof tag === 'string' ? tag.trim().toLowerCase() : tag))
    .filter((tag) => tag !== '');
};

/** Parámetros de `GET /households/:householdId/recipes`. */
export class ListRecipesQueryDto {
  /** Texto a buscar en título, etiquetas e ingredientes (índice `recipe_text`). */
  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString({ message: 'La búsqueda debe ser texto' })
  @MinLength(1, { message: 'La búsqueda no puede estar vacía' })
  @MaxLength(120, { message: 'La búsqueda no puede superar los 120 caracteres' })
  q?: string;

  /** Etiquetas que debe tener la receta; se exigen todas. */
  @Transform(normalizeTags)
  @IsOptional()
  @IsArray({ message: 'Las etiquetas deben ser una lista' })
  @ArrayMaxSize(20, { message: 'No se pueden filtrar por más de 20 etiquetas' })
  @IsString({ each: true, message: 'Cada etiqueta debe ser texto' })
  @MaxLength(40, { each: true, message: 'Cada etiqueta no puede superar los 40 caracteres' })
  tags?: string[];

  /** Cursor opaco devuelto en `nextCursor` por la página anterior. */
  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString({ message: 'El cursor debe ser texto' })
  @MaxLength(300, { message: 'El cursor no es válido' })
  cursor?: string;

  @Type(() => Number)
  @IsOptional()
  @IsInt({ message: 'El límite debe ser un número entero' })
  @Min(1, { message: 'El límite debe ser al menos 1' })
  @Max(RECIPES_PAGE_SIZE, {
    message: `El límite no puede superar ${String(RECIPES_PAGE_SIZE)}`,
  })
  limit?: number;
}
