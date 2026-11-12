/**
 * Nombres y cargas útiles de los eventos de Socket.IO.
 *
 * El servidor los emite desde `RealtimePublisher` y el cliente los consume en el namespace
 * `/realtime`. La forma de la carga útil se comparte aquí para que emisor y receptor no se
 * desincronicen; el transporte y la autorización viven en el backend.
 */

import type { Unit } from './units.js';

export const REALTIME_NAMESPACE = '/realtime';

export const SOCKET_EVENTS = {
  shoppingItemUpdated: 'shopping.item.updated',
  shoppingListRegenerated: 'shopping.list.regenerated',
  mealPlanUpdated: 'meal-plan.updated',
  importFinished: 'import.finished',
  importFailed: 'import.failed',
} as const;

export type SocketEventName = (typeof SOCKET_EVENTS)[keyof typeof SOCKET_EVENTS];

/** Identificación mínima de un miembro del hogar en los eventos. */
export interface MemberRef {
  userId: string;
  displayName: string;
}

/** Fecha del lunes de la semana del plan o de la lista, en formato `YYYY-MM-DD`. */
export type WeekStart = string;

export type MealSlot = 'breakfast' | 'lunch' | 'dinner';

export interface ShoppingItemUpdatedPayload {
  householdId: string;
  weekStart: WeekStart;
  itemId: string;
  /** Estado tras el cambio, para que el cliente no tenga que deducirlo. */
  checked: boolean;
  /** Quién marcó el ítem, o `null` si se desmarcó. */
  checkedBy: MemberRef | null;
  quantity: number;
  unit: Unit;
  /** Versión del documento tras el cambio. */
  version: number;
}

export interface ShoppingListRegeneratedPayload {
  householdId: string;
  weekStart: WeekStart;
  version: number;
}

export interface MealPlanUpdatedPayload {
  householdId: string;
  weekStart: WeekStart;
  /** Huecos del plan que cambiaron. */
  slots: {
    day: 0 | 1 | 2 | 3 | 4 | 5 | 6;
    meal: MealSlot;
    recipeId: string | null;
    servings: number;
  }[];
}

export interface ImportFinishedPayload {
  householdId: string;
  importId: string;
  recipeId: string;
}

export interface ImportFailedPayload {
  householdId: string;
  importId: string;
  /** Código de error de `ERROR_CODES`, p. ej. `IMPORT_FAILED`. */
  code: string;
  message: string;
}

export interface SocketEventPayloads {
  [SOCKET_EVENTS.shoppingItemUpdated]: ShoppingItemUpdatedPayload;
  [SOCKET_EVENTS.shoppingListRegenerated]: ShoppingListRegeneratedPayload;
  [SOCKET_EVENTS.mealPlanUpdated]: MealPlanUpdatedPayload;
  [SOCKET_EVENTS.importFinished]: ImportFinishedPayload;
  [SOCKET_EVENTS.importFailed]: ImportFailedPayload;
}

export type SocketEventPayload<E extends SocketEventName> = SocketEventPayloads[E];
