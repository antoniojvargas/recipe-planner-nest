import type { NestFastifyApplication } from '@nestjs/platform-fastify';

/**
 * Configuración HTTP compartida por `main.ts` y los tests e2e, para que las rutas que se
 * prueban sean las mismas que se despliegan.
 */
export function configureApp(app: NestFastifyApplication): void {
  // Todo cuelga de /api: es el prefijo que enrutan el proxy de desarrollo y Caddy.
  app.setGlobalPrefix('api');
}
