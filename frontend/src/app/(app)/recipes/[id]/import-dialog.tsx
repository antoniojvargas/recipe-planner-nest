import { useState, useEffect, type FormEvent } from 'react';
import { io, Socket } from 'socket.io-client';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '@/server/api';

import { REALTIME_NAMESPACE, SOCKET_EVENTS } from '@/packages/contracts/src/events';

interface ImportDialogProps {
  recipeId: string;
}

export default function ImportDialog({ recipeId }: ImportDialogProps) {
  const [url, setUrl] = useState('');
  const [status, setStatus] = useState<'idle' | 'importing' | 'success' | 'error'>('idle');
  const [error, setError] = useState<{ code?: string; message?: string } | null>(null);
  const navigate = useNavigate();
  const [socket, setSocket] = useState<Socket | null>(null);

  // Connect to Socket.IO namespace /realtime
  useEffect(() => {
    const socket = io({
      transports: ['websocket'],
      extraHeaders: {
        // The auth token will be sent via cookies by Next.js
      },
    });

    socket.on('connect', () => {
      console.log('Socket.IO conectado');
    });

    setSocket(socket);

    // Listen for import.finished event
    socket.on(
      SOCKET_EVENTS.importFinished,
      (payload: import('packages/contracts/src/events').ImportFinishedPayload) => {
        console.log('import.finished recibido:', payload);
        setStatus('success');
        // Navigate to the recipe draft
        navigate(`/recipes/${recipeId}`);
      },
    );

    // Listen for import.failed event
    socket.on(
      SOCKET_EVENTS.importFailed,
      (payload: import('packages/contracts/src/events').ImportFailedPayload) => {
        console.log('import.failed recibido:', payload);
        setStatus('error');
        setError({
          code: payload.code,
          message: payload.message,
        });
      },
    );

    return () => {
      if (socket) {
        socket.disconnect();
      }
    };
  }, [navigate, recipeId]);

  // Handle form submission - POST to import URL API
  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus('importing');
    setError(null);

    try {
      await apiFetch.POST('/api/imports/import-url', { url });
      // The API will trigger the import process,
      // and the Socket.IO events will be handled by the useEffect above
    } catch (err) {
      console.error('Error al lanzar la importación:', err);
      setStatus('error');
      setError({ message: 'Error al conectar con el servicio de importación' });
    }
  };

  return (
    <section className="p-6 max-w-md mx-auto">
      <h2 className="text-2xl font-bold mb-4">Importar desde URL</h2>

      {status === 'idle' && (
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">URL de la receta</label>
            <input
              type="text"
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
              }}
              placeholder="https://ejemplo.com/receta"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-600"
              required
              aria-label="URL de la receta a importar"
            />
          </div>

          <button
            type="submit"
            className="w-full py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 transition-colors text-sm font-medium"
            disabled={status !== 'idle'}
            aria-label="Importar receta desde URL"
          >
            {status === 'importing' ? 'Importando...' : 'Importar'}
          </button>
        </form>
      )}

      {status === 'success' && (
        <div className="bg-green-100 border-green-400 text-green-800 rounded-md p-4 mb-6">
          <p className="font-medium">Importación exitosa</p>
          <p>La receta ha sido importada y ahora estás en el editor.</p>
        </div>
      )}

      {status === 'error' && error && (
        <div className="bg-red-100 border-red-400 text-red-800 rounded-md p-4 mb-6">
          <p className="font-medium">Error en la importación</p>
          <p className="mt-1">
            <strong>Código:</strong> {error.code || 'UNKNOWN'}
          </p>
          <p className="mt-1">
            <strong>Mensaje:</strong> {error.message || 'Error desconocido'}
          </p>
        </div>
      )}
    </section>
  );
}
