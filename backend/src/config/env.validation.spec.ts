import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveFileSecrets, validateEnvironment } from './env.validation.js';

const MIN_SECRET = 'a'.repeat(32);

function validEnv(): Record<string, string> {
  return {
    MONGO_URL: 'mongodb://mongo:27017/recipes?replicaSet=rs0',
    REDIS_URL: 'redis://redis:6379',
    S3_ENDPOINT: 'http://minio:9000',
    S3_PUBLIC_ENDPOINT: 'http://localhost:9000',
    S3_BUCKET: 'recipes',
    S3_ACCESS_KEY: 'minioadmin',
    S3_SECRET_KEY: 'minioadmin',
    JWT_ACCESS_SECRET: MIN_SECRET,
    JWT_REFRESH_SECRET: `different-${MIN_SECRET}`,
    SMTP_HOST: 'mailpit',
    SMTP_PORT: '1025',
    MAIL_FROM: 'Recipe Planner <no-reply@recipe-planner.local>',
    APP_ENV: 'development',
    LOG_LEVEL: 'debug',
    FRONTEND_URL: 'http://localhost:3001',
    API_INTERNAL_URL: 'http://backend:3000',
  };
}

describe('validateEnvironment', () => {
  afterEach(() => {
    delete process.env.JWT_ACCESS_SECRET;
    delete process.env.JWT_REFRESH_SECRET;
    delete process.env.S3_SECRET_KEY;
  });

  it('acepta una configuración completa y convierte los números', () => {
    const config = validateEnvironment(validEnv());

    expect(config.MONGO_URL).toBe('mongodb://mongo:27017/recipes?replicaSet=rs0');
    expect(config.SMTP_PORT).toBe(1025);
    expect(config.APP_ENV).toBe('development');
  });

  it('falla si falta una variable obligatoria', () => {
    const env = validEnv();
    delete env.MONGO_URL;

    expect(() => validateEnvironment(env)).toThrow(/MONGO_URL/);
  });

  it('falla si un secreto JWT tiene menos de 32 caracteres', () => {
    const env = { ...validEnv(), JWT_ACCESS_SECRET: 'corto' };

    expect(() => validateEnvironment(env)).toThrow(/JWT_ACCESS_SECRET.*32 caracteres/);
  });

  it('falla si APP_ENV no es un entorno conocido', () => {
    const env = { ...validEnv(), APP_ENV: 'staging' };

    expect(() => validateEnvironment(env)).toThrow(/APP_ENV/);
  });

  it('falla si SMTP_PORT no es un puerto válido', () => {
    const env = { ...validEnv(), SMTP_PORT: '70000' };

    expect(() => validateEnvironment(env)).toThrow(/SMTP_PORT/);
  });

  it('falla si la URL de Mongo no es mongodb://', () => {
    const env = { ...validEnv(), MONGO_URL: 'http://mongo:27017' };

    expect(() => validateEnvironment(env)).toThrow(/MONGO_URL.*mongodb/);
  });
});

describe('secretos desde fichero (*_FILE)', () => {
  let directory: string;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'recipe-planner-secrets-'));
  });

  afterEach(() => {
    rmSync(directory, { recursive: true, force: true });
    delete process.env.JWT_ACCESS_SECRET;
    delete process.env.JWT_REFRESH_SECRET;
    delete process.env.S3_SECRET_KEY;
  });

  it('lee el secreto del fichero y lo deja en process.env', () => {
    const file = join(directory, 'jwt-access-secret');
    writeFileSync(file, `${MIN_SECRET}\n`);

    const env = validEnv();
    delete env.JWT_ACCESS_SECRET;

    const config = validateEnvironment({ ...env, JWT_ACCESS_SECRET_FILE: file });

    expect(config.JWT_ACCESS_SECRET).toBe(MIN_SECRET);
    expect(process.env.JWT_ACCESS_SECRET).toBe(MIN_SECRET);
  });

  it('el valor plano gana sobre el fichero', () => {
    const file = join(directory, 'jwt-access-secret');
    writeFileSync(file, 'secreto-del-fichero-que-no-debe-ganar');

    const config = resolveFileSecrets({
      ...validEnv(),
      JWT_ACCESS_SECRET: MIN_SECRET,
      JWT_ACCESS_SECRET_FILE: file,
    });

    expect(config.JWT_ACCESS_SECRET).toBe(MIN_SECRET);
  });

  it('falla si el fichero no existe', () => {
    const env = validEnv();
    delete env.S3_SECRET_KEY;

    expect(() =>
      validateEnvironment({ ...env, S3_SECRET_KEY_FILE: join(directory, 'no-existe') }),
    ).toThrow(/S3_SECRET_KEY_FILE: no se pudo leer el fichero/);
  });

  it('falla si el fichero está vacío', () => {
    const file = join(directory, 'vacio');
    writeFileSync(file, '  \n');

    const env = validEnv();
    delete env.JWT_REFRESH_SECRET;

    expect(() => validateEnvironment({ ...env, JWT_REFRESH_SECRET_FILE: file })).toThrow(
      /está vacío/,
    );
  });
});
