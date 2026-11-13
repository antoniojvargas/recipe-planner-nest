import { ValidationPipe, type ValidationError } from '@nestjs/common';
import type { ErrorDetail } from '@recipe-planner/contracts';
import { ERROR_CODES } from '@recipe-planner/contracts';
import { AppException } from '../exceptions/app.exception.js';

/**
 * `ValidationPipe` global de la API.
 *
 * - `whitelist`: descarta las propiedades que no están en el DTO.
 * - `forbidNonWhitelisted`: y si llega alguna, falla en vez de ignorarla en silencio.
 * - `transform`: aplica `@Type`/conversiones para que los controladores reciban tipos.
 * - `stopAtFirstError: false`: informa de todos los campos que fallan de una vez, para que el
 *   formulario pueda marcar varios.
 *
 * El `exceptionFactory` produce una `AppException` con un detalle por propiedad, de modo que el
 * sobre de error lleve la ruta exacta del campo (incluidos los anidados).
 */
export function createValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    stopAtFirstError: false,
    exceptionFactory: (errors: ValidationError[]) =>
      new AppException({
        status: 400,
        code: ERROR_CODES.VALIDATION_ERROR,
        message: 'Hay errores de validación en la petición',
        details: toDetails(errors),
      }),
  });
}

/**
 * Aplana el árbol de errores de `class-validator` en la lista de detalles del sobre.
 *
 * Cada propiedad aporta como mucho un detalle (el primer mensaje), pero sus hijos se recorren
 * igual, así que un DTO anidado informa de `ingredients.0.unit`, no solo de `ingredients`.
 */
export function toDetails(errors: ValidationError[], parent = ''): ErrorDetail[] {
  return errors.flatMap((error) => {
    const field = parent === '' ? error.property : `${parent}.${error.property}`;
    const message = firstConstraintMessage(error);

    return [
      ...(message === undefined ? [] : [{ field, message }]),
      ...toDetails(error.children ?? [], field),
    ];
  });
}

function firstConstraintMessage(error: ValidationError): string | undefined {
  if (error.constraints === undefined) {
    return undefined;
  }

  return Object.values(error.constraints)[0];
}
