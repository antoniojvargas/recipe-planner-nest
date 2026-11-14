/** Cookie legible por JavaScript y cabecera que deben coincidir en las mutaciones. */
export const CSRF_COOKIE = 'csrf_token';
export const CSRF_HEADER = 'x-csrf-token';

/** Vida larga para que el cliente no pierda el token entre sesiones habituales. */
export const CSRF_COOKIE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

export const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export const CSRF_ORIGIN_MESSAGE = 'Origen de la petición no permitido';
export const CSRF_TOKEN_MESSAGE = 'Token CSRF inválido o ausente';
