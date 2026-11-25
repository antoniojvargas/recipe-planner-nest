import type { JobsOptions } from 'bullmq';
import { IMAGE_EXTENSIONS, MEDIA_ROOT_PREFIX, PENDING_UPLOAD_PREFIX } from './media.constants.js';

/**
 * Nombres y datos de la cola de medios.
 *
 * La API solo encola; el proceso `worker` consume. Comparten este módulo para que el nombre
 * del trabajo y el de la cola no se escriban dos veces.
 */
export const MEDIA_QUEUE_NAME = 'media';

export const THUMBNAIL_JOB = 'media.thumbnail';

export const DELETE_IMAGE_JOB = 'media.delete';

/** Barrido periódico de objetos que ninguna receta referencia. */
export const MEDIA_CLEANUP_JOB = 'media.cleanup-orphans';

/** Id del programador; repetirlo en cada arranque actualiza el trabajo, no lo duplica. */
export const MEDIA_CLEANUP_SCHEDULER_ID = 'media.cleanup-orphans';

/** Cada hora: el barrido solo borra objetos de más de 24 h, así que no corre prisa. */
export const MEDIA_CLEANUP_PATTERN = '0 * * * *';

/** Opciones comunes de los trabajos de medios: reintentos y limpieza de la cola. */
export const MEDIA_JOB_OPTIONS = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 1_000 },
  removeOnComplete: { age: 86_400, count: 1_000 },
  removeOnFail: { age: 604_800 },
} as const satisfies JobsOptions;

/**
 * Prefijos que el barrido puede borrar.
 *
 * Son las dos raíces de medios: las subidas pendientes y los objetos definitivos. Cualquier
 * otra clave del bucket queda fuera del alcance del trabajo.
 */
export const MANAGED_MEDIA_PREFIXES = [PENDING_UPLOAD_PREFIX, MEDIA_ROOT_PREFIX] as const;

/** Variantes WebP que genera el worker a partir de la imagen original. */
export const THUMBNAIL_WIDTHS = [320, 960] as const;

export interface ThumbnailJobData {
  householdId: string;
  recipeId: string;
  /** Clave del objeto original en el bucket. */
  key: string;
}

/** Borra el original y sus variantes; se usa al eliminar la receta o cambiar su imagen. */
export interface DeleteImageJobData {
  householdId: string;
  recipeId: string;
  /** Claves exactas a borrar, siempre bajo el prefijo del hogar. */
  keys: string[];
}

/** El barrido no necesita datos: recorre el bucket entero de medios. */
export type CleanupOrphansJobData = Record<string, never>;

export type MediaJobData = ThumbnailJobData | DeleteImageJobData | CleanupOrphansJobData;

/**
 * Clave de una variante: mismo nombre que el original y sufijo con el ancho.
 *
 * Es determinista para que al leer la receta se pueda firmar la URL de la miniatura sin
 * guardar una lista de claves en Mongo.
 */
export function thumbnailKey(originalKey: string, width: number): string {
  return `${originalKey.replace(/\.[^./]+$/, '')}-${String(width)}.webp`;
}

/** Todas las claves que genera una imagen: el original y cada variante WebP. */
export function imageObjectKeys(originalKey: string): string[] {
  return [originalKey, ...THUMBNAIL_WIDTHS.map((width) => thumbnailKey(originalKey, width))];
}

/**
 * Base de una variante: la clave del original sin la extensión, o `undefined` si la clave no
 * es una miniatura.
 *
 * Las variantes se nombran con la base del original y el ancho (`foto-320.webp`), así que la
 * extensión del original se perdió al generarlas y hay que probar las del catálogo.
 */
export function variantBaseKey(key: string): string | undefined {
  for (const width of THUMBNAIL_WIDTHS) {
    const suffix = `-${String(width)}.webp`;

    if (key.endsWith(suffix)) {
      return key.slice(0, -suffix.length);
    }
  }

  return undefined;
}

/** Claves originales posibles para una base de variante, una por extensión del catálogo. */
export function originalKeysForBase(base: string): string[] {
  return Object.values(IMAGE_EXTENSIONS).map((extension) => `${base}.${extension}`);
}
