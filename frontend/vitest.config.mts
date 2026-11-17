import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // `server-only` lanza al importarse fuera del runtime de React Server Components;
      // en las pruebas basta un módulo vacío.
      'server-only': fileURLToPath(new URL('./test/stubs/server-only.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.spec.ts', 'test/**/*.spec.ts'],
    env: {
      API_INTERNAL_URL: 'http://api.internal:3000',
      FRONTEND_URL: 'http://localhost:3001',
    },
  },
});
