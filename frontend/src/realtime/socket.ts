'use client';

import {
  ERROR_CODES,
  REALTIME_NAMESPACE,
  SESSION_EXPIRED_EVENT,
  SOCKET_EVENTS,
  type ImportFailedPayload,
  type ImportFinishedPayload,
  type MealPlanUpdatedPayload,
  type SessionExpiredPayload,
  type ShoppingItemUpdatedPayload,
  type ShoppingListRegeneratedPayload,
} from '@recipe-planner/contracts';
import { io, type Socket } from 'socket.io-client';
import { refreshSession } from '@/lib/api-client';

/**
 * Eventos que el gateway envía al navegador. Se declaran aquí porque `packages/contracts`
 * comparte nombres y cargas útiles, pero no los tipos de Socket.IO (eso obligaría a meter
 * `socket.io` en el contrato).
 */
interface RealtimeServerEvents {
  [SESSION_EXPIRED_EVENT]: (payload: SessionExpiredPayload) => void;
  [SOCKET_EVENTS.shoppingItemUpdated]: (payload: ShoppingItemUpdatedPayload) => void;
  [SOCKET_EVENTS.shoppingListRegenerated]: (payload: ShoppingListRegeneratedPayload) => void;
  [SOCKET_EVENTS.mealPlanUpdated]: (payload: MealPlanUpdatedPayload) => void;
  [SOCKET_EVENTS.importFinished]: (payload: ImportFinishedPayload) => void;
  [SOCKET_EVENTS.importFailed]: (payload: ImportFailedPayload) => void;
}

export type RealtimeSocket = Socket<RealtimeServerEvents>;

interface RealtimeState {
  socket: RealtimeSocket;
  /** Componentes montados que usan la conexión compartida. */
  references: number;
}

let state: RealtimeState | null = null;
/** Un único refresh en vuelo aunque caduque el token y lleguen varios avisos a la vez. */
let sessionRefresh: Promise<boolean> | null = null;

function reconnectIfActive(socket: RealtimeSocket): void {
  // La conexión pudo cerrarse mientras se refrescaba (el último consumidor se desmontó).
  if (state?.socket === socket && !socket.connected) {
    socket.connect();
  }
}

/**
 * Renueva la sesión y vuelve a conectar con la cookie nueva.
 *
 * El servidor emite `session.expired` justo antes de cortar el socket cuando el access token
 * caduca y, si la caducidad ocurre en el handshake, el rechazo llega como `connect_error`
 * con `TOKEN_EXPIRED`. En ambos casos hay que renovar antes de reconectar: reconectar con el
 * token viejo solo repetiría el error.
 */
async function recoverSession(socket: RealtimeSocket): Promise<void> {
  sessionRefresh ??= refreshSession().finally(() => {
    sessionRefresh = null;
  });

  if (await sessionRefresh) {
    reconnectIfActive(socket);
  }
}

function hasExpiredToken(error: Error): boolean {
  const data = (error as Error & { data?: { code?: string } }).data;

  return data?.code === ERROR_CODES.TOKEN_EXPIRED;
}

/**
 * Origen público de la API para el navegador.
 *
 * En producción Caddy sirve Next, `/api` y `/socket.io` desde el mismo origen, así que la
 * variable queda vacía y `io()` usa el origen de la página. En desarrollo la API está en
 * `:3000` y el handshake de Socket.IO no puede pasar por el rewrite de Next (se pierde la
 * barra final de `/socket.io/`), por eso se configura `NEXT_PUBLIC_API_URL`.
 */
function realtimeEndpoint(): string | undefined {
  const base = process.env.NEXT_PUBLIC_API_URL?.trim().replace(/\/+$/, '');

  return base === undefined || base === '' ? undefined : `${base}${REALTIME_NAMESPACE}`;
}

function createSocket(): RealtimeSocket {
  const socket: RealtimeSocket = io(realtimeEndpoint(), {
    // Las cookies `httpOnly` de la sesión viajan en el handshake.
    withCredentials: true,
    // La conexión se abre solo cuando hay un consumidor (`acquireRealtime`).
    autoConnect: false,
  });

  socket.on(SESSION_EXPIRED_EVENT, () => {
    void recoverSession(socket);
  });

  socket.on('connect_error', (error) => {
    if (hasExpiredToken(error)) {
      void recoverSession(socket);
    }
  });

  return socket;
}

/**
 * Toma prestada la conexión compartida del namespace `/realtime`.
 *
 * Hay una sola conexión por pestaña y se abre en la primera llamada; cada consumidor debe
 * llamar a `releaseRealtime()` al desmontarse. La conexión se cierra cuando el contador llega
 * a cero, para que las páginas que no usan tiempo real no mantengan un socket abierto.
 */
export function acquireRealtime(): RealtimeSocket {
  state ??= { socket: createSocket(), references: 0 };
  state.references += 1;

  if (!state.socket.connected) {
    state.socket.connect();
  }

  return state.socket;
}

/** Suelta una referencia; la última cierra y descarta la conexión. */
export function releaseRealtime(): void {
  if (state === null) {
    return;
  }

  state.references -= 1;

  if (state.references > 0) {
    return;
  }

  const { socket } = state;

  state = null;
  socket.removeAllListeners();
  socket.disconnect();
}

/** Conexión actual, si hay algún consumidor; `null` en el servidor y sin referencias. */
export function getRealtimeSocket(): RealtimeSocket | null {
  return state?.socket ?? null;
}
