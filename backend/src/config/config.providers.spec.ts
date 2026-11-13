import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { configProviders, type AuthConfig, type StorageConfig } from './index.js';
import { authConfig } from './auth.config.js';
import { storageConfig } from './storage.config.js';

const MIN_SECRET = 'a'.repeat(32);

const ENV = {
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
  APP_ENV: 'test',
  LOG_LEVEL: 'warn',
  FRONTEND_URL: 'http://localhost:3001',
  API_INTERNAL_URL: 'http://backend:3000',
} as const;

describe('providers de configuración', () => {
  beforeEach(() => {
    vi.stubEnv('MONGO_URL', ENV.MONGO_URL);
    vi.stubEnv('REDIS_URL', ENV.REDIS_URL);
    vi.stubEnv('S3_ENDPOINT', ENV.S3_ENDPOINT);
    vi.stubEnv('S3_PUBLIC_ENDPOINT', ENV.S3_PUBLIC_ENDPOINT);
    vi.stubEnv('S3_BUCKET', ENV.S3_BUCKET);
    vi.stubEnv('S3_ACCESS_KEY', ENV.S3_ACCESS_KEY);
    vi.stubEnv('S3_SECRET_KEY', ENV.S3_SECRET_KEY);
    vi.stubEnv('JWT_ACCESS_SECRET', ENV.JWT_ACCESS_SECRET);
    vi.stubEnv('JWT_REFRESH_SECRET', ENV.JWT_REFRESH_SECRET);
    vi.stubEnv('SMTP_HOST', ENV.SMTP_HOST);
    vi.stubEnv('SMTP_PORT', ENV.SMTP_PORT);
    vi.stubEnv('MAIL_FROM', ENV.MAIL_FROM);
    vi.stubEnv('APP_ENV', ENV.APP_ENV);
    vi.stubEnv('LOG_LEVEL', ENV.LOG_LEVEL);
    vi.stubEnv('FRONTEND_URL', ENV.FRONTEND_URL);
    vi.stubEnv('API_INTERNAL_URL', ENV.API_INTERNAL_URL);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('expone authConfig y storageConfig tipados a través de ConfigModule', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: configProviders,
        }),
      ],
    }).compile();

    const auth = moduleRef.get<AuthConfig>(authConfig.KEY);
    const storage = moduleRef.get<StorageConfig>(storageConfig.KEY);

    expect(auth).toEqual({
      accessSecret: MIN_SECRET,
      refreshSecret: `different-${MIN_SECRET}`,
      accessTokenTtl: '15m',
      refreshTokenTtl: '30d',
    });
    expect(storage).toEqual({
      endpoint: 'http://minio:9000',
      publicEndpoint: 'http://localhost:9000',
      bucket: 'recipes',
      accessKey: 'minioadmin',
      secretKey: 'minioadmin',
    });

    await moduleRef.close();
  });
});
