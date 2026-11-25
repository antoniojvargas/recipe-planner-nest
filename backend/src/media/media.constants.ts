/** Tipos de imagen que acepta la subida directa a MinIO/S3. */
export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

export type AllowedImageType = (typeof ALLOWED_IMAGE_TYPES)[number];

/** Extensión con la que se guarda cada tipo; el tipo no se deduce del nombre del fichero. */
export const IMAGE_EXTENSIONS: Record<AllowedImageType, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/** Segundos que vive una URL prefirmada de lectura; se firma de nuevo en cada lectura. */
export const IMAGE_URL_TTL_SECONDS = 300;

export function isAllowedImageType(value: string): value is AllowedImageType {
  return (ALLOWED_IMAGE_TYPES as readonly string[]).includes(value);
}

/** Segundos que la URL prefirmada permite iniciar la subida. */
export const UPLOAD_URL_TTL_SECONDS = 300;

/**
 * Antigüedad mínima de un objeto sin receta antes de borrarlo. Da margen a que una subida
 * recién hecha se confirme y a que un trabajo de miniatura termine.
 */
export const ORPHAN_RETENTION_MS = 24 * 60 * 60 * 1_000;

/** Raíz de los objetos definitivos; ninguna operación de medios puede salir de ella. */
export const MEDIA_ROOT_PREFIX = 'households/';

/** Raíz de las subidas sin confirmar, la única que expira por ciclo de vida. */
export const PENDING_UPLOAD_PREFIX = 'pending/';

/** Prefijo del hogar: ninguna operación de medios puede salir de él. */
export function householdMediaPrefix(householdId: string): string {
  return `${MEDIA_ROOT_PREFIX}${householdId}/`;
}

/**
 * Prefijo donde el navegador deja la subida hasta que la API la confirma.
 *
 * Está separado del definitivo para que la regla de ciclo de vida del bucket expire solo lo
 * que nadie confirmó, sin tocar las imágenes que ya usa una receta.
 */
export function pendingUploadPrefix(householdId: string): string {
  return `${PENDING_UPLOAD_PREFIX}${householdId}/`;
}
