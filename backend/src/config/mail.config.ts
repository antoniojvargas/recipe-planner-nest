import { registerAs, type ConfigType } from '@nestjs/config';
import { numberEnvOrDefault, requireEnv } from './env.js';

export const mailConfig = registerAs('mail', () => ({
  host: requireEnv('SMTP_HOST'),
  port: numberEnvOrDefault('SMTP_PORT', 1025),
  from: requireEnv('MAIL_FROM'),
}));

export type MailConfig = ConfigType<typeof mailConfig>;
