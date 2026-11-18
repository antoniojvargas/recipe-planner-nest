'use client';

import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { searchRecipes } from '@/lib/meal-plan-api';
import type { RecipeSummary } from '@/lib/meal-plan';
import { useDebouncedValue } from '@/lib/use-debounced-value';

interface RecipePickerProps {
  householdId: string;
  /** Contexto del hueco que se está rellenando, para el título y las etiquetas accesibles. */
  dayLabel: string;
  mealLabel: string;
  /** Primeras recetas del hogar: la lista no aparece vacía antes de escribir. */
  initialRecipes: RecipeSummary[];
  onSelect: (recipe: RecipeSummary) => void;
  onClose: () => void;
}

/**
 * Selector de receta de un hueco del plan.
 *
 * Busca contra la API con `?q=` (título, etiquetas e ingredientes) en lugar de filtrar una
 * lista descargada: el recetario puede tener muchas páginas y solo se piden 20 por búsqueda.
 */
export function RecipePicker({
  householdId,
  dayLabel,
  mealLabel,
  initialRecipes,
  onSelect,
  onClose,
}: RecipePickerProps) {
  const [term, setTerm] = useState('');
  const debouncedTerm = useDebouncedValue(term);
  const inputRef = useRef<HTMLInputElement>(null);
  const titleId = 'recipe-picker-title';

  const { data, error, isFetching } = useQuery({
    queryKey: ['recipe-search', householdId, debouncedTerm],
    queryFn: () => searchRecipes(householdId, debouncedTerm),
    // Sin texto se reutilizan las recetas que ya trajo el servidor; con texto, la API busca.
    initialData: debouncedTerm === '' ? initialRecipes : undefined,
    staleTime: 30_000,
  });

  useEffect(() => {
    inputRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        onClose();
      }
    }

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  const recipes = data ?? [];

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-pepper-900/40 sm:items-center sm:p-6"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-t-2xl bg-white shadow-xl sm:rounded-2xl"
      >
        <div className="flex items-start justify-between gap-4 border-b border-flour-300 p-4">
          <div>
            <h2 id={titleId} className="font-serif text-lg text-pepper-900">
              Elegir receta
            </h2>
            <p className="text-sm text-pepper-500">
              {dayLabel} · {mealLabel}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-pepper-500 hover:bg-flour-200 hover:text-pepper-800"
            aria-label="Cerrar selector de recetas"
          >
            ✕
          </button>
        </div>

        <div className="p-4">
          <label htmlFor="recipe-search" className="sr-only">
            Buscar receta
          </label>
          <input
            ref={inputRef}
            id="recipe-search"
            type="search"
            value={term}
            onChange={(event) => {
              setTerm(event.target.value);
            }}
            placeholder="Buscar por título, etiqueta o ingrediente…"
            autoComplete="off"
            className="w-full rounded-lg border border-flour-400 bg-flour-50 px-3 py-2 text-pepper-900 placeholder:text-pepper-300 focus:border-basil-500 focus:outline-none focus:ring-2 focus:ring-basil-100"
          />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
          {error !== null && (
            <p role="alert" className="px-2 py-4 text-sm text-tomato-600">
              {error.message}
            </p>
          )}

          {error === null && isFetching && recipes.length === 0 && (
            <p className="px-2 py-4 text-sm text-pepper-400">Buscando recetas…</p>
          )}

          {error === null && !isFetching && recipes.length === 0 && (
            <p className="px-2 py-4 text-sm text-pepper-400">
              {term.trim() === ''
                ? 'Todavía no hay recetas en este hogar.'
                : `Ninguna receta coincide con “${term.trim()}”.`}
            </p>
          )}

          <ul className="space-y-1">
            {recipes.map((recipe) => (
              <li key={recipe.id}>
                <button
                  type="button"
                  onClick={() => {
                    onSelect(recipe);
                  }}
                  className="flex w-full items-center justify-between gap-3 rounded-lg px-2 py-2 text-left hover:bg-flour-100 focus:bg-flour-100 focus:outline-none"
                >
                  <span className="line-clamp-2 text-sm font-medium text-pepper-800">
                    {recipe.title}
                  </span>
                  <span className="shrink-0 text-xs text-pepper-400">{recipe.servings} rac.</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
