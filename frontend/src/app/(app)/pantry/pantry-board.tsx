'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { UNITS_LIST, type Unit } from '@recipe-planner/contracts';
import { useEffect, useRef, useState, type SyntheticEvent } from 'react';
import {
  displayPantryName,
  mergePantryItem,
  normalizePantryName,
  pantryQueryKey,
  parseQuantityInput,
  removePantryItem,
  type PantryItem,
} from '@/lib/pantry';
import { deletePantryItem, fetchPantry, upsertPantryItem } from '@/lib/pantry-api';
import { UNIT_LABELS } from '@/lib/shopping';

interface PantryBoardProps {
  householdId: string;
  initialItems: PantryItem[];
}

interface UpsertContext {
  previous: PantryItem[] | undefined;
}

interface DeleteContext {
  previous: PantryItem[] | undefined;
}

const DEFAULT_QUANTITY = '1';

/**
 * Despensa del hogar: alta rápida arriba y edición en línea en cada fila.
 *
 * El nombre identifica al artículo porque la API hace `upsert` por nombre normalizado: añadir
 * algo que ya existe actualiza su cantidad y unidad. Las escrituras son optimistas (la caché
 * cambia antes de la respuesta) y `onError` restaura la lista anterior si la API falla.
 */
export function PantryBoard({ householdId, initialItems }: PantryBoardProps) {
  const queryClient = useQueryClient();
  const queryKey = pantryQueryKey(householdId);

  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState(DEFAULT_QUANTITY);
  const [unit, setUnit] = useState<Unit>('unit');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  const pantryQuery = useQuery({
    queryKey,
    queryFn: () => fetchPantry(householdId),
    initialData: initialItems,
    // La caché se mantiene a mano con las respuestas de los `upsert` y los borrados.
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });

  const upsertMutation = useMutation<PantryItem, Error, PantryItem, UpsertContext>({
    mutationFn: (item) => upsertPantryItem(householdId, item),
    onMutate: async (item) => {
      setNotice(null);
      await queryClient.cancelQueries({ queryKey });

      const previous = queryClient.getQueryData<PantryItem[]>(queryKey);

      queryClient.setQueryData<PantryItem[]>(queryKey, (items) =>
        items === undefined ? items : mergePantryItem(items, item),
      );

      return { previous };
    },
    onError: (mutationError, _item, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(queryKey, context.previous);
      }

      setError(
        mutationError instanceof Error
          ? mutationError.message
          : 'No se pudo guardar el artículo de la despensa',
      );
    },
    onSuccess: (saved) => {
      queryClient.setQueryData<PantryItem[]>(queryKey, (items) =>
        items === undefined ? items : mergePantryItem(items, saved),
      );
    },
  });

  const deleteMutation = useMutation<boolean, Error, string, DeleteContext>({
    mutationFn: (itemName) => deletePantryItem(householdId, itemName),
    onMutate: async (itemName) => {
      setNotice(null);
      await queryClient.cancelQueries({ queryKey });

      const previous = queryClient.getQueryData<PantryItem[]>(queryKey);

      queryClient.setQueryData<PantryItem[]>(queryKey, (items) =>
        items === undefined ? items : removePantryItem(items, itemName),
      );

      return { previous };
    },
    onError: (mutationError, _itemName, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(queryKey, context.previous);
      }

      setError(
        mutationError instanceof Error
          ? mutationError.message
          : 'No se pudo quitar el artículo de la despensa',
      );
    },
  });

  const items = pantryQuery.data;
  const pendingUpsertName = upsertMutation.isPending
    ? normalizePantryName(upsertMutation.variables.name)
    : undefined;
  const pendingDeleteName = deleteMutation.isPending
    ? normalizePantryName(deleteMutation.variables)
    : undefined;

  function handleSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);

    const trimmedName = name.trim();

    if (trimmedName === '') {
      setError('Escribe el nombre del producto antes de añadirlo.');
      nameRef.current?.focus();
      return;
    }

    const parsedQuantity = parseQuantityInput(quantity);

    if (parsedQuantity === null) {
      setError('La cantidad tiene que ser un número mayor o igual que cero.');
      return;
    }

    const normalized = normalizePantryName(trimmedName);

    if (items.some((item) => normalizePantryName(item.name) === normalized)) {
      setNotice(`«${trimmedName}» ya estaba: se ha actualizado su cantidad.`);
    }

    upsertMutation.mutate(
      { name: normalized, quantity: parsedQuantity, unit },
      {
        onSuccess: () => {
          setName('');
          setQuantity(DEFAULT_QUANTITY);
          nameRef.current?.focus();
        },
      },
    );
  }

  return (
    <div>
      <header className="mb-6">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-pepper-500">Despensa</p>
        <h1 className="font-serif text-2xl text-pepper-900 sm:text-3xl">Lo que hay en casa</h1>
        <p className="mt-1 max-w-prose text-sm text-pepper-500">
          Lo que apuntes aquí no se compra: la lista de la semana descuenta estas cantidades.
        </p>
      </header>

      <form
        onSubmit={handleSubmit}
        className="mb-6 rounded-2xl border border-flour-300 bg-white p-4 shadow-sm"
      >
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_7rem_10rem]">
          <div>
            <label htmlFor="pantry-name" className="mb-1 block text-xs font-medium text-pepper-500">
              Producto
            </label>
            <input
              ref={nameRef}
              id="pantry-name"
              value={name}
              onChange={(event) => {
                setName(event.target.value);
              }}
              placeholder="Arroz, leche, tomates…"
              autoComplete="off"
              className="h-12 w-full rounded-lg border border-flour-400 bg-flour-50 px-3 text-sm text-pepper-800 placeholder:text-pepper-300 focus:border-basil-500 focus:outline-none focus:ring-2 focus:ring-basil-100"
            />
          </div>

          <div>
            <label
              htmlFor="pantry-quantity"
              className="mb-1 block text-xs font-medium text-pepper-500"
            >
              Cantidad
            </label>
            <input
              id="pantry-quantity"
              value={quantity}
              onChange={(event) => {
                setQuantity(event.target.value);
              }}
              inputMode="decimal"
              autoComplete="off"
              className="h-12 w-full rounded-lg border border-flour-400 bg-flour-50 px-3 text-sm tabular-nums text-pepper-800 focus:border-basil-500 focus:outline-none focus:ring-2 focus:ring-basil-100"
            />
          </div>

          <div>
            <label htmlFor="pantry-unit" className="mb-1 block text-xs font-medium text-pepper-500">
              Unidad
            </label>
            <select
              id="pantry-unit"
              value={unit}
              onChange={(event) => {
                setUnit(event.target.value as Unit);
              }}
              className="h-12 w-full rounded-lg border border-flour-400 bg-flour-50 px-2 text-sm text-pepper-800 focus:border-basil-500 focus:outline-none focus:ring-2 focus:ring-basil-100"
            >
              {UNITS_LIST.map((option) => (
                <option key={option} value={option}>
                  {UNIT_LABELS[option]}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-pepper-500">
            Si el producto ya existe, se le actualiza la cantidad.
          </p>
          <button
            type="submit"
            className="min-h-12 rounded-lg bg-basil-600 px-5 text-sm font-medium text-white hover:bg-basil-700 focus:outline-none focus:ring-2 focus:ring-basil-300 focus:ring-offset-2 sm:w-auto"
          >
            Añadir a la despensa
          </button>
        </div>
      </form>

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

      {notice !== null && (
        <p
          role="status"
          className="mb-4 rounded-lg border border-basil-100 bg-basil-50 px-3 py-2 text-sm text-basil-700"
        >
          {notice}
        </p>
      )}

      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="font-serif text-lg text-pepper-800">En la despensa</h2>
        <span className="text-xs text-pepper-500">
          {items.length} {items.length === 1 ? 'producto' : 'productos'}
        </span>
      </div>

      {items.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-flour-400 bg-white p-6 text-sm text-pepper-500">
          Todavía no hay nada apuntado. Añade arriba lo que tengas en casa y la lista de la compra
          dejará de pedirlo.
        </p>
      ) : (
        <ul className="space-y-2">
          {items.map((item) => {
            const normalized = normalizePantryName(item.name);

            return (
              <li key={normalized}>
                <PantryRow
                  item={item}
                  saving={pendingUpsertName === normalized}
                  deleting={pendingDeleteName === normalized}
                  onSave={(next) => {
                    setError(null);
                    setNotice(null);
                    upsertMutation.mutate(next);
                  }}
                  onDelete={() => {
                    setError(null);
                    setNotice(null);
                    deleteMutation.mutate(item.name);
                  }}
                  onInvalidQuantity={() => {
                    setError(
                      `La cantidad de «${displayPantryName(item.name)}» tiene que ser un número mayor o igual que cero.`,
                    );
                  }}
                />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

interface PantryRowProps {
  item: PantryItem;
  saving: boolean;
  deleting: boolean;
  onSave: (item: PantryItem) => void;
  onDelete: () => void;
  onInvalidQuantity: () => void;
}

/**
 * Fila editable.
 *
 * La cantidad y la unidad se editan en el sitio; el nombre no se cambia porque es la clave del
 * `upsert`. Los borradores se confirman al salir del campo (o al elegir unidad) y Escape los
 * descarta. Borrar pide un segundo toque para no perder un artículo de un roce.
 */
function PantryRow({
  item,
  saving,
  deleting,
  onSave,
  onDelete,
  onInvalidQuantity,
}: PantryRowProps) {
  const [draftQuantity, setDraftQuantity] = useState(() => formatDraft(item.quantity));
  const [draftUnit, setDraftUnit] = useState<Unit>(item.unit);
  const [invalid, setInvalid] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  // Cuando llega la respuesta de la API (u otro cambio en la caché) el borrador se alinea.
  useEffect(() => {
    setDraftQuantity(formatDraft(item.quantity));
    setDraftUnit(item.unit);
    setInvalid(false);
  }, [item.quantity, item.unit]);

  function commit(nextQuantity: string, nextUnit: Unit) {
    const parsed = parseQuantityInput(nextQuantity);

    if (parsed === null) {
      setInvalid(true);
      onInvalidQuantity();
      return;
    }

    setInvalid(false);

    if (parsed === item.quantity && nextUnit === item.unit) {
      return;
    }

    onSave({ ...item, quantity: parsed, unit: nextUnit });
  }

  const busy = saving || deleting;
  const label = displayPantryName(item.name);

  return (
    <div
      className={`rounded-xl border border-flour-300 bg-white px-3 py-2 transition-opacity ${
        busy ? 'opacity-60' : ''
      }`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="min-w-0 flex-1 basis-40 truncate text-sm font-medium text-pepper-800">
          {label}
        </span>

        <input
          value={draftQuantity}
          onChange={(event) => {
            setDraftQuantity(event.target.value);
          }}
          onBlur={() => {
            commit(draftQuantity, draftUnit);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              event.currentTarget.blur();
            }

            if (event.key === 'Escape') {
              setDraftQuantity(formatDraft(item.quantity));
              setDraftUnit(item.unit);
              setInvalid(false);
              event.currentTarget.blur();
            }
          }}
          disabled={busy}
          inputMode="decimal"
          autoComplete="off"
          aria-label={`Cantidad de ${label}`}
          aria-invalid={invalid}
          className={`h-11 w-20 rounded-lg border bg-flour-50 px-2 text-right text-sm tabular-nums text-pepper-800 focus:outline-none focus:ring-2 ${
            invalid
              ? 'border-tomato-500 focus:border-tomato-500 focus:ring-tomato-100'
              : 'border-flour-400 focus:border-basil-500 focus:ring-basil-100'
          }`}
        />

        <select
          value={draftUnit}
          onChange={(event) => {
            const nextUnit = event.target.value as Unit;
            setDraftUnit(nextUnit);
            commit(draftQuantity, nextUnit);
          }}
          disabled={busy}
          aria-label={`Unidad de ${label}`}
          className="h-11 rounded-lg border border-flour-400 bg-flour-50 px-2 text-sm text-pepper-800 focus:border-basil-500 focus:outline-none focus:ring-2 focus:ring-basil-100"
        >
          {UNITS_LIST.map((option) => (
            <option key={option} value={option}>
              {UNIT_LABELS[option]}
            </option>
          ))}
        </select>

        {confirmingDelete ? (
          <span className="flex items-center gap-1">
            <button
              type="button"
              onClick={onDelete}
              disabled={busy}
              aria-label={`Confirmar que quieres quitar ${label}`}
              className="h-11 rounded-lg bg-tomato-600 px-3 text-xs font-medium text-white hover:bg-tomato-700 focus:outline-none focus:ring-2 focus:ring-tomato-300"
            >
              Quitar
            </button>
            <button
              type="button"
              onClick={() => {
                setConfirmingDelete(false);
              }}
              className="h-11 rounded-lg border border-flour-400 px-3 text-xs text-pepper-600 hover:bg-flour-100 focus:outline-none focus:ring-2 focus:ring-flour-400"
            >
              Cancelar
            </button>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => {
              setConfirmingDelete(true);
            }}
            disabled={busy}
            aria-label={`Quitar ${label} de la despensa`}
            className="h-11 rounded-lg px-3 text-xs text-pepper-500 hover:bg-flour-100 hover:text-tomato-600 focus:outline-none focus:ring-2 focus:ring-flour-400"
          >
            Quitar
          </button>
        )}
      </div>
    </div>
  );
}

/** La cantidad se edita como texto para admitir coma decimal y no perder lo que se escribe. */
function formatDraft(quantity: number): string {
  return String(quantity).replace('.', ',');
}
