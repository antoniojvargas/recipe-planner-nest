'use client';

import ImportDialog from '@/app/(app)/recipes/[id]/import-dialog';

export default function RecipeEditor({ params }: { params: { id: string } }) {
  return (
    <section className="p-6 max-w-2xl mx-auto">
      <h2 className="text-2xl font-bold mb-6">Editor de Recetas</h2>
      <ImportDialog recipeId={params.id} />
      <p className="mt-4 text-sm text-gray-600">Editor de recetas disponible próximamente.</p>
    </section>
  );
}
