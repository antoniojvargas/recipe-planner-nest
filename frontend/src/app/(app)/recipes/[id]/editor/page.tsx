import ImportDialog from '@/app/(app)/recipes/[id]/import-dialog';

export default async function RecipeEditor({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return (
    <section className="p-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Editor de Recetas</h1>
      <ImportDialog recipeId={id} />
      <p className="mt-4 text-sm text-gray-600">Editor de recetas disponible próximamente.</p>
    </section>
  );
}
