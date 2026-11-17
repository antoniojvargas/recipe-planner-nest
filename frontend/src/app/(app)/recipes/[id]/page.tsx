export default function RecipeDetailPage({
  params,
}: Readonly<{
  params: { id: string };
}>) {
  return (
    <section className="p-4">
      <h1 className="text-2xl font-bold mb-4">Receta {params.id}</h1>
      <p className="text-gray-600">Detalle de la receta {params.id}.</p>
    </section>
  );
}