import { appConfig } from './app.config.js';
import { authConfig } from './auth.config.js';
import { databaseConfig } from './database.config.js';
import { mailConfig } from './mail.config.js';
import { storageConfig } from './storage.config.js';

export { appConfig, type AppConfig } from './app.config.js';
export { authConfig, type AuthConfig } from './auth.config.js';
export { databaseConfig, type DatabaseConfig } from './database.config.js';
export { mailConfig, type MailConfig } from './mail.config.js';
export { storageConfig, type StorageConfig } from './storage.config.js';
export { validateEnvironment, EnvironmentVariables } from './env.validation.js';

/** Todos los providers de configuración que carga `ConfigModule.forRoot`. */
export const configProviders = [appConfig, databaseConfig, authConfig, storageConfig, mailConfig];
