/** Nombre y ámbito de las cookies de sesión, según el diseño de `docs/architecture.md`. */
export const ACCESS_TOKEN_COOKIE = 'access_token';
export const REFRESH_TOKEN_COOKIE = 'refresh_token';
/**
 * Ambas cookies viajan a todo el host. El access token lo necesita el handshake de Socket.IO
 * (`/socket.io`), que es un path hermano de `/api`; el refresh token lo necesita el middleware
 * de Next para renovar la sesión antes de renderizar una navegación (los Server Components no
 * pueden escribir cookies). Siguen siendo `httpOnly`, `SameSite=Lax` y `Secure` fuera de
 * desarrollo, y el endpoint de refresh es el único que lee el refresh token.
 */
export const ACCESS_TOKEN_COOKIE_PATH = '/';
export const REFRESH_TOKEN_COOKIE_PATH = '/';

/**
 * `Max-Age` de cada cookie. Coincide con el TTL del token que lleva dentro:
 * 15 minutos para el access token y 30 días para el refresh.
 */
export const ACCESS_TOKEN_MAX_AGE_SECONDS = 15 * 60;
export const REFRESH_TOKEN_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

/** El refresh se guarda con `expiresAt = now + 30 días`. */
export const REFRESH_TOKEN_TTL_MS = REFRESH_TOKEN_MAX_AGE_SECONDS * 1000;

/** 256 bits de entropía: el token no se puede adivinar ni enumerar. */
export const REFRESH_TOKEN_BYTES = 32;

/**
 * Mismo mensaje para email inexistente y contraseña incorrecta: el login no revela
 * qué parte de la credencial falló.
 */
export const INVALID_CREDENTIALS_MESSAGE = 'Email o contraseña incorrectos';

/** Un token ausente, desconocido o revocado termina la sesión sin distinguir el motivo. */
export const INVALID_SESSION_MESSAGE = 'La sesión no es válida';

export const EXPIRED_SESSION_MESSAGE = 'La sesión ha caducado';
