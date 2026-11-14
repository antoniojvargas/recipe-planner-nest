import type { FastifyReply } from 'fastify';
import { ACCESS_TOKEN_MAX_AGE_SECONDS, REFRESH_TOKEN_MAX_AGE_SECONDS } from './auth.constants.js';
import { clearSessionCookies, setSessionCookies } from './session-cookies.js';

const SESSION = { accessToken: 'access.jwt', refreshToken: 'opaque-refresh' };

function createReply() {
  const setCookie = vi.fn();

  return { reply: { setCookie } as unknown as FastifyReply, setCookie };
}

describe('setSessionCookies', () => {
  it('escribe las dos cookies con HttpOnly, SameSite=Lax y su Path', () => {
    const { reply, setCookie } = createReply();

    setSessionCookies(reply, SESSION, { secure: false });

    expect(setCookie).toHaveBeenNthCalledWith(1, 'access_token', 'access.jwt', {
      httpOnly: true,
      sameSite: 'lax',
      secure: false,
      path: '/api',
      maxAge: ACCESS_TOKEN_MAX_AGE_SECONDS,
    });
    expect(setCookie).toHaveBeenNthCalledWith(2, 'refresh_token', 'opaque-refresh', {
      httpOnly: true,
      sameSite: 'lax',
      secure: false,
      path: '/api/auth/refresh',
      maxAge: REFRESH_TOKEN_MAX_AGE_SECONDS,
    });
  });

  it('marca las cookies Secure en producción', () => {
    const { reply, setCookie } = createReply();

    setSessionCookies(reply, SESSION, { secure: true });

    expect(setCookie).toHaveBeenCalledTimes(2);
    for (const [, , options] of setCookie.mock.calls as [string, string, { secure: boolean }][]) {
      expect(options.secure).toBe(true);
    }
  });
});

describe('clearSessionCookies', () => {
  it('vacía las dos cookies con su Path y Max-Age=0', () => {
    const { reply, setCookie } = createReply();

    clearSessionCookies(reply, { secure: false });

    expect(setCookie).toHaveBeenNthCalledWith(1, 'access_token', '', {
      httpOnly: true,
      sameSite: 'lax',
      secure: false,
      path: '/api',
      maxAge: 0,
    });
    expect(setCookie).toHaveBeenNthCalledWith(2, 'refresh_token', '', {
      httpOnly: true,
      sameSite: 'lax',
      secure: false,
      path: '/api/auth/refresh',
      maxAge: 0,
    });
  });

  it('repite el atributo Secure en producción', () => {
    const { reply, setCookie } = createReply();

    clearSessionCookies(reply, { secure: true });

    for (const [, , options] of setCookie.mock.calls as [string, string, { secure: boolean }][]) {
      expect(options.secure).toBe(true);
    }
  });
});
