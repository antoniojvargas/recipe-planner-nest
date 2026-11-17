import { NextResponse, type NextRequest } from 'next/server';

/** Cookies de sesión que el middleware puede renovar. El resto no se toca. */
const SESSION_COOKIES = ['access_token', 'refresh_token', 'csrf_token'] as const;
type SessionCookie = (typeof SESSION_COOKIES)[number];

/**
 * Se refresca un poco antes de que el token caduque: una navegación que dure más que los
 * segundos restantes acabaría llamando a la API con un token ya vencido.
 */
const EXPIRY_SKEW_SECONDS = 30;

const REQUEST_ID_HEADER = 'x-request-id';
const CSRF_HEADER = 'x-csrf-token';

function apiInternalUrl(): string | null {
  const url = process.env.API_INTERNAL_URL?.trim();

  return url?.replace(/\/+$/, '') ?? null;
}

function frontendUrl(): string | null {
  const url = process.env.FRONTEND_URL?.trim();

  return url?.replace(/\/+$/, '') ?? null;
}

/** `exp` del JWT sin verificar la firma: la API es la que valida el token. */
function accessTokenExpiresAt(token: string): number | null {
  const payload = token.split('.').at(1);

  if (payload === undefined) {
    return null;
  }

  try {
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const parsed: unknown = JSON.parse(atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')));

    if (typeof parsed !== 'object' || parsed === null || !('exp' in parsed)) {
      return null;
    }

    return typeof parsed.exp === 'number' ? parsed.exp : null;
  } catch {
    return null;
  }
}

/** ¿La navegación debe renovar la sesión antes de renderizarse? */
export function shouldRefresh(accessToken: string | undefined, nowSeconds: number): boolean {
  if (accessToken === undefined) {
    return false;
  }

  const expiresAt = accessTokenExpiresAt(accessToken);

  return expiresAt === null || expiresAt - nowSeconds <= EXPIRY_SKEW_SECONDS;
}

interface ParsedCookie {
  name: string;
  value: string;
  options: {
    path?: string;
    maxAge?: number;
    expires?: Date;
    httpOnly?: boolean;
    secure?: boolean;
    sameSite?: 'lax' | 'strict' | 'none';
  };
}

/** Convierte un `Set-Cookie` en nombre, valor y atributos para `NextResponse.cookies`. */
export function parseSetCookie(header: string): ParsedCookie | null {
  const [pair = '', ...attributes] = header.split(';');
  const separator = pair.indexOf('=');

  if (separator <= 0) {
    return null;
  }

  const name = pair.slice(0, separator).trim();
  const value = pair.slice(separator + 1).trim();
  const options: ParsedCookie['options'] = {};

  for (const attribute of attributes) {
    const [rawKey = '', ...rawValue] = attribute.split('=');
    const key = rawKey.trim().toLowerCase();
    const attributeValue = rawValue.join('=').trim();

    switch (key) {
      case 'path':
        options.path = attributeValue;
        break;
      case 'max-age':
        options.maxAge = Number(attributeValue);
        break;
      case 'expires':
        options.expires = new Date(attributeValue);
        break;
      case 'httponly':
        options.httpOnly = true;
        break;
      case 'secure':
        options.secure = true;
        break;
      case 'samesite': {
        const sameSite = attributeValue.toLowerCase();

        if (sameSite === 'lax' || sameSite === 'strict' || sameSite === 'none') {
          options.sameSite = sameSite;
        }
        break;
      }
    }
  }

  return { name, value, options };
}

/** Reemplaza (o elimina, con `null`) cookies de la cabecera que se reenvía al render. */
export function updateCookieHeader(
  header: string | null,
  updates: ReadonlyMap<string, string | null>,
): string {
  const kept = (header ?? '')
    .split(';')
    .map((pair) => pair.trim())
    .filter((pair) => pair.length > 0)
    .filter((pair) => !updates.has(pair.slice(0, pair.indexOf('='))));

  for (const [name, value] of updates) {
    if (value !== null) {
      kept.push(`${name}=${value}`);
    }
  }

  return kept.join('; ');
}

function clearSessionCookies(response: NextResponse): void {
  for (const name of SESSION_COOKIES) {
    response.cookies.set(name, '', { path: '/', maxAge: 0, httpOnly: true, sameSite: 'lax' });
  }
}

function setCookieHeaders(headers: Headers): string[] {
  // `getSetCookie()` no está en todos los runtimes de middleware; el fallback separa la
  // cabecera combinada sin romperse con la coma de `Expires`.
  const bag = headers as unknown as { getSetCookie?: () => string[] };

  if (typeof bag.getSetCookie === 'function') {
    return bag.getSetCookie.call(headers);
  }

  const combined = headers.get('set-cookie');

  return combined === null ? [] : combined.split(/,(?=[^;,]+=)/);
}

/**
 * Renueva la sesión **antes** de que el Server Component llame a la API.
 *
 * Un Server Component no puede escribir cookies: si `apiFetch` recibe un 401 `TOKEN_EXPIRED`
 * ya no hay forma de guardar el `Set-Cookie` del refresh. El middleware, en cambio, corre
 * antes del render y puede reescribir las cookies de la petición y de la respuesta, así que
 * el render continúa una sola vez con credenciales nuevas.
 */
export async function middleware(request: NextRequest): Promise<NextResponse> {
  const accessToken = request.cookies.get('access_token')?.value;
  const refreshToken = request.cookies.get('refresh_token')?.value;

  if (!shouldRefresh(accessToken, Math.floor(Date.now() / 1000)) || refreshToken === undefined) {
    return NextResponse.next();
  }

  const baseUrl = apiInternalUrl();
  const origin = frontendUrl();
  const csrfToken = request.cookies.get('csrf_token')?.value;
  const requestId = request.headers.get(REQUEST_ID_HEADER) ?? crypto.randomUUID();

  if (baseUrl === null || origin === null || accessToken === undefined) {
    return NextResponse.next();
  }

  let refreshResponse: Response;

  try {
    refreshResponse = await fetch(`${baseUrl}/api/auth/refresh`, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        cookie: [
          `refresh_token=${refreshToken}`,
          ...(csrfToken === undefined ? [] : [`csrf_token=${csrfToken}`]),
        ].join('; '),
        origin,
        [CSRF_HEADER]: csrfToken ?? '',
        [REQUEST_ID_HEADER]: requestId,
      },
      cache: 'no-store',
    });
  } catch {
    // Si la API no responde, la petición sigue su curso y el layout de sesión decide.
    return NextResponse.next();
  }

  if (!refreshResponse.ok) {
    // La sesión ya no se puede renovar: se borran las cookies para no reintentar en cada
    // navegación y el layout de la app redirige a login.
    const response = NextResponse.next();

    clearSessionCookies(response);

    return response;
  }

  const updates = new Map<string, string | null>();
  const renewedCookies: ParsedCookie[] = [];

  for (const header of setCookieHeaders(refreshResponse.headers)) {
    const cookie = parseSetCookie(header);

    if (cookie !== null && SESSION_COOKIES.includes(cookie.name as SessionCookie)) {
      updates.set(cookie.name, cookie.options.maxAge === 0 ? null : cookie.value);
      renewedCookies.push(cookie);
    }
  }

  const headers = new Headers(request.headers);
  headers.set('cookie', updateCookieHeader(request.headers.get('cookie'), updates));

  const response = NextResponse.next({ request: { headers } });

  for (const cookie of renewedCookies) {
    response.cookies.set(cookie.name, cookie.value, cookie.options);
  }

  return response;
}

/**
 * Solo rutas de la app: ni estáticos, ni imágenes, ni `/api` (el rewrite y el cliente del
 * navegador gestionan sus propios reintentos), ni el socket. Refrescar en cada asset sería
 * una llamada al refresh por recurso.
 */
export const config = {
  matcher: [
    '/((?!api|socket.io|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml)$).*)',
  ],
};
