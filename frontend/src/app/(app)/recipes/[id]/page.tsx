import { useState } from 'react';

interface Recipe {
  id: string;
  title: string;
  servings: number;
  ingredients: { name: string; quantity: number; unit: string }[];
  steps: { text: string }[];
}

export default function RecipeDetailPage({ params }: { params: { id: string } }) {
  const [recipe, setRecipe] = useState<Recipe | null>(null);

  // Datos simulados - en producción haría una llamada API
  const simulatedRecipe: Recipe = {
    id: params.id,
    title: 'Receta de ejemplo',
    servings: 4,
    ingredients: [
      { name: 'Arroz', quantity: 200, unit: 'g' },
      { name: 'Pollo', quantity: 300, unit: 'g' },
    ],
    steps: [{ text: 'Cortar las verduras' }, { text: 'Cocinar el pollo' }],
  };

  setRecipe(simulatedRecipe);

  if (!recipe) {
    return <div>Cargando...</div>;
  }

  return (
    <div>
      <h1>{recipe.title}</h1>
      <p>Servings: {recipe.servings}</p>
      <ul>
        {recipe.ingredients.map((ing) => (
          <li key={ing.name}>
            {ing.quantity} {ing.unit} {ing.name}
          </li>
        ))}
      </ul>
      <ol>
        {recipe.steps.map((step) => (
          <li key={step.text}>{step.text}</li>
        ))}
      </ol>
    </div>
  );
}
