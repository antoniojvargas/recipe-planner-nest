/**
 * Códigos de error del sobre común de la API: `{ "error": { code, message, details } }`.
 *
 * El cliente decide qué hacer a partir del `code`, no del texto del mensaje.
 */

export const ERROR_CODES = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  UNAUTHORIZED: 'UNAUTHORIZED',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  RATE_LIMITED: 'RATE_LIMITED',
  IMPORT_FAILED: 'IMPORT_FAILED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

export interface ErrorDetail {
  /** Ruta de la propiedad que falla, p. ej. `ingredients.0.unit`. */
  field: string;
  message: string;
}

export interface ErrorResponse {
  error: {
    code: ErrorCode;
    message: string;
    details: ErrorDetail[];
  };
}
