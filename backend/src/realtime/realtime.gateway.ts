import { Inject, Logger } from '@nestjs/common';
import { type OnGatewayInit, WebSocketGateway } from '@nestjs/websockets';
import { ERROR_CODES, REALTIME_NAMESPACE, type ErrorCode } from '@recipe-planner/contracts';
import type { DefaultEventsMap, Namespace, Socket } from 'socket.io';
import { AuthTokensService } from '../auth/auth-tokens.service.js';
import {
  ACCESS_TOKEN_COOKIE,
  EXPIRED_SESSION_MESSAGE,
  INVALID_SESSION_MESSAGE,
} from '../auth/auth.constants.js';
import { readCookie } from '../auth/cookie-header.js';
import { appConfig, type AppConfig } from '../config/index.js';

/** Identidad que el handshake deja en el socket, igual que `JwtAuthGuard` en la petición. */
export interface RealtimeIdentity {
  id: string;
  familyId: string;
}

export interface RealtimeSocketData {
  user: RealtimeIdentity;
}

export type RealtimeSocket = Socket<
  DefaultEventsMap,
  DefaultEventsMap,
  DefaultEventsMap,
  RealtimeSocketData
>;

/**
 * Error del handshake. Socket.IO copia `data` en el evento `connect_error` del cliente, así
 * que el frontend recibe `{ code, message }` como en el sobre HTTP.
 */
export class RealtimeHandshakeError extends Error {
  readonly data: { code: ErrorCode; message: string };

  constructor(code: ErrorCode, message: string) {
    super(message);
    this.name = RealtimeHandshakeError.name;
    this.data = { code, message };
  }
}

/**
 * Compara con `URL.origin` para no depender de barras finales, mayúsculas en el host ni
 * puertos por defecto. Un valor que no es una URL no coincide con nada.
 */
function normalizeOrigin(value: string): string | undefined {
  try {
    return new URL(value).origin;
  } catch {
    return undefined;
  }
}

/**
 * Gateway del namespace `/realtime`.
 *
 * La autenticación ocurre en el middleware del namespace, antes de `handleConnection`: se
 * verifica con `AuthTokensService` —el mismo verificador del guard HTTP, porque los tokens
 * salen de ahí— el JWT que viaja en la cookie `access_token` del handshake. También se
 * comprueba `Origin` contra `FRONTEND_URL`, que es la defensa contra el secuestro de WebSocket
 * entre sitios: un navegador no puede falsificar el header, así que una página de otro origen
 * no puede abrir el socket con las cookies del usuario.
 *
 * El adaptador de Redis no se configura aquí sino en `redis-io.adapter.ts`, que es lo que
 * permite que varias réplicas de la API compartan salas y que el worker publique eventos.
 */
@WebSocketGateway({ namespace: REALTIME_NAMESPACE })
export class RealtimeGateway implements OnGatewayInit {
  private readonly logger = new Logger(RealtimeGateway.name);
  private readonly allowedOrigin: string;

  constructor(
    private readonly tokens: AuthTokensService,
    @Inject(appConfig.KEY) config: AppConfig,
  ) {
    this.allowedOrigin = normalizeOrigin(config.frontendUrl) ?? config.frontendUrl;
  }

  afterInit(server: Namespace): void {
    server.use((socket, next) => {
      void this.authenticate(socket as RealtimeSocket).then(
        () => {
          next();
        },
        (error: unknown) => {
          next(this.toHandshakeError(error));
        },
      );
    });
  }

  /** Lanza `RealtimeHandshakeError`; el middleware lo entrega como `connect_error`. */
  private async authenticate(socket: RealtimeSocket): Promise<void> {
    this.assertAllowedOrigin(socket.handshake.headers.origin);

    const token = readCookie(socket.handshake.headers.cookie, ACCESS_TOKEN_COOKIE);
    const verification = await this.tokens.verifyAccessToken(token);

    switch (verification.status) {
      case 'valid':
        socket.data.user = { id: verification.userId, familyId: verification.familyId };
        return;
      // Un token caducado se distingue para que el cliente sepa que debe refrescar y
      // reconectar; cualquier otro fallo es una sesión que no vale.
      case 'expired':
        throw new RealtimeHandshakeError(ERROR_CODES.TOKEN_EXPIRED, EXPIRED_SESSION_MESSAGE);
      case 'invalid':
        this.logger.debug('Handshake rechazado: access token ausente o inválido');
        throw new RealtimeHandshakeError(ERROR_CODES.UNAUTHORIZED, INVALID_SESSION_MESSAGE);
    }
  }

  private assertAllowedOrigin(origin: string | undefined): void {
    if (origin !== undefined && normalizeOrigin(origin) === this.allowedOrigin) {
      return;
    }

    this.logger.warn(`Handshake rechazado: origen no permitido (${origin ?? 'ausente'})`);
    throw new RealtimeHandshakeError(ERROR_CODES.UNAUTHORIZED, INVALID_SESSION_MESSAGE);
  }

  private toHandshakeError(error: unknown): RealtimeHandshakeError {
    if (error instanceof RealtimeHandshakeError) {
      return error;
    }

    this.logger.error(
      'Fallo inesperado al autenticar el handshake',
      error instanceof Error ? error.stack : String(error),
    );

    return new RealtimeHandshakeError(ERROR_CODES.UNAUTHORIZED, INVALID_SESSION_MESSAGE);
  }
}
