'use client';

import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import {
  SOCKET_EVENTS,
  type ShoppingItemUpdatedPayload,
  type ShoppingListRegeneratedPayload,
} from '@recipe-planner/contracts';
import { useEffect } from 'react';
import { applyShoppingItemUpdate, shoppingListQueryKey } from '@/lib/shopping-cache';
import type { ShoppingListResponse } from '@/lib/shopping';
import { acquireRealtime, releaseRealtime, type RealtimeSocket } from './socket';

export interface ShoppingListSubscription {
  socket: RealtimeSocket;
  queryClient: QueryClient;
  householdId: string;
  weekStart: string;
}

/**
 * Suscribe la caché de una lista a los eventos del hogar.
 *
 * Se separa del hook para poder probar la aplicación de eventos y la invalidación con un
 * socket falso, sin montar React. Devuelve la función que quita los listeners.
 *
 * - `shopping.item.updated` se aplica con `setQueryData`: los demás ven el ítem marcado y
 *   quién lo hizo sin volver a pedir la lista.
 * - `shopping.list.regenerated` invalida la query porque el servidor puede haber añadido,
 *   quitado o cambiado ítems del plan, y reconstruir eso en el cliente duplicaría las reglas
 *   del generador.
 * - Al reconectar se invalida, porque los eventos que ocurrieron mientras el socket estaba
 *   caído se perdieron. La primera conexión no invalida: los datos acaban de llegar del
 *   servidor y otra petición solo repetiría trabajo.
 */
export function subscribeToShoppingList({
  socket,
  queryClient,
  householdId,
  weekStart,
}: ShoppingListSubscription): () => void {
  const queryKey = shoppingListQueryKey(householdId, weekStart);
  let connectedBefore = socket.connected;

  const invalidate = (): void => {
    void queryClient.invalidateQueries({ queryKey });
  };

  const isCurrentWeek = (payload: { householdId: string; weekStart: string }): boolean =>
    payload.householdId === householdId && payload.weekStart === weekStart;

  const onItemUpdated = (payload: ShoppingItemUpdatedPayload): void => {
    if (!isCurrentWeek(payload)) {
      return;
    }

    queryClient.setQueryData<ShoppingListResponse>(queryKey, (list) =>
      list === undefined ? list : applyShoppingItemUpdate(list, payload),
    );
  };

  const onListRegenerated = (payload: ShoppingListRegeneratedPayload): void => {
    if (isCurrentWeek(payload)) {
      invalidate();
    }
  };

  const onConnect = (): void => {
    if (connectedBefore) {
      invalidate();
    }

    connectedBefore = true;
  };

  socket.on(SOCKET_EVENTS.shoppingItemUpdated, onItemUpdated);
  socket.on(SOCKET_EVENTS.shoppingListRegenerated, onListRegenerated);
  socket.on('connect', onConnect);

  return () => {
    socket.off(SOCKET_EVENTS.shoppingItemUpdated, onItemUpdated);
    socket.off(SOCKET_EVENTS.shoppingListRegenerated, onListRegenerated);
    socket.off('connect', onConnect);
  };
}

/** Mantiene la lista de la compra de la semana al día mientras el componente está montado. */
export function useShoppingListRealtime(householdId: string, weekStart: string): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    const socket = acquireRealtime();
    const unsubscribe = subscribeToShoppingList({
      socket,
      queryClient,
      householdId,
      weekStart,
    });

    return () => {
      unsubscribe();
      releaseRealtime();
    };
  }, [householdId, weekStart, queryClient]);
}
