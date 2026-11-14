import { ConfigModule } from '@nestjs/config';
import { fileURLToPath } from 'node:url';
import { configProviders } from './index.js';
import { validateEnvironment } from './env.validation.js';

/**
 * Carga y valida la configuración una sola vez para la API y para el seed.
 *
 * El `.env` vive en la raíz del repo; en Docker las variables llegan del compose y el fichero
 * no existe, así que `envFilePath` es solo una comodidad para ejecutar en el host.
 */
export const configModule = ConfigModule.forRoot({
  isGlobal: true,
  cache: true,
  envFilePath: [fileURLToPath(new URL('../../../.env', import.meta.url)), '.env'],
  expandVariables: true,
  load: configProviders,
  validate: validateEnvironment,
});
