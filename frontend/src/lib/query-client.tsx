'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';

/**
 * Un `QueryClient` por árbol de React: en el navegador dura lo que la pestaña; en el servidor
 * se crea uno por render, nunca se comparte entre peticiones.
 *
 * `staleTime` protege el `initialData` que manda el Server Component: sin él, TanStack Query
 * volvería a pedir los mismos datos nada más montar, justo lo que el patrón evita.
 */
function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: 1,
      },
    },
  });
}

export function QueryProvider({ children }: Readonly<{ children: React.ReactNode }>) {
  const [queryClient] = useState(createQueryClient);

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
