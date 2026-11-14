import { defineConfig } from 'vitest/config';

/**
 * Tests de integración con infraestructura real (Testcontainers).
 *
 * Van en un script aparte porque necesitan Docker: `npm run test:integration`.
 */
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['**/*.integration-spec.ts'],
    // Arrancar y detener contenedores es lento, sobre todo la primera vez que se descarga la
    // imagen de MinIO.
    hookTimeout: 180_000,
    testTimeout: 120_000,
  },
});
