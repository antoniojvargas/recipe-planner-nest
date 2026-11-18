import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    // Incluir archivos de test unitarios (no e2e ni integration)
    include: [
      'test/**/*.spec.ts',
      // Excluir e2e specs y integration specs
      // (se incluyen en vitest.config.e2e.ts y vitest.config.integration.ts)
    ],
    exclude: [
      'node_modules',
      '.git',
      'dist',
      '**/*.e2e-spec.ts',
      '**/*.integration-spec.ts',
      'test/setup-env.ts',
    ],
    coverage: {
      thresholds: {
        lines: 80,
        branches: 80,
        functions: 80,
        statements: 80,
      },
      reporter: ['text', 'json'],
      directory: 'coverage/unit',
      exclude: ['node_modules', '.git', 'dist', 'coverage', 'coverage/unit'],
    },
  },
});
