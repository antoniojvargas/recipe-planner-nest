import { ERROR_CODES } from '@recipe-planner/contracts';
import type { Namespace } from 'socket.io';
import type { AuthTokensService } from '../auth/auth-tokens.service.js';
import type { AppConfig } from '../config/index.js';
import type { HouseholdsService } from '../households/households.service.js';
import type { RealtimePublisherService } from './realtime-publisher.service.js';
import type { RealtimeRoomsService } from './realtime-rooms.service.js';
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

interface GatewayHarness {
  gateway: RealtimeGateway;
  middleware: Middleware;
  households: { findIdsForMember: ReturnType<typeof vi.fn> };
  rooms: { attach: ReturnType<typeof vi.fn>; joinUserChannel: ReturnType<typeof vi.fn> };
  publisher: { attach: ReturnType<typeof vi.fn> };
}

/** Crea el gateway con las dependencias dobladas y captura el middleware del namespace. */
function createGateway(
  verifyAccessToken: ReturnType<typeof vi.fn>,
  { householdIds = [] }: { householdIds?: string[] } = {},
): GatewayHarness {
  const households = { findIdsForMember: vi.fn().mockResolvedValue(householdIds) };
  const rooms = {
    attach: vi.fn(),
    joinUserChannel: vi.fn().mockResolvedValue(undefined),
  };
  const publisher = { attach: vi.fn() };
  const gateway = new RealtimeGateway(
    { verifyAccessToken } as unknown as AuthTokensService,
    households as unknown as HouseholdsService,
    rooms as unknown as RealtimeRoomsService,
    publisher as unknown as RealtimePublisherService,
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

  return { gateway, middleware, households, rooms, publisher };
}

function handshake(middleware: Middleware, headers: Handshake): HandshakeResult {
  const socket = { handshake: { headers }, data: {} } as unknown as RealtimeSocket;
  const error = new Promise<Error | undefined>((resolve) => {
    middleware(socket, resolve);
  });

  return { socket, error };
}

function fakeConnectedSocket(userId = 'user-1'): {
  socket: RealtimeSocket;
  join: ReturnType<typeof vi.fn>;
} {
  const join = vi.fn().mockResolvedValue(undefined);
  const socket = {
    data: { user: { id: userId, familyId: 'family-1' } },
    join,
  } as unknown as RealtimeSocket;

  return { socket, join };
}

describe('RealtimeGateway', () => {
  describe('handshake', () => {
    it('deja la identidad en el socket cuando el token y el origen son válidos', async () => {
      const verify = vi
        .fn()
        .mockResolvedValue({ status: 'valid', userId: 'user-1', familyId: 'family-1' });
      const { socket, error } = handshake(createGateway(verify).middleware, {
        origin: ALLOWED_ORIGIN,
        cookie: 'theme=dark; access_token=header.payload.signature',
      });

      await expect(error).resolves.toBeUndefined();
      expect(verify).toHaveBeenCalledWith('header.payload.signature');
      expect(socket.data.user).toEqual({ id: 'user-1', familyId: 'family-1' });
    });

    it('rechaza con UNAUTHORIZED cuando no viaja la cookie access_token', async () => {
      const verify = vi.fn();
      const { error } = handshake(createGateway(verify).middleware, {
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
        createGateway(vi.fn().mockResolvedValue({ status: 'invalid' })).middleware,
        { origin: ALLOWED_ORIGIN, cookie: 'access_token=roto' },
      );

      const rejection = await error;

      expect((rejection as RealtimeHandshakeError).data.code).toBe(ERROR_CODES.UNAUTHORIZED);
      expect(socket.data.user).toBeUndefined();
    });

    it('rechaza con TOKEN_EXPIRED cuando el token caducó', async () => {
      const { error } = handshake(
        createGateway(vi.fn().mockResolvedValue({ status: 'expired' })).middleware,
        { origin: ALLOWED_ORIGIN, cookie: 'access_token=viejo' },
      );

      const rejection = await error;

      expect((rejection as RealtimeHandshakeError).data.code).toBe(ERROR_CODES.TOKEN_EXPIRED);
    });

    it('rechaza con UNAUTHORIZED un origen distinto de FRONTEND_URL sin verificar el token', async () => {
      const verify = vi
        .fn()
        .mockResolvedValue({ status: 'valid', userId: 'user-1', familyId: 'family-1' });
      const { error } = handshake(createGateway(verify).middleware, {
        origin: 'http://evil.example',
        cookie: 'access_token=header.payload.signature',
      });

      const rejection = await error;

      expect((rejection as RealtimeHandshakeError).data.code).toBe(ERROR_CODES.UNAUTHORIZED);
      expect(verify).not.toHaveBeenCalled();
    });

    it('rechaza con UNAUTHORIZED cuando no hay Origin', async () => {
      const { error } = handshake(createGateway(vi.fn()).middleware, {
        cookie: 'access_token=header.payload.signature',
      });

      const rejection = await error;

      expect((rejection as RealtimeHandshakeError).data.code).toBe(ERROR_CODES.UNAUTHORIZED);
    });

    it('responde UNAUTHORIZED si la verificación falla de forma inesperada', async () => {
      const { error } = handshake(
        createGateway(vi.fn().mockRejectedValue(new Error('boom'))).middleware,
        { origin: ALLOWED_ORIGIN, cookie: 'access_token=token' },
      );

      const rejection = await error;

      expect((rejection as RealtimeHandshakeError).data.code).toBe(ERROR_CODES.UNAUTHORIZED);
    });
  });

  describe('afterInit', () => {
    it('entrega el namespace al publicador de eventos', () => {
      const { publisher } = createGateway(vi.fn());

      expect(publisher.attach).toHaveBeenCalledOnce();
    });
  });

  describe('handleConnection', () => {
    it('une el socket a su sala privada y a la sala de cada hogar', async () => {
      const harness = createGateway(vi.fn(), { householdIds: ['home-1', 'home-2'] });
      const { socket, join } = fakeConnectedSocket('user-1');

      await harness.gateway.handleConnection(socket);

      expect(harness.rooms.joinUserChannel).toHaveBeenCalledWith(socket);
      expect(join).toHaveBeenCalledWith(['household:home-1', 'household:home-2']);
    });

    it('no tumba la conexión si no se pueden leer los hogares', async () => {
      const harness = createGateway(vi.fn());

      harness.households.findIdsForMember.mockRejectedValue(new Error('Mongo caído'));
      const { socket, join } = fakeConnectedSocket('user-1');

      await expect(harness.gateway.handleConnection(socket)).resolves.toBeUndefined();
      expect(harness.rooms.joinUserChannel).toHaveBeenCalledWith(socket);
      expect(join).not.toHaveBeenCalled();
    });
  });
});
