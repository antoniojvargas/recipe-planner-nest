import { Types } from 'mongoose';

/**
 * Posición de la última receta de una página.
 *
 * El cursor es opaco para el cliente: viaja en base64url y solo el servidor sabe leerlo. Lleva
 * `updatedAt` y `_id`, las dos claves del orden del recetario, y `score` cuando la página viene
 * de una búsqueda de texto (donde el orden empieza por la relevancia).
 */
export interface RecipesCursor {
  updatedAt: Date;
  id: Types.ObjectId;
  score?: number;
}

/** Cursor de una búsqueda: siempre incluye la puntuación de texto. */
export type RecipesSearchCursor = RecipesCursor & { score: number };

interface CursorPayload {
  /** `updatedAt` en ISO 8601. */
  u: string;
  /** `_id` en hexadecimal. */
  i: string;
  /** `textScore` cuando la página es de una búsqueda. */
  s?: number;
}

const OBJECT_ID_PATTERN = /^[0-9a-fA-F]{24}$/;

export function encodeCursor(cursor: RecipesCursor): string {
  const payload: CursorPayload = {
    u: cursor.updatedAt.toISOString(),
    i: cursor.id.toHexString(),
    ...(cursor.score === undefined ? {} : { s: cursor.score }),
  };

  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

/**
 * Decodifica un cursor. Devuelve `null` si no es base64url válido, no tiene la forma esperada
 * o trae una fecha o un identificador imposibles.
 */
export function decodeCursor(value: string): RecipesCursor | null {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));

    if (typeof parsed !== 'object' || parsed === null) {
      return null;
    }

    const { u, i, s } = parsed as Partial<CursorPayload>;

    if (typeof u !== 'string' || typeof i !== 'string' || !OBJECT_ID_PATTERN.test(i)) {
      return null;
    }

    const updatedAt = new Date(u);

    if (Number.isNaN(updatedAt.getTime())) {
      return null;
    }

    if (s !== undefined && (typeof s !== 'number' || !Number.isFinite(s))) {
      return null;
    }

    return {
      updatedAt,
      id: new Types.ObjectId(i),
      ...(s === undefined ? {} : { score: s }),
    };
  } catch {
    return null;
  }
}
