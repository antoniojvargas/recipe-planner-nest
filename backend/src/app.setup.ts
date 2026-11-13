import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import { appConfig, type AppConfig } from './config/index.js';

/**
 * Cabeceras que el navegador puede leer de la respuesta. `X-Request-Id` viaja en los
 * errores para que el cliente pueda citarlo al reportarlos.
 */
const EXPOSED_HEADERS = ['X-Request-Id'];

const ALLOWED_HEADERS = ['Content-Type', 'Authorization', 'X-Request-Id'];

const ALLOWED_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'];

/** Doce horas de caché del preflight: menos peticiones OPTIONS desde el frontend. */
const PREFLIGHT_MAX_AGE_SECONDS = 43_200;

/**
 * Configuración HTTP compartida por `main.ts` y los tests e2e, para que las rutas y las
 * cabeceras que se prueban sean las mismas que se despliegan.
 *
 * - Prefijo global `/api`, el que enrutan el proxy de desarrollo y Caddy.
 * - CORS solo para `FRONTEND_URL`, con credenciales: la sesión viaja en cookies `httpOnly`.
 * - Helmet con una CSP que no permite cargar nada: la API solo devuelve JSON, así que
 *   cualquier `script` o `style` en una respuesta sería un fallo, no una página legítima.
 * - `@fastify/cookie` para leer y escribir las cookies de sesión.
 */
export async function configureApp(app: NestFastifyApplication): Promise<void> {
  const config = app.get<AppConfig>(appConfig.KEY);
  // `Origin` nunca lleva barra final; se normaliza por si la variable la incluye.
  const frontendOrigin = config.frontendUrl.replace(/\/$/, '');

  app.setGlobalPrefix('api');

  app.enableCors({
    origin: (origin, callback) => {
      // Sin `Origin` (curl, health del orquestador, servidor a servidor) no es CORS.
      callback(null, origin === undefined || origin === frontendOrigin);
    },
    credentials: true,
    methods: ALLOWED_METHODS,
    allowedHeaders: ALLOWED_HEADERS,
    exposedHeaders: EXPOSED_HEADERS,
    maxAge: PREFLIGHT_MAX_AGE_SECONDS,
  });

  await app.register(helmet, {
    contentSecurityPolicy: {
      // `useDefaults: false` no hereda `script-src 'self'` ni `img-src`: la API no sirve HTML.
      useDefaults: false,
      directives: {
        defaultSrc: ["'none'"],
        baseUri: ["'none'"],
        formAction: ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
  });

  await app.register(cookie);
}
