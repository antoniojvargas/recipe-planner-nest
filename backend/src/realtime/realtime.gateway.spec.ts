import { ERROR_CODES } from '@recipe-planner/contracts';
import type { Namespace } from 'socket.io';
import type { AuthTokensService } from '../auth/auth-tokens.service.js';
import type { AppConfig } from '../config/index.js';
import {
  RealtimeGateway,
  RealtimeHandshakeError,
  type RealtimeSocket,
} from './realtime.gateway.js';

type Middleware = (socket: RealtimeSocket, next: (error?: Error) => void) => void;

const ALLOWED_ORIGIN = 'http://localhost:3001';

interface Handshake {
  origin?: string;
  cookie?: string;
}

interface HandshakeResult {
  socket: RealtimeSocket;
  /** Se resuelve cuando el middleware llama a `next`, con el error o sin él. */
  error: Promise<Error | undefined>;
}

/** Crea el gateway con las dependencias dobladas y captura el middleware del namespace. */
function createGateway(verifyAccessToken: ReturnType<typeof vi.fn>): Middleware {
  const gateway = new RealtimeGateway(
    { verifyAccessToken } as unknown as AuthTokensService,
    { frontendUrl: ALLOWED_ORIGIN } as AppConfig,
  );
  let middleware: Middleware | undefined;

  gateway.afterInit({
    use: (handler: Middleware) => {
      middleware = handler;
    },
  } as unknown as Namespace);

  if (middleware === undefined) {
    throw new Error('El gateway no registró el middleware del handshake');
  }

  return middleware;
}

function handshake(middleware: Middleware, headers: Handshake): HandshakeResult {
  const socket = { handshake: { headers }, data: {} } as unknown as RealtimeSocket;
  const error = new Promise<Error | undefined>((resolve) => {
    middleware(socket, resolve);
  });

  return { socket, error };
}

describe('RealtimeGateway', () => {
  it('deja la identidad en el socket cuando el token y el origen son válidos', async () => {
    const verify = vi
      .fn()
      .mockResolvedValue({ status: 'valid', userId: 'user-1', familyId: 'family-1' });
    const { socket, error } = handshake(createGateway(verify), {
      origin: ALLOWED_ORIGIN,
      cookie: 'theme=dark; access_token=header.payload.signature',
    });

    await expect(error).resolves.toBeUndefined();
    expect(verify).toHaveBeenCalledWith('header.payload.signature');
    expect(socket.data.user).toEqual({ id: 'user-1', familyId: 'family-1' });
  });

  it('rechaza con UNAUTHORIZED cuando no viaja la cookie access_token', async () => {
    const verify = vi.fn();
    const { error } = handshake(createGateway(verify), {
      origin: ALLOWED_ORIGIN,
      cookie: 'theme=dark',
    });

    const rejection = await error;

    expect(rejection).toBeInstanceOf(RealtimeHandshakeError);
    expect((rejection as RealtimeHandshakeError).data.code).toBe(ERROR_CODES.UNAUTHORIZED);
    expect(verify).toHaveBeenCalledWith(undefined);
  });

  it('rechaza con UNAUTHORIZED cuando el token no es válido', async () => {
    const { socket, error } = handshake(
      createGateway(vi.fn().mockResolvedValue({ status: 'invalid' })),
      { origin: ALLOWED_ORIGIN, cookie: 'access_token=roto' },
    );

    const rejection = await error;

    expect((rejection as RealtimeHandshakeError).data.code).toBe(ERROR_CODES.UNAUTHORIZED);
    expect(socket.data.user).toBeUndefined();
  });

  it('rechaza con TOKEN_EXPIRED cuando el token caducó', async () => {
    const { error } = handshake(createGateway(vi.fn().mockResolvedValue({ status: 'expired' })), {
      origin: ALLOWED_ORIGIN,
      cookie: 'access_token=viejo',
    });

    const rejection = await error;

    expect((rejection as RealtimeHandshakeError).data.code).toBe(ERROR_CODES.TOKEN_EXPIRED);
  });

  it('rechaza con UNAUTHORIZED un origen distinto de FRONTEND_URL sin verificar el token', async () => {
    const verify = vi
      .fn()
      .mockResolvedValue({ status: 'valid', userId: 'user-1', familyId: 'family-1' });
    const { error } = handshake(createGateway(verify), {
      origin: 'http://evil.example',
      cookie: 'access_token=header.payload.signature',
    });

    const rejection = await error;

    expect((rejection as RealtimeHandshakeError).data.code).toBe(ERROR_CODES.UNAUTHORIZED);
    expect(verify).not.toHaveBeenCalled();
  });

  it('rechaza con UNAUTHORIZED cuando no hay Origin', async () => {
    const { error } = handshake(createGateway(vi.fn()), {
      cookie: 'access_token=header.payload.signature',
    });

    const rejection = await error;

    expect((rejection as RealtimeHandshakeError).data.code).toBe(ERROR_CODES.UNAUTHORIZED);
  });

  it('responde UNAUTHORIZED si la verificación falla de forma inesperada', async () => {
    const { error } = handshake(createGateway(vi.fn().mockRejectedValue(new Error('boom'))), {
      origin: ALLOWED_ORIGIN,
      cookie: 'access_token=token',
    });

    const rejection = await error;

    expect((rejection as RealtimeHandshakeError).data.code).toBe(ERROR_CODES.UNAUTHORIZED);
  });
});
