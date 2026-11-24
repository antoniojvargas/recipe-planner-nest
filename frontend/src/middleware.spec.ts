import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import {
  config,
  middleware,
  parseSetCookie,
  shouldRefresh,
  updateCookieHeader,
} from './middleware';

const NOW_SECONDS = Math.floor(Date.now() / 1000);

function jwtWithExp(exp: number): string {
  const encode = (value: object) => btoa(JSON.stringify(value)).replace(/=+$/, '');

  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: 'user-1', exp })}.signature`;
}

function requestWithCookies(
  cookies: Record<string, string>,
  headers: Record<string, string> = {},
): NextRequest {
  const cookieHeader = Object.entries(cookies)
    .map(([name, value]) => `${name}=${value}`)
    .join('; ');

  return new NextRequest(new URL('http://localhost:3001/recipes'), {
    headers: { cookie: cookieHeader, ...headers },
  });
}

const matcher = new RegExp(`^${config.matcher[0]}$`);

function refreshResponse(status = 204): Response {
  const headers = new Headers();

  if (status === 204) {
    headers.append(
      'set-cookie',
      'access_token=new-access; Path=/; HttpOnly; SameSite=Lax; Max-Age=900',
    );
    headers.append(
      'set-cookie',
      'refresh_token=new-refresh; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000',
    );
  }

  return new Response(null, { status, headers });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('shouldRefresh', () => {
  it('refresca un token caducado', () => {
    expect(shouldRefresh(jwtWithExp(NOW_SECONDS - 10), NOW_SECONDS)).toBe(true);
  });

  it('refresca un token a punto de caducar', () => {
    expect(shouldRefresh(jwtWithExp(NOW_SECONDS + 10), NOW_SECONDS)).toBe(true);
  });

  it('no refresca un token con vida suficiente', () => {
    expect(shouldRefresh(jwtWithExp(NOW_SECONDS + 600), NOW_SECONDS)).toBe(false);
  });

  it('no refresca si no hay access token', () => {
    expect(shouldRefresh(undefined, NOW_SECONDS)).toBe(false);
  });

  it('refresca un token que no se puede decodificar', () => {
    expect(shouldRefresh('no-es-un-jwt', NOW_SECONDS)).toBe(true);
  });
});

describe('parseSetCookie', () => {
  it('extrae valor y atributos', () => {
    const parsed = parseSetCookie(
      'access_token=abc; Path=/; HttpOnly; SameSite=Lax; Max-Age=900; Secure',
    );

    expect(parsed).toEqual({
      name: 'access_token',
      value: 'abc',
      options: { path: '/', httpOnly: true, sameSite: 'lax', maxAge: 900, secure: true },
    });
  });

  it('ignora una cabecera sin par nombre=valor', () => {
    expect(parseSetCookie('solo-un-atributo')).toBeNull();
  });
});

describe('updateCookieHeader', () => {
  it('reemplaza las cookies renovadas y conserva el resto', () => {
    const header = 'access_token=old; theme=dark; refresh_token=old-refresh';

    expect(
      updateCookieHeader(
        header,
        new Map<string, string | null>([
          ['access_token', 'new'],
          ['refresh_token', null],
        ]),
      ),
    ).toBe('theme=dark; access_token=new');
  });
});

describe('config.matcher', () => {
  it.each(['/', '/recipes', '/plan/2026-11-23', '/shopping/2026-11-23'])(
    'ejecuta el middleware en la ruta de la app %s',
    (pathname) => {
      expect(matcher.test(pathname)).toBe(true);
    },
  );

  it.each([
    '/api/auth/refresh',
    '/socket.io/',
    '/_next/static/chunks/main.js',
    '/_next/image?url=/foto.png',
    '/favicon.ico',
    '/robots.txt',
    '/avatar.svg',
    '/foto.png',
    '/foto.webp',
    '/styles.css',
    '/manifest.webmanifest',
  ])('no ejecuta el middleware en %s', (pathname) => {
    expect(matcher.test(pathname)).toBe(false);
  });
});

describe('middleware', () => {
  it('deja pasar la petición sin llamar a la API si el token sigue vigente', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const response = await middleware(
      requestWithCookies({
        access_token: jwtWithExp(NOW_SECONDS + 600),
        refresh_token: 'refresh-token',
      }),
    );

    expect(fetchMock).not.toHaveBeenCalled();
    expect(response.headers.getSetCookie()).toEqual([]);
  });

  it('refresca la sesión caducada y copia las cookies nuevas', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(refreshResponse()));
    vi.stubGlobal('fetch', fetchMock);

    const response = await middleware(
      requestWithCookies({
        access_token: jwtWithExp(NOW_SECONDS - 10),
        refresh_token: 'refresh-token',
        csrf_token: 'csrf-token',
      }),
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const headers = new Headers(init.headers);

    expect(url).toBe('http://api.internal:3000/api/auth/refresh');
    expect(init.method).toBe('POST');
    expect(headers.get('cookie')).toBe('refresh_token=refresh-token; csrf_token=csrf-token');
    expect(headers.get('origin')).toBe('http://localhost:3001');
    expect(headers.get('x-csrf-token')).toBe('csrf-token');

    const setCookies = response.headers.getSetCookie().join('|');

    expect(setCookies).toContain('access_token=new-access; Path=/;');
    expect(setCookies).toContain('Max-Age=900');
    expect(setCookies).toContain('HttpOnly');
    expect(setCookies).toContain('SameSite=lax');
    expect(setCookies).toContain('refresh_token=new-refresh; Path=/;');
    expect(setCookies).toContain('Max-Age=2592000');

    // La navegación continúa con las cookies nuevas, no con las caducadas.
    const forwardedCookie = response.headers.get('x-middleware-request-cookie');

    expect(forwardedCookie).toContain('access_token=new-access');
    expect(forwardedCookie).toContain('refresh_token=new-refresh');
    expect(forwardedCookie).toContain('csrf_token=csrf-token');

    // La marca viaja con la petición reenviada: si Next vuelve a ejecutar el middleware
    // para la misma navegación, la segunda pasada no refresca otra vez.
    expect(response.headers.get('x-middleware-refreshed')).toBe('1');
    expect(response.headers.get('x-middleware-request-x-middleware-refreshed')).toBe('1');
  });

  it('renueva una sola vez por petición aunque el middleware se ejecute dos veces', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(refreshResponse()));
    vi.stubGlobal('fetch', fetchMock);

    const response = await middleware(
      requestWithCookies(
        {
          access_token: jwtWithExp(NOW_SECONDS - 10),
          refresh_token: 'refresh-token',
        },
        { 'x-middleware-refreshed': '1' },
      ),
    );

    expect(fetchMock).not.toHaveBeenCalled();
    expect(response.headers.getSetCookie()).toEqual([]);
  });

  it('no refresca si no hay refresh token', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await middleware(requestWithCookies({ access_token: jwtWithExp(NOW_SECONDS - 10) }));

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('borra la sesión cuando el refresh ya no es válido', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(refreshResponse(401))),
    );

    const response = await middleware(
      requestWithCookies({
        access_token: jwtWithExp(NOW_SECONDS - 10),
        refresh_token: 'revoked',
        csrf_token: 'csrf-token',
      }),
    );

    const setCookies = response.headers.getSetCookie().join('|');

    expect(setCookies).toContain('access_token=; Path=/; Max-Age=0');
    expect(setCookies).toContain('refresh_token=; Path=/; Max-Age=0');
    expect(setCookies).toContain('csrf_token=; Path=/; Max-Age=0');
  });
});
