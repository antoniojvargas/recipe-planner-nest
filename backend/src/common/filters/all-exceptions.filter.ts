import {
  Catch,
  HttpException,
  HttpStatus,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import type { ErrorCode, ErrorDetail, ErrorResponse } from '@recipe-planner/contracts';
import { ERROR_CODES } from '@recipe-planner/contracts';
import { PinoLogger } from 'nestjs-pino';
import { AppException } from '../exceptions/app.exception.js';

const INTERNAL_ERROR_MESSAGE = 'Error interno del servidor';
const VALIDATION_ERROR_MESSAGE = 'Hay errores de validación en la petición';

const CODE_BY_STATUS: Record<number, ErrorCode> = {
  [HttpStatus.BAD_REQUEST]: ERROR_CODES.VALIDATION_ERROR,
  [HttpStatus.UNAUTHORIZED]: ERROR_CODES.UNAUTHORIZED,
  [HttpStatus.FORBIDDEN]: ERROR_CODES.FORBIDDEN,
  [HttpStatus.NOT_FOUND]: ERROR_CODES.NOT_FOUND,
  [HttpStatus.CONFLICT]: ERROR_CODES.CONFLICT,
  [HttpStatus.TOO_MANY_REQUESTS]: ERROR_CODES.RATE_LIMITED,
};

const MONGO_DUPLICATE_KEY = 11_000;
const SERVER_ERROR_STATUS = 500;

interface NormalizedError {
  status: number;
  body: ErrorResponse;
}

/**
 * Último filtro de la cadena: cualquier excepción sale con la misma forma
 * `{ "error": { "code", "message", "details": [] } }`.
 *
 * - `AppException` conserva su estado, código y detalles.
 * - Los 400 del `ValidationPipe` se convierten en una entrada de `details` por propiedad.
 * - Las `HttpException` de Nest se traducen por estado.
 * - Los duplicados de Mongo (`E11000`) son 409 `CONFLICT`.
 * - Todo lo demás es 500 `INTERNAL_ERROR`, con un mensaje genérico y sin stack en la respuesta.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(
    private readonly adapterHost: HttpAdapterHost,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(AllExceptionsFilter.name);
  }

  catch(exception: unknown, host: ArgumentsHost): void {
    const { httpAdapter } = this.adapterHost;
    const response = host.switchToHttp().getResponse<unknown>();
    const { status, body } = this.normalize(exception);

    if (status >= SERVER_ERROR_STATUS) {
      // El stack queda en los logs, nunca en la respuesta.
      this.logger.error({ err: exception }, body.error.message);
    }

    httpAdapter.reply(response, body, status);
  }

  private normalize(exception: unknown): NormalizedError {
    if (exception instanceof AppException) {
      return {
        status: exception.getStatus(),
        body: {
          error: {
            code: exception.code,
            message: exception.message,
            details: exception.details,
          },
        },
      };
    }

    if (isDuplicateKeyError(exception)) {
      return this.error(HttpStatus.CONFLICT, ERROR_CODES.CONFLICT, 'El recurso ya existe');
    }

    if (exception instanceof HttpException) {
      return this.fromHttpException(exception);
    }

    return this.error(
      HttpStatus.INTERNAL_SERVER_ERROR,
      ERROR_CODES.INTERNAL_ERROR,
      INTERNAL_ERROR_MESSAGE,
    );
  }

  private fromHttpException(exception: HttpException): NormalizedError {
    const status = exception.getStatus();

    if (status >= SERVER_ERROR_STATUS) {
      return this.error(status, ERROR_CODES.INTERNAL_ERROR, INTERNAL_ERROR_MESSAGE);
    }

    const details = validationDetails(exception);
    const code = CODE_BY_STATUS[status] ?? ERROR_CODES.INTERNAL_ERROR;
    const message = details.length > 0 ? VALIDATION_ERROR_MESSAGE : messageFrom(exception);

    return this.error(status, code, message, details);
  }

  private error(
    status: number,
    code: ErrorCode,
    message: string,
    details: ErrorDetail[] = [],
  ): NormalizedError {
    return { status, body: { error: { code, message, details } } };
  }
}

/**
 * El `ValidationPipe` devuelve `message` como lista de textos del estilo
 * `ingredients.0.unit must be a valid unit`; el campo es la primera palabra.
 */
function validationDetails(exception: HttpException): ErrorDetail[] {
  const response = exception.getResponse();

  if (!isRecord(response) || !Array.isArray(response.message)) {
    return [];
  }

  return response.message
    .filter((message): message is string => typeof message === 'string')
    .map((message) => {
      const [field, ...rest] = message.split(' ');

      return { field, message: rest.length > 0 ? message : field };
    });
}

function messageFrom(exception: HttpException): string {
  const response = exception.getResponse();

  if (typeof response === 'string') {
    return response;
  }

  if (isRecord(response) && typeof response.message === 'string') {
    return response.message;
  }

  return exception.message;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isDuplicateKeyError(exception: unknown): boolean {
  return isRecord(exception) && exception.code === MONGO_DUPLICATE_KEY;
}
