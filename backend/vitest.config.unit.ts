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
      provider: 'v8',
      reporter: ['text', 'json'],
      reportsDirectory: 'coverage/unit',
      include: ['src/imports/recipe-parser.ts'],
      exclude: ['**/*.spec.ts', '**/*.test.ts'],
      thresholds: {
        lines: 70,
        branches: 55,
        functions: 60,
        statements: 70,
      },
    },
  },
});
