import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts', '**/*.integration-spec.ts'],
    exclude: ['node_modules', '.git'],
    setupFiles: ['./test/setup-env.ts'],
    coverage: {
      // Umbrales de cobertura
      thresholds: {
        // Líneas deben cubrirse en un 80% como mínimo
        lines: 80,
        // Ramas deben cubrirse en un 80% como mínimo
        branches: 80,
        // Funciones y statements también pueden tener umbrales
        functions: 80,
        statements: 80,
      },
      // Información adicional que se mostrará en la consola
      reporter: ['text', 'json', 'html'],
      // Directorio donde se guardará el reporte de cobertura
      reportsDirectory: 'coverage',
      // Archivos que se excluirán del cálculo de cobertura
      exclude: [
        'node_modules',
        '.git',
        'dist',
        'coverage',
        '**/*.e2e-spec.ts', // Los e2e no cuentan para cobertura de negocio
        '**/*.integration-spec.ts',
      ],
    },
  },
});
