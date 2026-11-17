import 'server-only';

import createClient, { type Middleware } from 'openapi-fetch';
import { cookies, headers } from 'next/headers';
import type { paths } from './openapi';

/** Cookies de sesión de la API que el servidor de Next reenvía. Nada más viaja. */
export const FORWARDED_COOKIES = ['access_token', 'refresh_token', 'csrf_token'] as const;

export const REQUEST_ID_HEADER = 'x-request-id';
export const CSRF_COOKIE = 'csrf_token';
export const CSRF_HEADER = 'x-csrf-token';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Base de la API para llamadas servidor→servidor. Es una URL de red interna (Compose,
 * `localhost` en desarrollo), nunca una variable `NEXT_PUBLIC_`.
 */
function internalApiUrl(): string {
  const url = process.env.API_INTERNAL_URL?.trim();

  if (!url) {
    throw new Error('API_INTERNAL_URL no está definida: el servidor no puede llamar a la API');
  }

  return url.replace(/\/+$/, '');
}

function frontendUrl(): string {
  const url = process.env.FRONTEND_URL?.trim();

  if (!url) {
    throw new Error('FRONTEND_URL no está definida: la API rechaza la mutación por CSRF');
  }

  return url.replace(/\/+$/, '');
}

/**
 * Prepara cada petición saliente con lo que el navegador ya envió a Next:
 * las cookies de sesión, el `X-Request-Id` y, en mutaciones, el doble submit de CSRF.
 */
const serverRequestMiddleware: Middleware = {
  async onRequest({ request }) {
    const cookieStore = await cookies();
    const forwarded = FORWARDED_COOKIES.flatMap((name) => {
      const value = cookieStore.get(name)?.value;

      return value === undefined ? [] : [`${name}=${value}`];
    });

    if (forwarded.length > 0) {
      request.headers.set('cookie', forwarded.join('; '));
    }

    const incomingRequestId = (await headers()).get(REQUEST_ID_HEADER)?.trim();
    request.headers.set(
      REQUEST_ID_HEADER,
      incomingRequestId?.length ? incomingRequestId : crypto.randomUUID(),
    );

    if (!SAFE_METHODS.has(request.method.toUpperCase())) {
      const csrfToken = cookieStore.get(CSRF_COOKIE)?.value;

      // El `CsrfGuard` de la API exige que el Origin sea el del frontend incluso para
      // llamadas servidor→servidor, que no traen uno por defecto.
      request.headers.set('origin', frontendUrl());

      if (csrfToken !== undefined) {
        request.headers.set(CSRF_HEADER, csrfToken);
      }
    }
  },
};

const client = createClient<paths>({
  baseUrl: internalApiUrl(),
  cache: 'no-store',
  headers: { accept: 'application/json' },
  // Se resuelve en cada llamada (no al crear el cliente) para respetar el `fetch`
  // instrumentado por Next y para poder sustituirlo en las pruebas.
  fetch: (request) => globalThis.fetch(request),
});

client.use(serverRequestMiddleware);

/**
 * Cliente HTTP tipado con el contrato de la API (`packages/contracts/openapi.json`).
 *
 * Se usa solo en el servidor: Server Components y Server Actions. Lee las cookies de la
 * petición entrante, no las del navegador, y desactiva la caché porque toda respuesta
 * autenticada pertenece a una persona concreta.
 */
export const apiFetch = client;
