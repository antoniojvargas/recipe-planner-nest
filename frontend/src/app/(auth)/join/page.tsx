'use client';

import { useState } from 'react';

export default function JoinPage() {
  const [code, setCode] = useState('');
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    if (!code.trim()) return;
    setJoining(true);
    setError(null);

    try {
      const response = await fetch('/api/households/join', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ code }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error?.message || 'Código inválido');
        setJoining(false);
        return;
      }

      // After successful join, redirect to home or recipes
      window.location.href = '/';
    } catch (err) {
      setError('Error de conexión');
      setJoining(false);
    }
  }

  return (
    <section className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="bg-white p-8 rounded-lg shadow-xl max-w-md w-full">
        <h2 className="text-2xl font-bold mb-4">Unirse a un hogar</h2>

        {error && <p className="text-red-500 mb-4">{error}</p>}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Código de invitación</label>
            <input
              type="text"
              value={code}
              onChange={(e) => {
                setCode(e.target.value);
              }}
              required
              autoComplete="one-time-code"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-600"
            />
          </div>

          <button
            type="submit"
            className="w-full py-2 bg-primary-600 text-white font-medium rounded-md hover:bg-primary-700 transition-colors"
            disabled={joining}
          >
            {joining ? 'Unirse...' : 'Unirse al hogar'}
          </button>
        </form>
      </div>
    </section>
  );
}
