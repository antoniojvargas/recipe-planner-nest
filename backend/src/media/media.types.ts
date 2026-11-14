/** Datos para subir la imagen directamente a MinIO/S3 desde el navegador. */
export interface UploadUrlResponse {
  /** Clave del objeto bajo el prefijo del hogar; se usa después al confirmar la receta. */
  key: string;
  /** Endpoint del `POST` multipart (`S3_PUBLIC_ENDPOINT/<bucket>`). */
  url: string;
  /** Campos del formulario, en el orden que devuelve el SDK; `file` va al final. */
  fields: Record<string, string>;
  /** Momento a partir del cual la URL ya no sirve. */
  expiresAt: Date;
}
