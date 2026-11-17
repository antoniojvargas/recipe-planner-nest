export default function LoginPage() {
  return (
    <section className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="bg-white p-8 rounded-lg shadow-xl max-w-md w-full">
        <h2 className="text-2xl font-bold mb-6">Iniciar sesión</h2>

        <form className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">
              Correo electrónico
            </label>
            <input
              type="email"
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-600"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">
              Contraseña
            </label>
            <input
              type="password"
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-600"
            />
          </div>

          <button
            type="submit"
            className="w-full py-2 bg-primary-600 text-white font-medium rounded-md hover:bg-primary-700 transition-colors"
          >
            Entrar
          </button>
        </form>
      </div>
    </section>
  );
}