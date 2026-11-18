'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import {
  checkerName,
  formatQuantity,
  groupByAisle,
  type MemberNames,
  type ShoppingItem,
  type ShoppingListResponse,
} from '@/lib/shopping';
import { shoppingListQueryKey } from '@/lib/shopping-cache';
import { generateShoppingList, setShoppingItemChecked } from '@/lib/shopping-api';
import { useShoppingListRealtime } from '@/realtime/use-shopping-list';
import { currentWeekStart, formatWeekRange, shiftWeek, type WeekStart } from '@/lib/week';

interface ShoppingListProps {
  householdId: string;
  weekStart: WeekStart;
  initialList: ShoppingListResponse;
  /** Usuario de la sesión, para marcar sus propios cambios como «tú». */
  currentUserId: string;
  /** Id de miembro → nombre visible, para resolver la autoría de la lista cargada. */
  memberNames: MemberNames;
}

interface ToggleVariables {
  itemId: string;
  checked: boolean;
}

interface ToggleContext {
  previous: ShoppingListResponse | undefined;
}

/**
 * Lista de la compra de la semana, agrupada por pasillo.
 *
 * Marcar es optimista: el ítem cambia en la caché antes de que responda la API y, si la
 * petición falla, `onError` restaura la lista anterior. La respuesta trae la lista completa,
 * así que al confirmar se sustituye la caché por la versión del servidor.
 *
 * Además escucha los eventos del hogar: los cambios de los demás se aplican a la misma caché
 * y una regeneración o una reconexión fuerzan volver a pedir la lista.
 */
export function ShoppingList({
  householdId,
  weekStart,
  initialList,
  currentUserId,
  memberNames,
}: ShoppingListProps) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const queryKey = shoppingListQueryKey(householdId, weekStart);

  useShoppingListRealtime(householdId, weekStart);

  const listQuery = useQuery({
    queryKey,
    queryFn: () => generateShoppingList(householdId, weekStart),
    initialData: initialList,
    // El `queryFn` regenera la lista: no se refresca sola, solo cuando se invalide a propósito.
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });

  const toggleMutation = useMutation<ShoppingListResponse, Error, ToggleVariables, ToggleContext>({
    mutationFn: (variables) =>
      setShoppingItemChecked(householdId, weekStart, variables.itemId, variables.checked),
    onMutate: async (variables) => {
      setError(null);
      await queryClient.cancelQueries({ queryKey });

      const previous = queryClient.getQueryData<ShoppingListResponse>(queryKey);

      queryClient.setQueryData<ShoppingListResponse>(queryKey, (list) =>
        list === undefined
          ? list
          : {
              ...list,
              items: list.items.map((item) =>
                item._id === variables.itemId
                  ? {
                      ...item,
                      checked: variables.checked,
                      checkedBy: variables.checked ? currentUserId : null,
                      checkedByName: variables.checked
                        ? (memberNames[currentUserId] ?? null)
                        : null,
                    }
                  : item,
              ),
            },
      );

      return { previous };
    },
    onError: (mutationError, _variables, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(queryKey, context.previous);
      }

      setError(
        mutationError instanceof Error
          ? mutationError.message
          : 'No se pudo actualizar el ítem de la lista',
      );
    },
    onSuccess: (list) => {
      queryClient.setQueryData(queryKey, list);
    },
  });

  const list = listQuery.data;
  const groups = groupByAisle(list.items);
  const total = list.items.length;
  const done = list.items.filter((item) => item.checked).length;
  const percent = total === 0 ? 0 : Math.round((done / total) * 100);
  const thisWeek = currentWeekStart();
  const pendingItemId = toggleMutation.isPending ? toggleMutation.variables.itemId : undefined;

  return (
    <div>
      <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-pepper-400">
            Lista de la compra
          </p>
          <h1 className="font-serif text-2xl text-pepper-900 sm:text-3xl">
            {formatWeekRange(weekStart)}
          </h1>
        </div>

        <nav className="flex items-center gap-2" aria-label="Navegación entre semanas">
          <Link
            href={`/shopping/${shiftWeek(weekStart, -1)}`}
            aria-label="Semana anterior"
            className="rounded-lg border border-flour-400 px-3 py-2 text-sm text-pepper-600 hover:bg-flour-100"
          >
            ←
          </Link>
          <Link
            href={`/shopping/${thisWeek}`}
            aria-current={weekStart === thisWeek ? 'page' : undefined}
            className="rounded-lg border border-flour-400 px-3 py-2 text-sm font-medium text-pepper-600 hover:bg-flour-100 aria-[current=page]:border-basil-500 aria-[current=page]:bg-basil-50 aria-[current=page]:text-basil-700"
          >
            Esta semana
          </Link>
          <Link
            href={`/shopping/${shiftWeek(weekStart, 1)}`}
            aria-label="Semana siguiente"
            className="rounded-lg border border-flour-400 px-3 py-2 text-sm text-pepper-600 hover:bg-flour-100"
          >
            →
          </Link>
        </nav>
      </header>

      {error !== null && (
        <div
          role="alert"
          className="mb-4 flex items-center justify-between gap-4 rounded-lg border border-tomato-300 bg-tomato-50 px-3 py-2 text-sm text-tomato-700"
        >
          <span>{error}</span>
          <button
            type="button"
            onClick={() => {
              setError(null);
            }}
            className="font-medium underline"
          >
            Descartar
          </button>
        </div>
      )}

      <div className="mb-6">
        <div className="mb-1 flex items-center justify-between text-sm text-pepper-500">
          <span>
            {done} de {total} {total === 1 ? 'producto' : 'productos'}
          </span>
          <span>{percent}%</span>
        </div>
        <div
          className="h-2 overflow-hidden rounded-full bg-flour-300"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={done}
          aria-label="Productos marcados"
        >
          <div
            className="h-full rounded-full bg-basil-500 transition-[width]"
            style={{ width: `${String(percent)}%` }}
          />
        </div>
      </div>

      {total === 0 ? (
        <p className="rounded-2xl border border-dashed border-flour-400 bg-white p-6 text-sm text-pepper-500">
          La lista está vacía. Añade recetas al{' '}
          <Link href={`/plan/${weekStart}`} className="font-medium text-basil-700 underline">
            plan de la semana
          </Link>{' '}
          y vuelve a abrirla para generarla.
        </p>
      ) : (
        <div className="space-y-6">
          {groups.map((group) => (
            <section key={group.id} aria-labelledby={`aisle-${group.id}`}>
              <h2
                id={`aisle-${group.id}`}
                className="mb-2 flex items-baseline gap-2 font-serif text-lg text-pepper-800"
              >
                {group.label}
                <span className="text-xs font-sans font-normal text-pepper-400">
                  {group.items.length}
                </span>
              </h2>

              <ul className="space-y-2">
                {group.items.map((item) => (
                  <li key={item._id}>
                    <ItemButton
                      item={item}
                      pending={pendingItemId === item._id}
                      currentUserId={currentUserId}
                      memberNames={memberNames}
                      onToggle={() => {
                        toggleMutation.mutate({ itemId: item._id, checked: !item.checked });
                      }}
                    />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

interface ItemButtonProps {
  item: ShoppingItem;
  pending: boolean;
  currentUserId: string;
  memberNames: MemberNames;
  onToggle: () => void;
}

/**
 * El ítem entero es el botón de marcar: 48 px de alto y toda la fila como área táctil, que es
 * lo que se usa con el móvil en la mano dentro del supermercado.
 */
function ItemButton({ item, pending, currentUserId, memberNames, onToggle }: ItemButtonProps) {
  const marker = checkerName(item, memberNames);
  const markedBySelf = marker !== null && item.checkedBy === currentUserId;

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={item.checked}
      className={`flex min-h-12 w-full items-center gap-3 rounded-xl border px-3 py-2 text-left transition-colors ${
        item.checked
          ? 'border-basil-100 bg-basil-50/70 text-pepper-400'
          : 'border-flour-300 bg-white text-pepper-800 hover:border-basil-300 hover:bg-basil-50/40'
      } ${pending ? 'opacity-60' : ''}`}
    >
      <span
        aria-hidden
        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-sm ${
          item.checked
            ? 'border-basil-500 bg-basil-500 text-white'
            : 'border-flour-400 bg-flour-50 text-transparent'
        }`}
      >
        ✓
      </span>

      <span className="min-w-0 flex-1">
        <span className={`block text-sm font-medium ${item.checked ? 'line-through' : ''}`}>
          {item.name}
        </span>
        {marker !== null && (
          <span className="block text-xs text-pepper-400">
            {markedBySelf ? 'Lo marcaste tú' : `Marcado por ${marker}`}
          </span>
        )}
      </span>

      <span className="shrink-0 text-xs tabular-nums text-pepper-500">
        {formatQuantity(item.quantity, item.unit)}
      </span>
    </button>
  );
}
