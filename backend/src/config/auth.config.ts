import { registerAs, type ConfigType } from '@nestjs/config';
import { requireEnv } from './env.js';

/** 15 minutos de access token y 30 días de refresh, según el diseño de sesiones. */
export const ACCESS_TOKEN_TTL = '15m';
export const REFRESH_TOKEN_TTL = '30d';

export const authConfig = registerAs('auth', () => ({
  accessSecret: requireEnv('JWT_ACCESS_SECRET'),
  refreshSecret: requireEnv('JWT_REFRESH_SECRET'),
  accessTokenTtl: ACCESS_TOKEN_TTL,
  refreshTokenTtl: REFRESH_TOKEN_TTL,
}));

export type AuthConfig = ConfigType<typeof authConfig>;
