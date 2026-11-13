import { HttpException } from '@nestjs/common';
import type { ErrorCode, ErrorDetail } from '@recipe-planner/contracts';

export interface AppExceptionOptions {
  /** Código de estado HTTP con el que se responde. */
  status: number;
  /** Código estable del sobre de error (`VALIDATION_ERROR`, `NOT_FOUND`, …). */
  code: ErrorCode;
  /** Mensaje pensado para el cliente; nunca incluye detalles internos. */
  message: string;
  /** Errores por campo, para los formularios. */
  details?: ErrorDetail[];
}

/**
 * Error de dominio con el código y los detalles del sobre común de la API.
 *
 * Los servicios lo lanzan sin conocer HTTP: el `AllExceptionsFilter` global lo
 * convierte en `{ "error": { "code", "message", "details" } }` con el estado indicado.
 */
export class AppException extends HttpException {
  readonly code: ErrorCode;
  readonly details: ErrorDetail[];

  constructor({ status, code, message, details = [] }: AppExceptionOptions) {
    super({ code, message, details }, status);
    this.code = code;
    this.details = details;
  }
}
