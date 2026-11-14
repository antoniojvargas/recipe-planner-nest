/**
 * Nombres y datos de la cola de medios.
 *
 * La API solo encola; el proceso `worker` consume. Comparten este módulo para que el nombre
 * del trabajo y el de la cola no se escriban dos veces.
 */
export const MEDIA_QUEUE_NAME = 'media';

export const THUMBNAIL_JOB = 'media.thumbnail';

export const DELETE_IMAGE_JOB = 'media.delete';

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

export type MediaJobData = ThumbnailJobData | DeleteImageJobData;

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
