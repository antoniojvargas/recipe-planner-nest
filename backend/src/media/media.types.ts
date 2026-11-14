/** Objeto ya subido, comprobado y medido; es lo que se guarda como imagen de la receta. */
export interface UploadedImage {
  key: string;
  width: number;
  height: number;
  /** Tamaño real del objeto en bytes, según `HeadObject`. */
  size: number;
}

/** URLs temporales para mostrar una imagen: el original y sus dos variantes WebP. */
export interface SignedImageUrls {
  originalUrl: string;
  /** Variante de 320 px, para listas y tarjetas. */
  smallUrl: string;
  /** Variante de 960 px, para la ficha de la receta. */
  largeUrl: string;
}

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
