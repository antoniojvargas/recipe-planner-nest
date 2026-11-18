import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';

export default function RecipesPage() {
  // Obtener parámetros de la URL
  const params = new URLSearchParams(window.location.search);
  const searchQuery = params.get('q') || '';
  const tagsParam = params.get('tags') || '';
  const cursor = params.get('cursor') || '';
  const limit = params.get('limit') || '12';

  const [recipes, setRecipes] = useState<
    {
      id: string;
      title: string;
      description: string | null;
      imageKey: string | null;
      tags: string[];
    }[]
  >([]);
  const [hasMore, setHasMore] = useState(true);
  const [isLoading, setIsLoading] = useState(false);

  // Cargar recetas iniciales
  useEffect(() => {
    setRecipes([]);
    setHasMore(true);
  }, [searchQuery, tagsParam, cursor]);

  // Efecto para cargar más recetas cuando scrollear
  useEffect(() => {
    if (!hasMore || isLoading) return;

    // Pequeño delay para que el usuario vea el contenido
    const timer = setTimeout(() => {
      void loadMoreRecipes();
    }, 300);

    return () => {
      clearTimeout(timer);
    };
  }, [hasMore, isLoading, cursor, limit, searchQuery, tagsParam]);

  async function loadMoreRecipes() {
    setIsLoading(true);

    try {
      const response = await fetch(
        `/api/households/${params.get('householdId') || 'current'}/recipes`,
        {
          method: 'GET',
          headers: {
            Accept: 'application/json',
          },
          // Next.js envía las cookies httpOnly automáticamente
        },
      );

      if (!response.ok) {
        throw new Error('Error al cargar recetas');
      }

      const data = await response.json();

      // Simulación de estructura de respuesta
      const newRecipes = data.recipes || [];
      const newCursor = data.cursor;
      const newHasMore = data.hasMore;

      setRecipes((prev) => [...prev, ...newRecipes]);
      setHasMore(newHasMore);
      setCursor(newCursor);
    } catch (error) {
      console.error('Error cargando recetas:', error);
    } finally {
      setIsLoading(false);
    }
  }

  // Filtrar por tags
  const tags = tagsParam
    ? tagsParam
        .split(',')
        .map((t) => t.trim())
        .filter((t) => t)
    : [];

  return (
    <section className="p-4">
      <h1 className="text-2xl font-bold mb-4">Recetas</h1>

      {/* Barra de búsqueda y filtros */}
      <div className="mb-6 flex flex-col sm:flex-row gap-3">
        <div className="flex-1">
          <input
            type="text"
            placeholder="Buscar recetas..."
            value={searchQuery}
            onChange={(e) => {
              const newUrl = new URL(window.location.href);
              newUrl.searchParams.set('q', e.target.value);
              window.location.href = newUrl.href;
            }}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-600"
            autoComplete="off"
            aria-label="Buscar recetas"
          />
        </div>

        <div>
          <select
            onChange={(e) => {
              const selectedTags = Array.from(e.target.selectedOptions).map((o) => o.value);
              const newUrl = new URL(window.location.href);
              newUrl.searchParams.set('tags', selectedTags.join(','));
              window.location.href = newUrl.href;
            }}
            className="pr-4 rounded border border-gray-300 py-2 focus:outline-none focus:ring-2 focus:ring-primary-600"
            aria-label="Filtrar por etiquetas"
          >
            <option value="">Todas las etiquetas</option>
            <option value="desayuno">Desayuno</option>
            <option value="comida">Comida</option>
            <option value="cena">Cena</option>
            <option value="postre">Postre</option>
            <option value="entrada">Entrada</option>
          </select>
        </div>
      </div>

      {/* Lista de recetas */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {isLoading && recipes.length === 0 && (
          <p className="col-span-full text-center py-8">Cargando recetas...</p>
        )}

        {recipes.map((recipe) => (
          <article
            key={recipe.id}
            className="group rounded-lg overflow-hidden shadow-sm hover:shadow-md transition-shadow"
          >
            <Link href={`/recetas/${recipe.id}`} className="block rounded-t-lg">
              {recipe.imageKey && (
                <Image
                  src={`https://minio.example.com/recipes/${recipe.imageKey}`}
                  alt={`${recipe.title} - miniatura`}
                  width={400}
                  height={250}
                  className="aspect-square w-full h-48 object-cover rounded-t-lg group-hover:opacity-90 transition-opacity"
                  placeholder="blur"
                  blurDataURL="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 250'%3E%3Crect width='400' height='250' fill='%23f3f4f6'/%3E%3C/svg%3E"
                />
              )}
              {!recipe.imageKey && (
                <div className="aspect-square w-full h-48 bg-gray-200 rounded-t-lg flex items-center justify-center text-sm text-gray-400">
                  Sin imagen
                </div>
              )}
            </Link>

            <div className="p-4">
              <h3 className="font-medium line-clamp-2">{recipe.title}</h3>
              {recipe.description && (
                <p className="text-sm text-gray-500 line-clamp-2 mt-2">{recipe.description}</p>
              )}
              <div className="mt-2 flex flex-wrap gap-1">
                {recipe.tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-600"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          </article>
        ))}
      </div>

      {/* Cargar más */}
      {hasMore && !isLoading && (
        <div className="mt-8 text-center">
          <button
            onClick={() =>
              (window.location.href = `${window.location.pathname}?cursor=${cursor || ''}&limit=${limit}`)
            }
            className="px-6 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 transition-colors font-medium"
            aria-label="Cargar más recetas"
          >
            Cargar más
          </button>
        </div>
      )}
    </section>
  );
}
