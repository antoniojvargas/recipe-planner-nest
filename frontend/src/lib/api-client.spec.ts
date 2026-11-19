import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

/**
 * En el navegador `fetch` y `Request` resuelven URLs relativas contra el documento; Node no.
 * Se sustituye `Request` antes de importar el cliente para que `/api` siga siendo relativo.
 */
class SameOriginRequest extends Request {
  constructor(input: RequestInfo | URL, init?: RequestInit) {
    super(typeof input === 'string' ? new URL(input, 'http://localhost:3001') : input, init);
  }
}

let apiClient: typeof import('./api-client').apiClient;

beforeAll(async () => {
  vi.stubGlobal('Request', SameOriginRequest);
  ({ apiClient } = await import('./api-client'));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function apiError(code: string, status = 401): Response {
  return json({ error: { code, message: code, details: [] } }, status);
}

function urlOf(input: Request | string): URL {
  return new URL(typeof input === 'string' ? input : input.url, 'http://localhost:3001');
}

describe('apiClient', () => {
  it('añade X-CSRF-Token en mutaciones y no en lecturas', async () => {
    vi.stubGlobal('document', { cookie: 'theme=dark; csrf_token=csrf-value' });

    const seen: Request[] = [];

    vi.stubGlobal(
      'fetch',
      vi.fn(async (request: Request) => {
        seen.push(request);

        return request.method === 'GET'
          ? json({ status: 'ok' })
          : new Response(null, { status: 204 });
      }),
    );

    await apiClient.GET('/api/health');
    await apiClient.POST('/api/auth/logout');

    expect(seen[0]?.headers.get('x-csrf-token')).toBeNull();
    expect(seen[1]?.headers.get('x-csrf-token')).toBe('csrf-value');
    expect(urlOf(seen[1]).pathname).toBe('/api/auth/logout');
  });

  it('refresca una sola vez y reintenta todas las peticiones en vuelo', async () => {
    let healthCalls = 0;
    let refreshCalls = 0;

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: Request | string) => {
        const url = urlOf(input);

        if (url.pathname === '/api/auth/refresh') {
          refreshCalls += 1;

          return new Response(null, { status: 204 });
        }

        healthCalls += 1;

        return healthCalls <= 2 ? apiError('TOKEN_EXPIRED') : json({ status: 'ok' });
      }),
    );

    const [first, second] = await Promise.all([
      apiClient.GET('/api/health'),
      apiClient.GET('/api/health'),
    ]);

    expect(first.data).toEqual({ status: 'ok' });
    expect(second.data).toEqual({ status: 'ok' });
    expect(refreshCalls).toBe(1);
    expect(healthCalls).toBe(4);
  });

  it('reintenta una mutación con su cuerpo intacto', async () => {
    const bodies: string[] = [];
    let loginCalls = 0;

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: Request | string) => {
        const url = urlOf(input);

        if (url.pathname === '/api/auth/refresh') {
          return new Response(null, { status: 204 });
        }

        bodies.push(await (input as Request).text());
        loginCalls += 1;

        return loginCalls === 1
          ? apiError('TOKEN_EXPIRED')
          : json({ user: { id: 'user-1', email: 'ana@example.com' } });
      }),
    );

    const result = await apiClient.POST('/api/auth/login', {
      body: { email: 'ana@example.com', password: 'secreto' },
    });

    expect(result.response.status).toBe(200);
    expect(bodies).toHaveLength(2);
    expect(bodies[0]).toBe(bodies[1]);
    expect(bodies[0]).toContain('ana@example.com');
  });

  it('no refresca un 401 que no es TOKEN_EXPIRED', async () => {
    let refreshCalls = 0;

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: Request | string) => {
        if (urlOf(input).pathname === '/api/auth/refresh') {
          refreshCalls += 1;
        }

        return apiError('UNAUTHORIZED');
      }),
    );

    const result = await apiClient.GET('/api/health');

    expect(result.response.status).toBe(401);
    expect(refreshCalls).toBe(0);
  });

  it('no entra en bucle si el reintento vuelve a caducar', async () => {
    let healthCalls = 0;
    let refreshCalls = 0;

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: Request | string) => {
        if (urlOf(input).pathname === '/api/auth/refresh') {
          refreshCalls += 1;

          return new Response(null, { status: 204 });
        }

        healthCalls += 1;

        return apiError('TOKEN_EXPIRED');
      }),
    );

    const result = await apiClient.GET('/api/health');

    expect(result.response.status).toBe(401);
    expect(refreshCalls).toBe(1);
    expect(healthCalls).toBe(2);
  });

  it('devuelve el 401 original si el refresh falla', async () => {
    let healthCalls = 0;
    let refreshCalls = 0;

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: Request | string) => {
        if (urlOf(input).pathname === '/api/auth/refresh') {
          refreshCalls += 1;

          return apiError('UNAUTHORIZED');
        }

        healthCalls += 1;

        return apiError('TOKEN_EXPIRED');
      }),
    );

    const result = await apiClient.GET('/api/health');

    expect(result.response.status).toBe(401);
    expect(refreshCalls).toBe(1);
    expect(healthCalls).toBe(1);
  });

  it('firma el refresh con el token CSRF de la cookie', async () => {
    vi.stubGlobal('document', { cookie: 'csrf_token=csrf-value' });

    const headers: Headers[] = [];

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: Request | string, init?: RequestInit) => {
        if (urlOf(input).pathname === '/api/auth/refresh') {
          headers.push(new Headers(init?.headers));

          return new Response(null, { status: 204 });
        }

        return new Response(null, { status: 204 });
      }),
    );

    const { refreshSession } = await import('./api-client');

    await expect(refreshSession()).resolves.toBe(true);
    expect(headers[0]?.get('x-csrf-token')).toBe('csrf-value');
  });
});
