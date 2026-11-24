import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const cookieValues: Record<string, string | undefined> = {};
const incomingHeaders = new Headers();

vi.mock('server-only', () => ({}));

vi.mock('next/headers', () => ({
  cookies: () =>
    Promise.resolve({
      get: (name: string) => {
        const value = cookieValues[name];

        return value === undefined ? undefined : { name, value };
      },
    }),
  headers: () => Promise.resolve(incomingHeaders),
}));

const { apiFetch, REQUEST_ID_HEADER } = await import('./api');

interface CapturedCall {
  request: Request;
}

function stubFetch(body: unknown = {}, status = 200): CapturedCall[] {
  const calls: CapturedCall[] = [];

  vi.stubGlobal(
    'fetch',
    vi.fn((input: Request) => {
      calls.push({ request: input });

      return Promise.resolve(
        body === null
          ? new Response(null, { status })
          : new Response(JSON.stringify(body), {
              status,
              headers: { 'content-type': 'application/json' },
            }),
      );
    }),
  );

  return calls;
}

/**
 * `openapi-fetch` copia las opciones no estándar de cada llamada al `Request`, así que
 * `next.revalidate` solo aparece cuando se pasa por llamada. `cache` sí es estándar y refleja
 * la configuración del cliente. Cualquiera de las dos formas evita la caché de Next.
 */
type RequestWithNext = Request & { next?: { revalidate?: number } };

function uncachedViolations(requests: Request[]): string[] {
  return requests
    .filter((request) => {
      const revalidate = (request as RequestWithNext).next?.revalidate;

      return request.cache !== 'no-store' && revalidate !== 0;
    })
    .map((request) => `${request.method} ${request.url}`);
}

beforeEach(() => {
  for (const name of Object.keys(cookieValues)) {
    cookieValues[name] = undefined;
  }
  incomingHeaders.delete(REQUEST_ID_HEADER);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('apiFetch', () => {
  it('llama a la API por API_INTERNAL_URL', async () => {
    const calls = stubFetch();

    const { data } = await apiFetch.GET('/api/auth/me');

    expect(data).toEqual({});
    expect(calls).toHaveLength(1);
    expect(calls[0]?.request.url).toBe('http://api.internal:3000/api/auth/me');
  });

  it('reenvía solo las cookies de sesión', async () => {
    Object.assign(cookieValues, {
      access_token: 'access-token',
      refresh_token: 'refresh-token',
      csrf_token: 'csrf-token',
      next_locale: 'es',
      analytics: 'nope',
    });
    const calls = stubFetch();

    await apiFetch.GET('/api/auth/me');

    expect(calls[0]?.request.headers.get('cookie')).toBe(
      'access_token=access-token; refresh_token=refresh-token; csrf_token=csrf-token',
    );
  });

  it('no añade cabecera Cookie cuando no hay sesión', async () => {
    const calls = stubFetch();

    await apiFetch.GET('/api/health');

    expect(calls[0]?.request.headers.get('cookie')).toBeNull();
  });

  it('ninguna llamada habilita la caché: todas llevan cache: no-store o revalidate: 0', async () => {
    const calls = stubFetch();

    await apiFetch.GET('/api/auth/me');
    await apiFetch.GET('/api/health');
    await apiFetch.GET('/api/households');
    await apiFetch.GET('/api/households/{householdId}/pantry', {
      params: { path: { householdId: 'household-1' } },
    });
    await apiFetch.GET('/api/households/{householdId}/meal-plans/{weekStart}', {
      params: { path: { householdId: 'household-1', weekStart: '2026-11-23' } },
    });
    await apiFetch.POST('/api/auth/logout');

    expect(calls).toHaveLength(6);
    expect(uncachedViolations(calls.map(({ request }) => request))).toEqual([]);
  });

  it('reutiliza el X-Request-Id de la petición entrante', async () => {
    incomingHeaders.set(REQUEST_ID_HEADER, ' incoming-request-id ');
    const calls = stubFetch();

    await apiFetch.GET('/api/auth/me');

    expect(calls[0]?.request.headers.get(REQUEST_ID_HEADER)).toBe('incoming-request-id');
  });

  it('genera un X-Request-Id cuando la petición no trae uno', async () => {
    const calls = stubFetch();

    await apiFetch.GET('/api/auth/me');

    expect(calls[0]?.request.headers.get(REQUEST_ID_HEADER)).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it('firma las mutaciones con Origin y el doble submit de CSRF', async () => {
    Object.assign(cookieValues, { access_token: 'access-token', csrf_token: 'csrf-token' });
    const calls = stubFetch(null, 204);

    const { data } = await apiFetch.POST('/api/auth/logout');

    expect(data).toBeUndefined();
    expect(calls[0]?.request.method).toBe('POST');
    expect(calls[0]?.request.headers.get('origin')).toBe('http://localhost:3001');
    expect(calls[0]?.request.headers.get('x-csrf-token')).toBe('csrf-token');
  });

  it('no firma las peticiones seguras', async () => {
    Object.assign(cookieValues, { csrf_token: 'csrf-token' });
    const calls = stubFetch();

    await apiFetch.GET('/api/auth/me');

    expect(calls[0]?.request.headers.get('origin')).toBeNull();
    expect(calls[0]?.request.headers.get('x-csrf-token')).toBeNull();
  });

  it('devuelve los datos tipados del contrato', async () => {
    stubFetch({
      user: { id: 'user-1', email: 'ana@example.com', displayName: 'Ana' },
    });

    const { data } = await apiFetch.GET('/api/auth/me');

    expect(data?.user.email).toBe('ana@example.com');
  });
});
