export function Header() {
  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between flex-wrap">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold text-primary-600">Recipe Planner</h1>
        </div>

        {/* Área de hogar cuándo hay sesión */}
        {/* Por ahora mostramos un badge indicando que el usuario está autenticado */}
        {/* La selección real de hogar se hará en las rutas interactivas */}
        {/* con (app)/[householdId]/... */}
      </div>
    </header>
  );
}
