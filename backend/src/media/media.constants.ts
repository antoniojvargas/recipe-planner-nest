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

/** Segundos que la URL prefirmada permite iniciar la subida. */
export const UPLOAD_URL_TTL_SECONDS = 300;

/** Prefijo del hogar: ninguna operación de medios puede salir de él. */
export function householdMediaPrefix(householdId: string): string {
  return `households/${householdId}/`;
}
