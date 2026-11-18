"use client";

export default function Error({ error }: { error: unknown }) {
  return (
    <div className="min-h-span flex items-center justify-center p-4">
      <p className="text-red-600">Error: {String(error)}</p>
      <button
        onClick={() => {
          window.location.reload();
        }}
        className="mt-4 py-2 px-4 bg-blue-600 text-white rounded-md hover:bg-blue-700"
      >
        Reintentar
      </button>
    </div>
  );
}
