import { registerAs, type ConfigType } from '@nestjs/config';
import { envOrDefault } from './env.js';

export const appConfig = registerAs('app', () => ({
  env: envOrDefault('APP_ENV', 'development'),
  logLevel: envOrDefault('LOG_LEVEL', 'info'),
  /** Origen permitido por CORS y base de los enlaces de los correos. */
  frontendUrl: envOrDefault('FRONTEND_URL', 'http://localhost:3001'),
  /** URL de la API dentro de la red de Docker, para los Server Components. */
  apiInternalUrl: envOrDefault('API_INTERNAL_URL', 'http://backend:3000'),
}));

export type AppConfig = ConfigType<typeof appConfig>;
