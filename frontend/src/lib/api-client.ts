import createClient, { type Middleware } from 'openapi-fetch';
import type { paths } from '@/server/openapi';

/**
 * El navegador llama a `/api` en el mismo origen: el rewrite de `next.config.ts` reenvía a la
 * API. Las cookies `httpOnly` viajan solas y no hay CORS ni una URL pública de la API en el
 * bundle.
 *
 * Las rutas del contrato (`paths`) ya empiezan por `/api`, así que el cliente no lleva prefijo
 * propio; `baseUrl` vacío deja la URL relativa al origen actual.
 */
export const CSRF_COOKIE = 'csrf_token';
export const CSRF_HEADER = 'x-csrf-token';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const TOKEN_EXPIRED = 'TOKEN_EXPIRED';
const REFRESH_PATH = '/api/auth/refresh';

/** Lee una cookie no `httpOnly` (`csrf_token`) del documento. */
function readCookie(name: string): string | undefined {
  if (typeof document === 'undefined') {
    return undefined;
  }

  for (const pair of document.cookie.split(';')) {
    const separator = pair.indexOf('=');

    if (separator > 0 && pair.slice(0, separator).trim() === name) {
      return pair.slice(separator + 1);
    }
  }

  return undefined;
}

function csrfHeaders(): Record<string, string> {
  const token = readCookie(CSRF_COOKIE);

  return token === undefined ? {} : { [CSRF_HEADER]: token };
}

let refreshInFlight: Promise<boolean> | null = null;

/**
 * Renueva la sesión una sola vez para todas las peticiones que reciben 401.
 *
 * El backend no tiene ventana de gracia: dos refresh en paralelo con el mismo token se
 * interpretan como reutilización y revocan la familia entera. Por eso la promesa se comparte:
 * todas las peticiones en vuelo esperan al mismo refresh y solo una rota el token.
 */
export function refreshSession(): Promise<boolean> {
  refreshInFlight ??= globalThis
    .fetch(REFRESH_PATH, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { accept: 'application/json', ...csrfHeaders() },
    })
    .then((response) => response.ok)
    .catch(() => false)
    .finally(() => {
      refreshInFlight = null;
    });

  return refreshInFlight;
}

/** El guard responde `401 TOKEN_EXPIRED` solo cuando merece la pena refrescar y reintentar. */
async function isTokenExpired(response: Response): Promise<boolean> {
  if (response.status !== 401) {
    return false;
  }

  try {
    const body = (await response.clone().json()) as { error?: { code?: string } };

    return body.error?.code === TOKEN_EXPIRED;
  } catch {
    return false;
  }
}

/**
 * Se clona la petición antes de enviarla porque después del `fetch` su cuerpo ya está
 * consumido y no se podría reintentar un POST.
 */
const retryableRequests = new WeakMap<Request, Request>();

const browserMiddleware: Middleware = {
  onRequest({ request }) {
    if (!SAFE_METHODS.has(request.method.toUpperCase())) {
      const token = readCookie(CSRF_COOKIE);

      if (token !== undefined) {
        request.headers.set(CSRF_HEADER, token);
      }
    }

    retryableRequests.set(request, request.clone());
  },

  async onResponse({ request, response }) {
    const retry = retryableRequests.get(request);

    retryableRequests.delete(request);

    if (retry === undefined || !(await isTokenExpired(response))) {
      return response;
    }

    if (!(await refreshSession())) {
      // El refresh falló (sesión revocada, CSRF inválido, API caída): se devuelve el 401
      // original y el layout de la app decide si redirige a login.
      return response;
    }

    // El retry sale con la cookie nueva que el navegador guardó del refresh. El token CSRF
    // no rota, pero se vuelve a leer por si el refresh lo hubiera actualizado.
    const token = readCookie(CSRF_COOKIE);

    if (token !== undefined && !SAFE_METHODS.has(retry.method.toUpperCase())) {
      retry.headers.set(CSRF_HEADER, token);
    }

    // Reintento único: si vuelve a fallar, el 401 llega al componente sin otra ronda.
    return globalThis.fetch(retry);
  },
};

/**
 * Cliente HTTP tipado para Client Components. Nunca se importa desde el servidor: allí existe
 * `apiFetch`, que lee las cookies de la petición con `next/headers`.
 */
export const apiClient = createClient<paths>({
  // `same-origin` es suficiente porque el rewrite mantiene el origen de Next.
  credentials: 'same-origin',
  headers: { accept: 'application/json' },
  // Se resuelve en cada llamada para respetar el `fetch` instrumentado y las pruebas.
  fetch: (request) => globalThis.fetch(request),
});

apiClient.use(browserMiddleware);
