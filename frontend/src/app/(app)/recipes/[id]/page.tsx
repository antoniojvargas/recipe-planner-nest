import { requireHousehold } from '@/server/households';
import { loadRecipe } from '@/server/recipe-data';
import { CookingTrigger } from './cooking-trigger';

// Datos de la sesión: nunca se sirven desde una caché compartida entre usuarios.
export const dynamic = 'force-dynamic';

interface RecipeDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function RecipeDetailPage({ params }: RecipeDetailPageProps) {
  const { id } = await params;
  const household = await requireHousehold();
  const recipe = await loadRecipe(household.id, id);

  return (
    <section className="mx-auto max-w-3xl p-4 sm:p-6">
      <header className="mb-8">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-pepper-500">Receta</p>
        <h1 className="font-serif text-2xl text-pepper-900 sm:text-3xl">{recipe.title}</h1>
        <p className="mt-1 text-sm text-pepper-500">{recipe.servings} raciones</p>
        <CookingTrigger title={recipe.title} steps={recipe.steps} />
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
    </section>
  );
}
