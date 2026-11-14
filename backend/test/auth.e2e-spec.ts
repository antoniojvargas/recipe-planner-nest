import 'reflect-metadata';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test, type TestingModule } from '@nestjs/testing';
import argon2 from 'argon2';
import { SignJWT } from 'jose';
import { Types } from 'mongoose';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import type { ErrorResponse } from '@recipe-planner/contracts';
import { AppModule } from './../src/app.module.js';
import { configureApp } from './../src/app.setup.js';
import { AuthTokensService } from './../src/auth/auth-tokens.service.js';
import type { AuthResponse } from './../src/auth/auth.types.js';
import { ARGON2_OPTIONS } from './../src/auth/password.hasher.js';
import { RefreshSessionsRepository } from './../src/auth/refresh-sessions.repository.js';
import { HouseholdsRepository } from './../src/households/households.repository.js';
import { UsersRepository } from './../src/users/users.repository.js';
import { withFakeInfra } from './support/fake-infra.js';

const PASSWORD = 'Correcta123';
const USER_ID = new Types.ObjectId();
const ORIGIN = 'http://localhost:3001';
const CSRF_TOKEN = 'test-csrf-token';
const CSRF_COOKIE = `csrf_token=${CSRF_TOKEN}`;

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

describe('Auth: sesión (e2e)', () => {
  let app: NestFastifyApplication;
  let tokens: AuthTokensService;
  let passwordHash: string;

  const users = {
    create: vi.fn(),
    findById: vi.fn(),
    findByEmailWithPassword: vi.fn(),
  };
  const households = {
    create: vi.fn().mockResolvedValue({}),
  };
  const refreshSessions = {
    create: vi.fn().mockResolvedValue({}),
    claimForRotation: vi.fn(),
    findByTokenHash: vi.fn(),
    revokeFamily: vi.fn().mockResolvedValue(undefined),
    revokeAllForUser: vi.fn().mockResolvedValue(undefined),
    withTransaction: vi.fn(async (work: (session: unknown) => Promise<unknown>) =>
      work({ id: 'transaccion' }),
    ),
  };

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
      .overrideProvider(HouseholdsRepository)
      .useValue(households)
      .overrideProvider(RefreshSessionsRepository)
      .useValue(refreshSessions)
      .compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await configureApp(app);
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    tokens = app.get(AuthTokensService);
  });

  beforeEach(() => {
    vi.clearAllMocks();
    users.create.mockResolvedValue({ ...publicUser, passwordHash });
    households.create.mockResolvedValue({});
    users.findById.mockResolvedValue(null);
    users.findByEmailWithPassword.mockResolvedValue(null);
    refreshSessions.claimForRotation.mockResolvedValue(null);
    refreshSessions.findByTokenHash.mockResolvedValue(null);
  });

  afterAll(async () => {
    await app.close();
  });

  it('registra, guarda argon2id, crea su hogar propio y abre la sesión en las dos cookies', async () => {
    const response = await request(app.getHttpServer() as App)
      .post('/api/auth/register')
      .set('Origin', ORIGIN)
      .set('X-CSRF-Token', CSRF_TOKEN)
      .set('Cookie', CSRF_COOKIE)
      .send({ email: '  Ana@Example.COM ', password: PASSWORD, displayName: '  Ana ' })
      .expect(201);

    expect(response.body).toEqual({
      user: { id: USER_ID.toString(), email: 'ana@example.com', displayName: 'Ana' },
    });

    const created = users.create.mock.calls[0]?.[0] as { email: string; passwordHash: string };
    expect(created.email).toBe('ana@example.com');
    expect(created.passwordHash).toMatch(/^\$argon2id\$/);
    expect(created.passwordHash).not.toContain(PASSWORD);
    expect(households.create).toHaveBeenCalledWith({
      name: 'Hogar de Ana',
      members: [{ userId: USER_ID, role: 'owner', joinedAt: expect.any(Date) as unknown }],
    });
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
      .set('Origin', ORIGIN)
      .set('X-CSRF-Token', CSRF_TOKEN)
      .set('Cookie', CSRF_COOKIE)
      .send({ email: 'ana@example.com', password: PASSWORD })
      .expect(200);

    expect((response.body as AuthResponse).user.id).toBe(USER_ID.toString());
    expect(cookieNamed(responseCookies(response), 'access_token')).toBeDefined();
    expect(cookieNamed(responseCookies(response), 'refresh_token')).toBeDefined();
  });

  it('responde lo mismo con email inexistente y con contraseña incorrecta', async () => {
    const unknownEmail = await request(app.getHttpServer() as App)
      .post('/api/auth/login')
      .set('Origin', ORIGIN)
      .set('X-CSRF-Token', CSRF_TOKEN)
      .set('Cookie', CSRF_COOKIE)
      .send({ email: 'nadie@example.com', password: PASSWORD })
      .expect(401);

    users.findByEmailWithPassword.mockResolvedValue({ ...publicUser, passwordHash });
    const wrongPassword = await request(app.getHttpServer() as App)
      .post('/api/auth/login')
      .set('Origin', ORIGIN)
      .set('X-CSRF-Token', CSRF_TOKEN)
      .set('Cookie', CSRF_COOKIE)
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

  describe('refresh', () => {
    const familyId = '6f1e7a4e-0f4c-4f6e-9f0e-9c1f5b2a3d4c';

    it('rota el token y responde 204 con las dos cookies nuevas', async () => {
      refreshSessions.claimForRotation.mockResolvedValue({ familyId, userId: USER_ID });

      const response = await request(app.getHttpServer() as App)
        .post('/api/auth/refresh')
        .set('Origin', ORIGIN)
        .set('X-CSRF-Token', CSRF_TOKEN)
        .set('Cookie', [CSRF_COOKIE, 'refresh_token=token-viejo'])
        .expect(204);

      expect(refreshSessions.claimForRotation).toHaveBeenCalledWith(
        expect.stringMatching(/^[0-9a-f]{64}$/),
        expect.any(Date),
        expect.anything(),
      );
      expect(refreshSessions.create).toHaveBeenCalledWith(
        expect.objectContaining({ familyId, userId: USER_ID.toString() }),
        expect.anything(),
      );

      const cookies = responseCookies(response);
      expect(cookieNamed(cookies, 'access_token')).toContain('Path=/api;');
      expect(cookieNamed(cookies, 'refresh_token')).toContain('Path=/api/auth/refresh;');
    });

    it('si el token ya se usó, revoca la familia y responde 401', async () => {
      refreshSessions.findByTokenHash.mockResolvedValue({
        familyId,
        userId: USER_ID,
        usedAt: new Date('2026-11-13T11:00:00.000Z'),
        revokedAt: null,
        expiresAt: new Date('2026-12-13T00:00:00.000Z'),
      });

      const response = await request(app.getHttpServer() as App)
        .post('/api/auth/refresh')
        .set('Origin', ORIGIN)
        .set('X-CSRF-Token', CSRF_TOKEN)
        .set('Cookie', [CSRF_COOKIE, 'refresh_token=token-robado'])
        .expect(401);

      expect(refreshSessions.revokeFamily).toHaveBeenCalledWith(
        familyId,
        expect.any(Date),
        expect.anything(),
      );
      expect((response.body as ErrorResponse).error).toEqual({
        code: 'UNAUTHORIZED',
        message: 'La sesión no es válida',
        details: [],
      });
      expect(responseCookies(response)).toHaveLength(0);
    });

    it('responde TOKEN_EXPIRED para un refresh caducado', async () => {
      refreshSessions.findByTokenHash.mockResolvedValue({
        familyId,
        userId: USER_ID,
        usedAt: null,
        revokedAt: null,
        expiresAt: new Date('2026-11-12T00:00:00.000Z'),
      });

      const response = await request(app.getHttpServer() as App)
        .post('/api/auth/refresh')
        .set('Origin', ORIGIN)
        .set('X-CSRF-Token', CSRF_TOKEN)
        .set('Cookie', [CSRF_COOKIE, 'refresh_token=token-caducado'])
        .expect(401);

      expect((response.body as ErrorResponse).error.code).toBe('TOKEN_EXPIRED');
      expect(refreshSessions.revokeFamily).not.toHaveBeenCalled();
    });

    it('responde 401 si no llega la cookie', async () => {
      const response = await request(app.getHttpServer() as App)
        .post('/api/auth/refresh')
        .set('Origin', ORIGIN)
        .set('X-CSRF-Token', CSRF_TOKEN)
        .set('Cookie', CSRF_COOKIE)
        .expect(401);

      expect((response.body as ErrorResponse).error.code).toBe('UNAUTHORIZED');
      expect(refreshSessions.withTransaction).not.toHaveBeenCalled();
    });
  });

  describe('me', () => {
    const familyId = '6f1e7a4e-0f4c-4f6e-9f0e-9c1f5b2a3d4c';

    it('devuelve el perfil del usuario autenticado', async () => {
      users.findById.mockResolvedValue(publicUser);

      const response = await request(app.getHttpServer() as App)
        .get('/api/auth/me')
        .set(
          'Cookie',
          `access_token=${await tokens.createAccessToken(USER_ID.toString(), familyId)}`,
        )
        .expect(200);

      expect(response.body).toEqual({
        user: { id: USER_ID.toString(), email: 'ana@example.com', displayName: 'Ana' },
      });
    });

    it('responde 401 si no llega el access token', async () => {
      const response = await request(app.getHttpServer() as App)
        .get('/api/auth/me')
        .expect(401);

      expect((response.body as ErrorResponse).error).toEqual({
        code: 'UNAUTHORIZED',
        message: 'La sesión no es válida',
        details: [],
      });
    });

    it('responde TOKEN_EXPIRED si el access token caducó', async () => {
      const expired = await new SignJWT({ fid: familyId })
        .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
        .setSubject(USER_ID.toString())
        .setExpirationTime(Math.floor(Date.now() / 1_000) - 60)
        .sign(new TextEncoder().encode(process.env.JWT_ACCESS_SECRET));

      const response = await request(app.getHttpServer() as App)
        .get('/api/auth/me')
        .set('Cookie', `access_token=${expired}`)
        .expect(401);

      expect((response.body as ErrorResponse).error.code).toBe('TOKEN_EXPIRED');
    });
  });

  describe('logout', () => {
    const familyId = '6f1e7a4e-0f4c-4f6e-9f0e-9c1f5b2a3d4c';

    async function accessToken(): Promise<string> {
      return tokens.createAccessToken(USER_ID.toString(), familyId);
    }

    it('revoca la familia actual y borra las dos cookies', async () => {
      const response = await request(app.getHttpServer() as App)
        .post('/api/auth/logout')
        .set('Origin', ORIGIN)
        .set('X-CSRF-Token', CSRF_TOKEN)
        .set('Cookie', [CSRF_COOKIE, `access_token=${await accessToken()}`])
        .expect(204);

      expect(refreshSessions.revokeFamily).toHaveBeenCalledWith(familyId, expect.any(Date));
      expect(refreshSessions.revokeAllForUser).not.toHaveBeenCalled();

      const cookies = responseCookies(response);
      expect(cookieNamed(cookies, 'access_token')).toContain('Max-Age=0');
      expect(cookieNamed(cookies, 'refresh_token')).toContain('Max-Age=0');
      expect(cookieNamed(cookies, 'access_token')).toContain('Path=/api;');
      expect(cookieNamed(cookies, 'refresh_token')).toContain('Path=/api/auth/refresh;');
    });

    it('revoca todas las sesiones del usuario en logout-all', async () => {
      const response = await request(app.getHttpServer() as App)
        .post('/api/auth/logout-all')
        .set('Origin', ORIGIN)
        .set('X-CSRF-Token', CSRF_TOKEN)
        .set('Cookie', [CSRF_COOKIE, `access_token=${await accessToken()}`])
        .expect(204);

      expect(refreshSessions.revokeAllForUser).toHaveBeenCalledWith(
        USER_ID.toString(),
        expect.any(Date),
      );
      expect(refreshSessions.revokeFamily).not.toHaveBeenCalled();
      expect(responseCookies(response)).toHaveLength(2);
    });

    it('responde TOKEN_EXPIRED sin borrar cookies para permitir el refresco', async () => {
      const expired = await new SignJWT({ fid: familyId })
        .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
        .setSubject(USER_ID.toString())
        .setExpirationTime(Math.floor(Date.now() / 1_000) - 60)
        .sign(new TextEncoder().encode(process.env.JWT_ACCESS_SECRET));

      const response = await request(app.getHttpServer() as App)
        .post('/api/auth/logout')
        .set('Origin', ORIGIN)
        .set('X-CSRF-Token', CSRF_TOKEN)
        .set('Cookie', [CSRF_COOKIE, `access_token=${expired}`])
        .expect(401);

      expect((response.body as ErrorResponse).error.code).toBe('TOKEN_EXPIRED');
      expect(responseCookies(response)).toHaveLength(0);
      expect(refreshSessions.revokeFamily).not.toHaveBeenCalled();
    });

    it('responde 401 sin cookie y no revoca nada', async () => {
      const response = await request(app.getHttpServer() as App)
        .post('/api/auth/logout-all')
        .set('Origin', ORIGIN)
        .set('X-CSRF-Token', CSRF_TOKEN)
        .set('Cookie', CSRF_COOKIE)
        .expect(401);

      expect((response.body as ErrorResponse).error).toEqual({
        code: 'UNAUTHORIZED',
        message: 'La sesión no es válida',
        details: [],
      });
      expect(responseCookies(response)).toHaveLength(0);
      expect(refreshSessions.revokeAllForUser).not.toHaveBeenCalled();
    });
  });

  it('valida el cuerpo antes de tocar la base', async () => {
    const invalidEmail = await request(app.getHttpServer() as App)
      .post('/api/auth/login')
      .set('Origin', ORIGIN)
      .set('X-CSRF-Token', CSRF_TOKEN)
      .set('Cookie', CSRF_COOKIE)
      .send({ email: 'no-es-un-email', password: PASSWORD })
      .expect(400);

    expect((invalidEmail.body as ErrorResponse).error.code).toBe('VALIDATION_ERROR');
    expect((invalidEmail.body as ErrorResponse).error.details).toContainEqual({
      field: 'email',
      message: 'El email no es válido',
    });

    const shortPassword = await request(app.getHttpServer() as App)
      .post('/api/auth/register')
      .set('Origin', ORIGIN)
      .set('X-CSRF-Token', CSRF_TOKEN)
      .set('Cookie', CSRF_COOKIE)
      .send({ email: 'ana@example.com', password: 'corta', displayName: 'Ana' })
      .expect(400);

    expect((shortPassword.body as ErrorResponse).error.details).toContainEqual({
      field: 'password',
      message: 'La contraseña debe tener al menos 8 caracteres',
    });
    expect(users.create).not.toHaveBeenCalled();
  });
});
