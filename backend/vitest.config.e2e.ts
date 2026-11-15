import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: [
      '**/*.e2e-spec.ts',
      '**/*.integration-spec.ts',
    ],
    exclude: ['node_modules', '.git'],
    setupFiles: ['./test/setup-env.ts'],
  },
});