'use client';

import React, { useState } from 'react';

export default function CreateHouseholdPage() {
  const [name, setName] = useState('');

  return (
    <section className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="bg-white p-8 rounded-lg shadow-xl max-w-md w-full">
        <h2 className="text-2xl font-bold mb-4">Nuevo hogar</h2>

        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            // Aquí iría la llamada al backend para crear el hogar
            alert(`Hogar creado: ${name}`);
          }}
        >
          <div>
            <label className="block text-sm font-medium mb-2">Nombre del hogar</label>
            <input
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
              }}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-basil-600"
              autoComplete="name"
            />
          </div>

          <button
            type="submit"
            className="w-full py-2 bg-basil-600 text-white font-medium rounded-md hover:bg-basil-700 transition-colors"
          >
            Crear hogar
          </button>
        </form>
      </div>
    </section>
  );
}
