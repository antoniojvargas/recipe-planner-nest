import { registerAs, type ConfigType } from '@nestjs/config';
import { requireEnv } from './env.js';

export const storageConfig = registerAs('storage', () => ({
  /** Endpoint interno: por aquí hablan la API y el worker. */
  endpoint: requireEnv('S3_ENDPOINT'),
  /** Host que se firma en las URLs prefirmadas que abre el navegador. */
  publicEndpoint: requireEnv('S3_PUBLIC_ENDPOINT'),
  bucket: requireEnv('S3_BUCKET'),
  accessKey: requireEnv('S3_ACCESS_KEY'),
  secretKey: requireEnv('S3_SECRET_KEY'),
}));

export type StorageConfig = ConfigType<typeof storageConfig>;
