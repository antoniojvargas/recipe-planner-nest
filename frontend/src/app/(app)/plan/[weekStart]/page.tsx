export default function PlanPage({
  params,
}: Readonly<{
  params: { weekStart: string };
}>) {
  return (
    <section className="p-4">
      <h1 className="text-2xl font-bold mb-4">Plan de comidas</h1>
      <p className="text-gray-600">
        Plan de la semana que empieza el {params.weekStart}.
      </p>
    </section>
  );
}