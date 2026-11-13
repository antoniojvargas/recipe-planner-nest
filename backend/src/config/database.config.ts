import { registerAs, type ConfigType } from '@nestjs/config';
import { requireEnv } from './env.js';

export const databaseConfig = registerAs('database', () => ({
  mongoUrl: requireEnv('MONGO_URL'),
  redisUrl: requireEnv('REDIS_URL'),
}));

export type DatabaseConfig = ConfigType<typeof databaseConfig>;
