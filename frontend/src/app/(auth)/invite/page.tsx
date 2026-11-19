export default function InvitePage({
  homeId,
}: Readonly<{
  homeId: string;
}>) {
  // En un implementation real, aquí el backend devolvería el código
  // y lo guardaríamos en estado. Por ahora, mostramos un código estático.
  const inviteCode = 'INV-12345678';

  return (
    <section className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="bg-white p-8 rounded-lg shadow-xl max-w-md w-full">
        <h2 className="text-2xl font-bold mb-4">Invitar a miembros</h2>

        <div className="bg-gray-50 rounded-lg p-6 mb-6">
          <p className="text-sm text-gray-500 mb-3">
            Comparte este código con las personas que quieres que se unan a tu hogar:
          </p>

          <div className="border rounded p-3 mb-3 select-none">
            <code className="font-mono text-sm block word-break">{inviteCode}</code>
          </div>

          <button
            onClick={() => navigator.clipboard.writeText(inviteCode)}
            className="w-full py-2 bg-primary-100 text-primary-700 rounded-md hover:bg-primary-200 transition-colors text-sm font-medium"
          >
            Copiar código
          </button>
        </div>

        <div>
          <p className="text-sm text-gray-500 mb-4">
            El código caduca en 24 horas y solo puede usarse una vez.
          </p>

          <button
            onClick={() => {
              window.history.back();
            }}
            className="w-full py-2 text-sm text-gray-500 hover:text-gray-700"
          >
            Volver atrás
          </button>
        </div>
      </div>
    </section>
  );
}
