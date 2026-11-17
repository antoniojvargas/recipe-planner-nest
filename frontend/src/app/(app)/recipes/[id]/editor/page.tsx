import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

const RecipeSchema = z.object({
  title: z.string().min(1).max(120),
  description: z.string().max(2000).optional(),
  servings: z.number().min(1),
  ingredients: z.array(
    z.object({
      name: z.string().min(1),
      quantity: z.number().min(0),
      unit: z.enum(['g', 'kg', 'ml', 'l', 'tsp', 'tbsp', 'cup', 'unit', 'pinch']),
    })
  ),
  steps: z.array(z.string().min(1)),
});

interface RecipeFormValues extends z.infer<typeof RecipeSchema> {
  newIngredientName: string;
  newIngredientUnit: string;
  newStepText: string;
}

export default function RecipeEditor({
  params,
}: {
  params: { id: string };
}) {
  const [recipe, setRecipe] = useState(null);
  const [isEditing, setIsEditing] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmiting },
    reset,
  } = useForm<z.infer<typeof RecipeSchema>>({
    mode: 'onBlur',
    reValidateOnBlur: true,
  });

  // Datos simulados - en producción harían una llamada API
  const simulatedRecipe: z.infer<typeof RecipeSchema> = {
    title: 'Receta de ejemplo',
    description: '',
    servings: 4,
    ingredients: [
      { name: 'Arroz', quantity: 200, unit: 'g' },
      { name: 'Pollo', quantity: 300, unit: 'g' },
    ],
    steps: ['Cortar las verduras', 'Cocinar el pollo'],
  };

  // Inicializar estado
  useEffect(() => {
    setRecipe(simulatedRecipe);
  }, []);

  const onSubmit = async (data: z.infer<typeof RecipeSchema>) => {
    try {
      // En producción, aquí llamaríamos a la API para guardar
      setIsEditing(false);
      reset();
    } catch (error) {
      console.error('Error al guardar:', error);
    }
  };

  // Unidades disponibles
  const unitsOptions = [
    { value: 'g', label: 'Gramos' },
    { value: 'kg', label: 'Kilogramos' },
    { value: 'ml', label: 'Mililitros' },
    { value: 'l', label: 'Litros' },
    { value: 'tsp', label: 'Cucharaditas' },
    { value: 'tbsp', label: 'Cucharadas' },
    { value: 'cup', label: 'Tazas' },
    { value: 'unit', label: 'Unidades' },
    { value: 'pinch', label: 'Pizca' },
  ];

  return (
    <section className="p-6 max-w-2xl mx-auto">
      <h2 className="text-2xl font-bold mb-6">Editor de Recetas</h2>

      <form
        onSubmit={handleSubmit(onSubmit)}
        className="bg-white rounded-lg shadow-xl p-6 space-y-6"
      >
        {/* Datos básicos */}
        <div>
          <label className="block text-sm font-medium mb-2">Título</label>
          <input
            {...register('title', { required: 'Required' })}
            defaultValue={simulatedRecipe.title}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-600"
            placeholder="Título de la receta"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">Descripción</label>
          <textarea
            {...register('description', { maxLength: 2000 })}
            defaultValue={simulatedRecipe.description}
            rows={3}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-600"
            placeholder="Descripción de la receta"
          />
        </div>

        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-500">Porciones</label>
          <input
            type="number"
            {...register('servings', { min: 1, valueAsNumber })}
            defaultValue={simulatedRecipe.servings}
            min={1}
            className="w-20 px-2 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-600"
          />
        </div>

        {/* Ingredientes */}
        <div>
          <label className="block text-sm font-medium mb-2">Ingredientes</label>
          <div className="mb-4">
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Nombre del ingrediente"
                className="flex-1 px-2 py-1 border rounded"
                aria-label="Nombre del ingrediente"
              />
              <select
                className="pl-2 py-1 border rounded w-24"
                aria-label="Unidad del ingrediente"
              >
                {unitsOptions.map((unit) => (
                  <option key={unit.value} value={unit.value}>
                    {unit.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="ml-2 text-xs bg-primary-600 text-white rounded px-2 py-1"
                aria-label="Agregar ingrediente"
              >
                +
              </button>
            </div>

            <div className="mt-4 space-y-2">
              {simulatedRecipe.ingredients.map((ing, idx) => (
                <div
                  key={idx}
                  className="flex items-baseline gap-2 border-b py-2 last:border-0"
                >
                  <select
                    className="pr-2 py-1 border rounded w-24"
                    aria-label="Unidad del ingrediente"
                >
                  {unitsOptions.map((unit) => (
                    <option key={unit.value} value={unit.value}>
                      {unit.label}
                    </option>
                  ))}
                </select>
                <span className="font-medium whitespace-nowrap">
                  {simulatedRecipe.ingredients[idx].quantity} {simulatedRecipe.ingredients[idx].unit} {simulatedRecipe.ingredients[idx].name}
                </span>
                <div className="flex gap-1">
                  <button
                    type="button"
                    className="text-xs text-red-500 hover:text-red-700"
                    aria-label="Quitar ingrediente"
                  >
                    -
                  </button>
                  <button
                    type="button"
                    className="text-xs text-blue-500 hover:text-blue-700"
                    aria-label="Mover ingrediente hacia arriba"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="text-xs text-blue-500 hover:text-blue-700"
                    aria-label="Mover ingrediente hacia abajo"
                  >
                    ↓
                  </button>
                </div>
              </div>
            ))}
          </div>

          <button
            type="button"
            className="mt-2 text-sm text-primary-600 hover:text-primary-700"
            aria-label="Agregar otro ingrediente"
          >
            Agregar otro ingrediente
          </button>
        </div>

        {/* Pasos */}
        <div>
          <label className="block text-sm font-medium mb-2">Pasos de preparación</label>
          <div className="mb-4">
            <input
              type="text"
              placeholder="Describe un paso de la receta"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-600"
              aria-label="Paso de la receta"
            />
            <button
              type="button"
              className="ml-2 text-xs bg-primary-600 text-white rounded px-2 py-1"
              aria-label="Agregar paso"
            >
              +
            </button>
          </div>

          <div className="space-y-2">
            {simulatedRecipe.steps.map((step, idx) => (
              <div
                key={idx}
                className="flex items-baseline gap-2 border-b py-2 last:border-0"
              >
                <span className="font-medium whitespace-nowrap">
                  {step}
                </span>
                <div className="flex gap-1">
                  <button
                    type="button"
                    className="text-xs text-red-500 hover:text-red-700"
                    aria-label="Quitar paso"
                  >
                    -
                  </button>
                  <button
                    type="button"
                    className="text-xs text-blue-500 hover:text-blue-700"
                    aria-label="Mover paso hacia arriba"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="text-xs text-blue-500 hover:text-blue-700"
                    aria-label="Mover paso hacia abajo"
                  >
                    ↓
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Imagen */}
        <div>
          <label className="block text-sm font-medium mb-2">Foto de la receta</label>
          <p className="text-sm text-gray-500 mb-2">
            La foto se subirá directamente a MinIO con URL prefirmada
          </p>
          <button
            type="button"
            className="w-full py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 transition-colors text-sm font-medium"
            aria-label="Subir foto a MinIO"
          >
            Subir foto a MinIO
          </button>
        </div>

        {/* Botones de acción */}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => setIsEditing(false)}
            className="flex-1 py-2 bg-gray-200 rounded-md hover:bg-gray-300 transition-colors text-sm"
            aria-label="Cancelar"
          >
            Cancelar
          </button>
          <button
            type="submit"
            className="flex-1 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 transition-colors text-sm font-medium"
            disabled={isSubmiting}
            aria-label="Guardar receta"
          >
            {isSubmiting ? 'Guardando...' : 'Guardar receta'}
          </button>
        </div>
      </form>
    </section>
  );
}