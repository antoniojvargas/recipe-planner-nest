"use client";

export default function ImportDialog({ recipeId }: { recipeId: string }) {
  return (
    <section className="p-6 max-w-md mx-auto">
      <h2 className="text-2xl font-bold mb-4">Importar desde URL</h2>
      <p className="text-sm text-gray-600">
        Importación disponible próximamente para la receta {recipeId}.
      </p>
    </section>
  );
}
