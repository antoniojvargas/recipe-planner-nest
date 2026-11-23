export default function LoginPage() {
  return (
    <form
      className="bg-white p-8 rounded-lg shadow-xl max-w-md w-full space-y-4"
      action="/api/auth/login"
      method="POST"
    >
      <div>
        <label className="block text-sm font-medium mb-2">Correo electrónico</label>
        <input
          type="email"
          name="email"
          required
          autoComplete="email"
          className="min-h-11 w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-basil-600"
        />
      </div>

      <button
        type="submit"
        className="min-h-11 w-full py-2 bg-basil-600 text-white font-medium rounded-md hover:bg-basil-700 transition-colors"
      >
        Entrar
      </button>
    </form>
  );
}
