import crypto from 'node:crypto';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';

const apiURL = process.env.E2E_API_URL ?? 'http://localhost:3000';
const origin = 'http://localhost:3001';
const csrfToken = 'e2e-csrf-token';
const accessSecret =
  process.env.E2E_JWT_ACCESS_SECRET ?? 'e2e-access-secret-with-32-characters-min';

function currentWeekStart(now = new Date()): string {
  const monday = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const weekday = monday.getUTCDay();
  monday.setUTCDate(monday.getUTCDate() - (weekday === 0 ? 6 : weekday - 1));
  return monday.toISOString().slice(0, 10);
}

function base64url(input: Buffer | string): string {
  const buffer = typeof input === 'string' ? Buffer.from(input) : input;
  return buffer.toString('base64url');
}

function signHs256Jwt(payload: Record<string, unknown>, secret: string): string {
  const header = { alg: 'HS256', typ: 'JWT' };
  const encodedHeader = base64url(JSON.stringify(header));
  const encodedPayload = base64url(JSON.stringify(payload));
  const data = `${encodedHeader}.${encodedPayload}`;
  const signature = crypto.createHmac('sha256', secret).update(data).digest('base64url');
  return `${data}.${signature}`;
}

function decodeJwtPayload(token: string): Record<string, unknown> {
  const [, payload] = token.split('.');
  if (payload === undefined) {
    throw new Error('JWT sin payload');
  }
  return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Record<
    string,
    unknown
  >;
}

async function getCookie(context: BrowserContext, name: string): Promise<string> {
  const cookies = await context.cookies();
  const cookie = cookies.find((item) => item.name === name);
  if (cookie === undefined) {
    throw new Error(`Cookie ${name} no encontrada`);
  }
  return cookie.value;
}

async function setCookie(
  context: BrowserContext,
  name: string,
  value: string,
): Promise<void> {
  await context.addCookies([
    {
      name,
      value,
      domain: 'localhost',
      path: '/',
      httpOnly: true,
      sameSite: 'Lax',
    },
  ]);
}

async function setExpiredAccessToken(context: BrowserContext): Promise<void> {
  const accessToken = await getCookie(context, 'access_token');
  const payload = decodeJwtPayload(accessToken);
  const sub = payload.sub;
  const fid = payload.fid;
  if (typeof sub !== 'string' || typeof fid !== 'string') {
    throw new Error('El access token no contiene sub/fid válidos');
  }
  const now = Math.floor(Date.now() / 1000);
  const expired = signHs256Jwt(
    { sub, fid, iat: now - 3600, exp: now - 60 },
    accessSecret,
  );
  await setCookie(context, 'access_token', expired);
}

async function register(page: Page): Promise<void> {
  const response = await page.context().request.post(`${apiURL}/api/auth/register`, {
    headers: {
      Origin: origin,
      'X-CSRF-Token': csrfToken,
      Cookie: `csrf_token=${csrfToken}`,
      'Content-Type': 'application/json',
    },
    data: {
      email: `session+${Date.now()}@example.com`,
      password: 'Recetas123!',
      displayName: 'Ana',
    },
  });
  expect(response.status(), await response.text()).toBe(201);
}

test('refresca la sesión de forma transparente y la cierra al reutilizar un refresh token viejo', async ({
  page,
}) => {
  const weekStart = currentWeekStart();
  const context = page.context();

  await register(page);
  await page.goto(`/plan/${weekStart}`);
  await expect(page.getByText('Plan semanal')).toBeVisible({ timeout: 15_000 });

  const oldRefreshToken = await getCookie(context, 'refresh_token');

  await page.clock.install({ time: Date.now() });
  await page.clock.fastForward(16 * 60 * 1000);

  // Fuerza que el servidor considere caducado el access token para disparar el
  // refresh transparente (middleware) al navegar.
  await setExpiredAccessToken(context);

  await page.goto('/pantry');
  await expect(page).toHaveURL(/\/pantry/);
  await expect(page.getByRole('heading', { name: 'Lo que hay en casa' })).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByLabel('Correo electrónico')).toHaveCount(0);

  // Reutiliza a mano el refresh token anterior (ya rotado): el backend detecta la
  // reutilización y revoca la familia completa.
  const reuse = await page.request.post(`${apiURL}/api/auth/refresh`, {
    headers: {
      Origin: origin,
      'X-CSRF-Token': csrfToken,
      Cookie: `csrf_token=${csrfToken}; refresh_token=${oldRefreshToken}`,
      Accept: 'application/json',
    },
  });
  expect(reuse.status()).toBe(401);

  // Con la familia revocada, forzamos de nuevo la caducidad del access token para
  // que el siguiente intento de refresh falle y se cierre la sesión.
  await setExpiredAccessToken(context);

  await page.goto(`/plan/${weekStart}`);
  await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
  await expect(page.getByLabel('Correo electrónico')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Entrar' })).toBeVisible();
});
