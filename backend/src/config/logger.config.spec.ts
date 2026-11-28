import { Writable } from 'node:stream';
import pino from 'pino';
import { createLoggerOptions } from './logger.config.js';
import type { AppConfig } from './app.config.js';

const baseConfig: AppConfig = {
  env: 'production',
  logLevel: 'info',
  frontendUrl: 'http://localhost:3001',
};

function memoryStream(): { stream: Writable; lines: string[] } {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      lines.push(chunk.toString());
      callback();
    },
  });

  return { stream, lines };
}

describe('createLoggerOptions', () => {
  it('usa pino-pretty solo en desarrollo', () => {
    const development = createLoggerOptions({ ...baseConfig, env: 'development' });

    expect(development.pinoHttp.transport).toMatchObject({ target: 'pino-pretty' });
  });

  it('emite JSON fuera de desarrollo', () => {
    const production = createLoggerOptions(baseConfig);
    const test = createLoggerOptions({ ...baseConfig, env: 'test' });

    expect(production.pinoHttp.transport).toBeUndefined();
    expect(test.pinoHttp.transport).toBeUndefined();
  });

  it('redacta cookies, Authorization y Set-Cookie', () => {
    const { stream, lines } = memoryStream();
    const options = createLoggerOptions(baseConfig);
    const logger = pino({ redact: options.pinoHttp.redact, level: 'info' }, stream);

    logger.info(
      {
        req: {
          method: 'GET',
          url: '/api/households',
          headers: {
            cookie: 'access_token=secret-jwt; refresh_token=secret-refresh',
            authorization: 'Bearer secret-jwt',
            'user-agent': 'vitest',
          },
        },
        res: {
          statusCode: 200,
          headers: { 'set-cookie': 'access_token=new-secret-jwt' },
        },
      },
      'request completed',
    );

    const entry = JSON.parse(lines.join('')) as {
      req: { headers: Record<string, string> };
      res: { headers: Record<string, string> };
    };

    expect(entry.req.headers.cookie).toBe('[Redacted]');
    expect(entry.req.headers.authorization).toBe('[Redacted]');
    expect(entry.res.headers['set-cookie']).toBe('[Redacted]');
    expect(entry.req.headers['user-agent']).toBe('vitest');
    expect(lines.join('')).not.toContain('secret-jwt');
    expect(lines.join('')).not.toContain('secret-refresh');
    expect(lines.join('')).not.toContain('new-secret-jwt');
  });

  it('respeta el nivel de log configurado', () => {
    expect(createLoggerOptions({ ...baseConfig, logLevel: 'warn' }).pinoHttp.level).toBe('warn');
  });
});
