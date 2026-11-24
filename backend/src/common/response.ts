import { plainToInstance } from 'class-transformer';

/**
 * Frontera de serialización de la API.
 *
 * `excludeExtraneousValues` convierte la lista blanca de `@Expose()` en la única forma posible
 * de responder: un documento con `__v`, `passwordHash` o cualquier campo nuevo del esquema no
 * puede escaparse aunque el repositorio lo devuelva con `lean()`.
 */
export function toResponseDto<T>(type: new () => T, source: object): T {
  return plainToInstance(type, source, { excludeExtraneousValues: true });
}
