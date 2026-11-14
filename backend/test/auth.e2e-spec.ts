import 'reflect-metadata';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test, type TestingModule } from '@nestjs/testing';
import argon2 from 'argon2';
import { Types } from 'mongoose';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import type { ErrorResponse } from '@recipe-planner/contracts';
import { AppModule } from './../src/app.module.js';
import { configureApp } from './../src/app.setup.js';
import type { AuthResponse } from './../src/auth/auth.types.js';
import { ARGON2_OPTIONS } from './../src/auth/password.hasher.js';
import { RefreshSessionsRepository } from './../src/auth/refresh-sessions.repository.js';
import { UsersRepository } from './../src/users/users.repository.js';
import { withFakeInfra } from './support/fake-infra.js';

const PASSWORD = 'Correcta123';
const USER_ID = new Types.ObjectId();

function responseCookies(response: request.Response): string[] {
  const header = response.headers['set-cookie'] as unknown;

  if (Array.isArray(header)) {
    return header as string[];
  }

  return typeof header === 'string' ? [header] : [];
}

function cookieNamed(cookies: string[], name: string): string | undefined {
  return cookies.find((cookie) => cookie.startsWith(`${name}=`));
}

describe('Auth: registro y login (e2e)', () => {
  let app: NestFastifyApplication;
  let passwordHash: string;

  const users = {
    create: vi.fn(),
    findByEmailWithPassword: vi.fn(),
  };
  const refreshSessions = { create: vi.fn().mockResolvedValue({}) };

  const publicUser = {
    _id: USER_ID,
    email: 'ana@example.com',
    displayName: 'Ana',
  };

  beforeAll(async () => {
    passwordHash = await argon2.hash(PASSWORD, ARGON2_OPTIONS);

    const moduleFixture: TestingModule = await withFakeInfra(
      Test.createTestingModule({ imports: [AppModule] }),
    )
      .overrideProvider(UsersRepository)
      .useValue(users)
      .overrideProvider(RefreshSessionsRepository)
      .useValue(refreshSessions)
      .compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await configureApp(app);
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    users.create.mockResolvedValue({ ...publicUser, passwordHash });
    users.findByEmailWithPassword.mockResolvedValue(null);
  });

  afterAll(async () => {
    await app.close();
  });

  it('registra, guarda argon2id y abre la sesión en las dos cookies', async () => {
    const response = await request(app.getHttpServer() as App)
      .post('/api/auth/register')
      .send({ email: '  Ana@Example.COM ', password: PASSWORD, displayName: '  Ana ' })
      .expect(201);

    expect(response.body).toEqual({
      user: { id: USER_ID.toString(), email: 'ana@example.com', displayName: 'Ana' },
    });

    const created = users.create.mock.calls[0]?.[0] as { email: string; passwordHash: string };
    expect(created.email).toBe('ana@example.com');
    expect(created.passwordHash).toMatch(/^\$argon2id\$/);
    expect(created.passwordHash).not.toContain(PASSWORD);
    expect(refreshSessions.create).toHaveBeenCalledWith(
      expect.objectContaining({ userId: USER_ID.toString() }),
    );

    const cookies = responseCookies(response);
    const access = cookieNamed(cookies, 'access_token');
    const refresh = cookieNamed(cookies, 'refresh_token');
    const secure = process.env.APP_ENV === 'production';

    expect(access).toContain('Path=/api;');
    expect(access).toContain('HttpOnly');
    expect(access).toContain('SameSite=Lax');
    expect(access).toContain('Max-Age=900');
    expect(refresh).toContain('Path=/api/auth/refresh;');
    expect(refresh).toContain('HttpOnly');
    expect(refresh).toContain('SameSite=Lax');
    expect(refresh).toContain('Max-Age=2592000');

    if (secure) {
      expect(access).toContain('Secure');
      expect(refresh).toContain('Secure');
    } else {
      expect(access).not.toContain('Secure');
      expect(refresh).not.toContain('Secure');
    }
  });

  it('inicia sesión con la contraseña correcta y responde 200', async () => {
    users.findByEmailWithPassword.mockResolvedValue({ ...publicUser, passwordHash });

    const response = await request(app.getHttpServer() as App)
      .post('/api/auth/login')
      .send({ email: 'ana@example.com', password: PASSWORD })
      .expect(200);

    expect((response.body as AuthResponse).user.id).toBe(USER_ID.toString());
    expect(cookieNamed(responseCookies(response), 'access_token')).toBeDefined();
    expect(cookieNamed(responseCookies(response), 'refresh_token')).toBeDefined();
  });

  it('responde lo mismo con email inexistente y con contraseña incorrecta', async () => {
    const unknownEmail = await request(app.getHttpServer() as App)
      .post('/api/auth/login')
      .send({ email: 'nadie@example.com', password: PASSWORD })
      .expect(401);

    users.findByEmailWithPassword.mockResolvedValue({ ...publicUser, passwordHash });
    const wrongPassword = await request(app.getHttpServer() as App)
      .post('/api/auth/login')
      .send({ email: 'ana@example.com', password: 'Incorrecta123' })
      .expect(401);

    expect(unknownEmail.body).toEqual(wrongPassword.body);
    expect(unknownEmail.body).toEqual({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Email o contraseña incorrectos',
        details: [],
      },
    });
    expect(responseCookies(unknownEmail)).toHaveLength(0);
    expect(responseCookies(wrongPassword)).toHaveLength(0);
    expect(refreshSessions.create).not.toHaveBeenCalled();
  });

  it('valida el cuerpo antes de tocar la base', async () => {
    const invalidEmail = await request(app.getHttpServer() as App)
      .post('/api/auth/login')
      .send({ email: 'no-es-un-email', password: PASSWORD })
      .expect(400);

    expect((invalidEmail.body as ErrorResponse).error.code).toBe('VALIDATION_ERROR');
    expect((invalidEmail.body as ErrorResponse).error.details).toContainEqual({
      field: 'email',
      message: 'El email no es válido',
    });

    const shortPassword = await request(app.getHttpServer() as App)
      .post('/api/auth/register')
      .send({ email: 'ana@example.com', password: 'corta', displayName: 'Ana' })
      .expect(400);

    expect((shortPassword.body as ErrorResponse).error.details).toContainEqual({
      field: 'password',
      message: 'La contraseña debe tener al menos 8 caracteres',
    });
    expect(users.create).not.toHaveBeenCalled();
  });
});
