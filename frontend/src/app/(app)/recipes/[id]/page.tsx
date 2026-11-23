'use client';

import { useParams } from 'next/navigation';
import { useRef, useState } from 'react';
import { CookingMode } from './cooking-mode';

interface Recipe {
  id: string;
  title: string;
  servings: number;
  ingredients: { name: string; quantity: number; unit: string }[];
  steps: { text: string }[];
}

export default function RecipeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [cooking, setCooking] = useState(false);
  const cookingButtonRef = useRef<HTMLButtonElement>(null);

  // Datos simulados - en producción haría una llamada API
  const recipe: Recipe = {
    id,
    title: 'Receta de ejemplo',
    servings: 4,
    ingredients: [
      { name: 'Arroz', quantity: 200, unit: 'g' },
      { name: 'Pollo', quantity: 300, unit: 'g' },
    ],
    steps: [{ text: 'Cortar las verduras' }, { text: 'Cocinar el pollo' }],
  };

  function closeCooking(): void {
    setCooking(false);
    cookingButtonRef.current?.focus();
  }

  return (
    <section className="mx-auto max-w-3xl p-4 sm:p-6">
      <header className="mb-8">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-pepper-500">Receta</p>
        <h1 className="font-serif text-2xl text-pepper-900 sm:text-3xl">{recipe.title}</h1>
        <p className="mt-1 text-sm text-pepper-500">{recipe.servings} raciones</p>
        <button
          ref={cookingButtonRef}
          type="button"
          onClick={() => {
            setCooking(true);
          }}
          className="mt-4 inline-flex min-h-12 items-center rounded-xl bg-basil-600 px-5 text-base font-medium text-white hover:bg-basil-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-basil-300 focus-visible:ring-offset-2"
        >
          Modo cocina
        </button>
      </header>

      <h2 className="mb-2 font-serif text-lg text-pepper-800">Ingredientes</h2>
      <ul className="mb-8 space-y-2">
        {recipe.ingredients.map((ingredient) => (
          <li
            key={ingredient.name}
            className="flex justify-between gap-4 rounded-lg border border-flour-300 bg-white px-4 py-3 text-sm text-pepper-800"
          >
            <span>{ingredient.name}</span>
            <span className="tabular-nums text-pepper-500">
              {ingredient.quantity} {ingredient.unit}
            </span>
          </li>
        ))}
      </ul>

      <h2 className="mb-2 font-serif text-lg text-pepper-800">Pasos</h2>
      <ol className="space-y-2">
        {recipe.steps.map((step, index) => (
          <li
            key={step.text}
            className="rounded-lg border border-flour-300 bg-white px-4 py-3 text-sm text-pepper-800"
          >
            <span className="mr-2 font-medium text-basil-700">{String(index + 1)}.</span>
            {step.text}
          </li>
        ))}
      </ol>

      {cooking && <CookingMode title={recipe.title} steps={recipe.steps} onClose={closeCooking} />}
    </section>
  );
}
