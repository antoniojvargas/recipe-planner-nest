'use client';

import { useEffect, useState } from 'react';

/**
 * Retrasa la propagación de un valor mientras la persona sigue escribiendo.
 *
 * El selector de recetas busca en la API: sin esta espera, cada pulsación sería una petición.
 */
export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(value);
    }, delayMs);

    return () => {
      clearTimeout(timer);
    };
  }, [value, delayMs]);

  return debounced;
}
