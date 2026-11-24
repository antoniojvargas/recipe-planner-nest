import tseslint from 'typescript-eslint';
import base from '../eslint.config.mjs';

/**
 * Mongo solo se toca desde repositorios. Un `InjectModel` en un servicio, controlador o
 * processor permitiría consultas sin el filtro de hogar; inyectar el repositorio correspondiente
 * mantiene esa comprobación en un único sitio. Los esquemas y módulos importan otros símbolos de
 * `@nestjs/mongoose` y no se ven afectados.
 */
export default tseslint.config(...base, {
  files: ['src/**/*.ts'],
  ignores: ['src/**/*.repository.ts'],
  rules: {
    'no-restricted-imports': [
      'error',
      {
        paths: [
          {
            name: '@nestjs/mongoose',
            importNames: ['InjectModel'],
            message: 'Inyecta el repositorio: los modelos solo se usan en *.repository.ts',
          },
        ],
      },
    ],
  },
});
