import { Inject, Logger } from '@nestjs/common';
import {
  type OnGatewayConnection,
  type OnGatewayDisconnect,
  type OnGatewayInit,
  WebSocketGateway,
} from '@nestjs/websockets';
import {
  ERROR_CODES,
  REALTIME_NAMESPACE,
  SESSION_EXPIRED_EVENT,
  type ErrorCode,
  type SessionExpiredPayload,
} from '@recipe-planner/contracts';
import type { DefaultEventsMap, Namespace, Socket } from 'socket.io';
import { AuthTokensService } from '../auth/auth-tokens.service.js';
import {
  ACCESS_TOKEN_COOKIE,
  EXPIRED_SESSION_MESSAGE,
  INVALID_SESSION_MESSAGE,
} from '../auth/auth.constants.js';
import { readCookie } from '../auth/cookie-header.js';
import { appConfig, type AppConfig } from '../config/index.js';
import { HouseholdsService } from '../households/households.service.js';
import { RealtimePublisherService } from './realtime-publisher.service.js';
import { RealtimeRoomsService } from './realtime-rooms.service.js';
import { householdRoom } from './rooms.js';

/** Identidad que el handshake deja en el socket, igual que `JwtAuthGuard` en la petición. */
export interface RealtimeIdentity {
  id: string;
  familyId: string;
}

/**
 * `setTimeout` de Node desborda por encima de 2^31-1 ms. El TTL real es de 15 minutos, pero
 * el temporizador se reprograma por tramos para que una configuración mayor no cierre el
 * socket antes de tiempo.
 */
const MAX_TIMER_DELAY_MS = 2 ** 31 - 1;

export interface RealtimeSocketData {
  user: RealtimeIdentity;
  /** `exp` del access token en milisegundos; el gateway cierra el socket cuando llega. */
  expiresAt?: number;
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
 * Estado de la conexión tras uno o varios `await`.
 *
 * La comprobación va en una función para que el analizador no la trate como constante: entre
 * la consulta de hogares y el `join` el temporizador de caducidad puede haber cerrado el
 * socket.
 */
function isSocketClosed(socket: RealtimeSocket): boolean {
  return socket.disconnected;
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
export class RealtimeGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(RealtimeGateway.name);
  private readonly allowedOrigin: string;
  /** Temporizador de caducidad de cada socket, para cancelarlo al desconectarse. */
  private readonly expiryTimers = new WeakMap<RealtimeSocket, ReturnType<typeof setTimeout>>();

  constructor(
    private readonly tokens: AuthTokensService,
    private readonly households: HouseholdsService,
    private readonly rooms: RealtimeRoomsService,
    private readonly publisher: RealtimePublisherService,
    @Inject(appConfig.KEY) config: AppConfig,
  ) {
    this.allowedOrigin = normalizeOrigin(config.frontendUrl) ?? config.frontendUrl;
  }

  afterInit(server: Namespace): void {
    this.rooms.attach(server);
    this.publisher.attach(server);

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

  /**
   * Une el socket a la sala privada del usuario y a la de cada uno de sus hogares.
   *
   * Primero entra en `user:{id}`: así una membresía que cambie mientras se consultan los
   * hogares llega igualmente al socket, porque `onJoined`/`onLeft` ya lo alcanzan.
   */
  async handleConnection(socket: RealtimeSocket): Promise<void> {
    const userId = socket.data.user.id;

    // Se programa antes de las consultas: aunque resolver los hogares tarde o falle, el
    // socket ya tiene una hora límite.
    this.scheduleExpiry(socket);

    if (isSocketClosed(socket)) {
      // El token ya había caducado al conectar: `scheduleExpiry` cerró el socket y no hay
      // salas que unir.
      return;
    }

    await this.rooms.joinUserChannel(socket);

    try {
      const householdIds = await this.households.findIdsForMember(userId);

      if (isSocketClosed(socket)) {
        return;
      }

      await socket.join(householdIds.map(householdRoom));
    } catch (error) {
      // Sin salas de hogar el socket sigue conectado, pero no recibe sus eventos hasta que
      // se reconecte; tumbar la conexión por un fallo de lectura sería peor.
      this.logger.error(
        `No se pudieron resolver los hogares de ${userId}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  /** Cancela el temporizador de caducidad: ya no hay socket que cerrar. */
  handleDisconnect(socket: RealtimeSocket): void {
    const timer = this.expiryTimers.get(socket);

    if (timer !== undefined) {
      clearTimeout(timer);
      this.expiryTimers.delete(socket);
    }
  }

  /**
   * Cierra el socket cuando caduca el token con el que se abrió.
   *
   * La conexión puede durar más que el access token de 15 minutos, así que el handshake deja
   * el `exp` en el socket y aquí se programa el cierre. Se avisa con `session.expired`
   * —Socket.IO no permite adjuntar datos al `disconnect`— y se corta la conexión: el cliente
   * refresca la sesión y reconecta con la cookie nueva.
   */
  private scheduleExpiry(socket: RealtimeSocket): void {
    const { expiresAt } = socket.data;

    if (expiresAt === undefined) {
      return;
    }

    const remaining = expiresAt - Date.now();

    if (remaining <= 0) {
      this.expire(socket);
      return;
    }

    const timer = setTimeout(
      () => {
        this.expiryTimers.delete(socket);
        this.scheduleExpiry(socket);
      },
      Math.min(remaining, MAX_TIMER_DELAY_MS),
    );

    this.expiryTimers.set(socket, timer);
  }

  private expire(socket: RealtimeSocket): void {
    const payload: SessionExpiredPayload = {
      code: ERROR_CODES.TOKEN_EXPIRED,
      message: EXPIRED_SESSION_MESSAGE,
    };

    try {
      socket.emit(SESSION_EXPIRED_EVENT, payload);
      this.logger.debug(`Access token caducado: se cierra el socket ${socket.id}`);
    } catch (error) {
      // Aunque el aviso no salga, la conexión tiene que cerrarse: el token ya no vale.
      this.logger.error(
        'No se pudo avisar de la caducidad del access token',
        error instanceof Error ? error.stack : String(error),
      );
    }

    socket.disconnect(true);
  }

  /** Lanza `RealtimeHandshakeError`; el middleware lo entrega como `connect_error`. */
  private async authenticate(socket: RealtimeSocket): Promise<void> {
    this.assertAllowedOrigin(socket.handshake.headers.origin);

    const token = readCookie(socket.handshake.headers.cookie, ACCESS_TOKEN_COOKIE);
    const verification = await this.tokens.verifyAccessToken(token);

    switch (verification.status) {
      case 'valid':
        socket.data.user = { id: verification.userId, familyId: verification.familyId };
        socket.data.expiresAt = verification.expiresAt.getTime();
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
