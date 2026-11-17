export default function ShoppingListPage({
  params,
}: Readonly<{
  params: { weekStart: string };
}>) {
  return (
    <section className="p-4">
      <h1 className="text-2xl font-bold mb-4">Lista de la compra</h1>
      <p className="text-gray-600">
        Lista de la compra de la semana que empieza el {params.weekStart}.
      </p>
    </section>
  );
}