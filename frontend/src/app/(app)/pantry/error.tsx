'use client';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 p-4">
      <p className="text-center text-tomato-600">No se pudo cargar la despensa: {error.message}</p>
      <button
        type="button"
        onClick={reset}
        className="rounded-md bg-basil-600 px-4 py-2 font-medium text-white hover:bg-basil-700"
      >
        Reintentar
      </button>
    </div>
  );
}
