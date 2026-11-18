import { lookup } from 'node:dns/promises';
import { request as httpRequest, type IncomingHttpHeaders } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { BlockList, isIP } from 'node:net';

/** Tiempo máximo de la petición completa, incluidos los saltos de redirección. */
export const SAFE_HTTP_TIMEOUT_MS = 5_000;

/** Tamaño máximo del HTML descargado. */
export const SAFE_HTTP_MAX_BYTES = 2 * 1024 * 1024;

/** Saltos de redirección permitidos. */
export const SAFE_HTTP_MAX_REDIRECTS = 3;

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

export type SafeHttpErrorCode =
  | 'INVALID_URL'
  | 'BLOCKED_HOST'
  | 'TOO_MANY_REDIRECTS'
  | 'TIMEOUT'
  | 'TOO_LARGE'
  | 'UNSUPPORTED_CONTENT_TYPE'
  | 'HTTP_ERROR'
  | 'NETWORK_ERROR';

/** Error del cliente seguro; el worker lo usa para marcar la importación como fallida. */
export class SafeHttpError extends Error {
  constructor(
    message: string,
    readonly code: SafeHttpErrorCode,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'SafeHttpError';
  }
}

/** Resuelve un nombre de host a una o varias direcciones IP. */
export type HostResolver = (hostname: string) => Promise<string[]>;

export type SafeHttpHeaders = Record<string, string | string[] | undefined>;

export interface SafeHttpRequest {
  url: URL;
  /** Dirección IP ya validada a la que se conecta; el nombre solo va en `Host` y SNI. */
  address: string;
  signal: AbortSignal;
}

export interface SafeHttpRawResponse {
  status: number;
  headers: SafeHttpHeaders;
  body: AsyncIterable<Uint8Array>;
  /** Libera el socket si el cuerpo no se llega a leer. */
  destroy?: () => void;
}

export type SafeHttpTransport = (request: SafeHttpRequest) => Promise<SafeHttpRawResponse>;

export interface SafeHttpResponse {
  /** URL final tras las redirecciones. */
  url: string;
  contentType: string;
  body: Buffer;
}

export interface SafeHttpClientOptions {
  resolver?: HostResolver;
  transport?: SafeHttpTransport;
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
}

/**
 * Rangos que nunca pueden ser destino de una importación.
 *
 * Incluye redes privadas, loopback, link-local (con la IP de metadatos de la nube),
 * CGNAT, documentación, benchmarking, multicast y reservadas, además de sus equivalentes
 * IPv6 y las direcciones IPv4 embebidas en IPv6.
 */
const BLOCKED_NETWORKS = new BlockList();

for (const [network, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const) {
  BLOCKED_NETWORKS.addSubnet(network, prefix, 'ipv4');
}

for (const [network, prefix] of [
  ['::', 128],
  ['::1', 128],
  ['64:ff9b::', 96],
  ['2001:db8::', 32],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
] as const) {
  BLOCKED_NETWORKS.addSubnet(network, prefix, 'ipv6');
}

/** Resolver del sistema; en tests se sustituye por uno falso. */
export async function systemResolver(hostname: string): Promise<string[]> {
  const records = await lookup(hostname, { all: true });

  return records.map((record) => record.address);
}

function stripBrackets(hostname: string): string {
  return hostname.startsWith('[') && hostname.endsWith(']') ? hostname.slice(1, -1) : hostname;
}

/** Una dirección es pública solo si no cae en ningún rango reservado. */
export function isPublicAddress(address: string): boolean {
  const family = isIP(address);

  if (family === 0) {
    return false;
  }

  return !BLOCKED_NETWORKS.check(address, family === 4 ? 'ipv4' : 'ipv6');
}

function headerValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function abortError(reason: unknown): SafeHttpError {
  return reason instanceof SafeHttpError
    ? reason
    : new SafeHttpError('La petición fue cancelada', 'TIMEOUT', { cause: reason });
}

/**
 * Espera a una promesa, pero falla en cuanto se aborta la señal.
 *
 * Node ya aborta `http.request` con la señal; esto cubre además un transporte inyectado que
 * no la escuche y mantiene el límite de tiempo válido durante la lectura del cuerpo.
 */
function raceWithSignal<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) {
    return Promise.reject(abortError(signal.reason));
  }

  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      reject(abortError(signal.reason));
    };

    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener('abort', onAbort);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}

/**
 * Transporte por defecto: conecta a la IP ya validada y conserva el nombre original en
 * `Host` y SNI. Al no depender de una segunda resolución, un DNS que cambie de respuesta
 * entre la comprobación y la conexión (*DNS rebinding*) no puede redirigir la petición a una
 * dirección interna.
 */
function nodeTransport({ url, address, signal }: SafeHttpRequest): Promise<SafeHttpRawResponse> {
  return new Promise((resolve, reject) => {
    const secure = url.protocol === 'https:';
    const hostname = stripBrackets(url.hostname);
    const request = (secure ? httpsRequest : httpRequest)(
      {
        protocol: url.protocol,
        hostname: address,
        port: url.port === '' ? (secure ? 443 : 80) : Number(url.port),
        path: `${url.pathname}${url.search}`,
        method: 'GET',
        headers: {
          Host: url.host,
          Accept: 'text/html,application/xhtml+xml',
          'Accept-Encoding': 'identity',
          'User-Agent': 'RecipePlannerBot/1.0',
        },
        // SNI solo si el host es un nombre: un certificado de una IP se valida contra la IP.
        ...(secure && isIP(hostname) === 0 ? { servername: hostname } : {}),
        signal,
      },
      (response) => {
        resolve({
          status: response.statusCode ?? 0,
          headers: response.headers satisfies IncomingHttpHeaders,
          body: response,
          destroy: () => {
            response.destroy();
          },
        });
      },
    );

    request.on('error', reject);
    request.end();
  });
}

/**
 * Cliente HTTP del worker para descargar páginas externas sin abrir SSRF.
 *
 * Cada URL (la inicial y cada `Location`) se valida antes de conectar: esquema, puerto,
 * credenciales y todas las direcciones que devuelve el DNS. La conexión va a una de esas
 * direcciones ya comprobadas, nunca a una resolución posterior.
 */
export class SafeHttpClient {
  private readonly resolver: HostResolver;
  private readonly transport: SafeHttpTransport;
  private readonly timeoutMs: number;
  private readonly maxBytes: number;
  private readonly maxRedirects: number;
  private readonly allowedHosts: ReadonlySet<string>;

  constructor(options: SafeHttpClientOptions = {}) {
    this.resolver = options.resolver ?? systemResolver;
    this.transport = options.transport ?? nodeTransport;
    this.timeoutMs = options.timeoutMs ?? SAFE_HTTP_TIMEOUT_MS;
    this.maxBytes = options.maxBytes ?? SAFE_HTTP_MAX_BYTES;
    this.maxRedirects = options.maxRedirects ?? SAFE_HTTP_MAX_REDIRECTS;
    this.allowedHosts =
      process.env.APP_ENV === 'test'
        ? new Set(
            (process.env.IMPORT_ALLOWED_HOSTS ?? '')
              .split(',')
              .map((host) => host.trim().toLowerCase())
              .filter((host) => host.length > 0),
          )
        : new Set();
  }

  private isAllowedHost(hostname: string): boolean {
    return this.allowedHosts.has(hostname.toLowerCase());
  }

  async get(rawUrl: string): Promise<SafeHttpResponse> {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort(new SafeHttpError('La descarga superó el tiempo máximo', 'TIMEOUT'));
    }, this.timeoutMs);

    try {
      return await raceWithSignal(this.follow(rawUrl, controller.signal), controller.signal);
    } finally {
      clearTimeout(timer);
    }
  }

  private async follow(rawUrl: string, signal: AbortSignal): Promise<SafeHttpResponse> {
    let current = this.parseUrl(rawUrl);
    let redirects = 0;

    for (;;) {
      const address = await this.resolve(current);
      let response: SafeHttpRawResponse;

      try {
        response = await raceWithSignal(this.transport({ url: current, address, signal }), signal);
      } catch (error) {
        if (error instanceof SafeHttpError) {
          throw error;
        }

        throw new SafeHttpError(`No se pudo descargar ${current.host}`, 'NETWORK_ERROR', {
          cause: error,
        });
      }

      if (REDIRECT_STATUSES.has(response.status)) {
        const location = headerValue(response.headers.location);

        if (location === undefined) {
          response.destroy?.();
          throw new SafeHttpError('La redirección no incluye Location', 'HTTP_ERROR');
        }

        if (redirects >= this.maxRedirects) {
          response.destroy?.();
          throw new SafeHttpError(
            `Se superaron las ${String(this.maxRedirects)} redirecciones permitidas`,
            'TOO_MANY_REDIRECTS',
          );
        }

        response.destroy?.();
        redirects += 1;
        current = this.parseUrl(new URL(location, current).toString());
        continue;
      }

      if (response.status < 200 || response.status >= 300) {
        response.destroy?.();
        throw new SafeHttpError(
          `La página respondió con el estado ${String(response.status)}`,
          'HTTP_ERROR',
        );
      }

      const contentType = headerValue(response.headers['content-type']);

      if (
        contentType === undefined ||
        contentType.split(';')[0]?.trim().toLowerCase() !== 'text/html'
      ) {
        response.destroy?.();
        throw new SafeHttpError('La página no es HTML', 'UNSUPPORTED_CONTENT_TYPE');
      }

      const declaredLength = Number(headerValue(response.headers['content-length']));

      if (Number.isFinite(declaredLength) && declaredLength > this.maxBytes) {
        response.destroy?.();
        throw new SafeHttpError('La página supera el tamaño máximo', 'TOO_LARGE');
      }

      try {
        const body = await raceWithSignal(this.readBody(response.body, signal), signal);

        return { url: current.toString(), contentType, body };
      } catch (error) {
        response.destroy?.();
        throw error;
      }
    }
  }

  private parseUrl(rawUrl: string): URL {
    let url: URL;

    try {
      url = new URL(rawUrl);
    } catch (error) {
      throw new SafeHttpError('La URL no es válida', 'INVALID_URL', { cause: error });
    }

    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new SafeHttpError('Solo se admiten URLs http o https', 'INVALID_URL');
    }

    if (url.username !== '' || url.password !== '') {
      throw new SafeHttpError('La URL no puede incluir credenciales', 'INVALID_URL');
    }

    const allowedPort = url.protocol === 'http:' ? '80' : '443';

    if (url.port !== '' && url.port !== allowedPort) {
      throw new SafeHttpError(
        `Solo se permite el puerto ${allowedPort} para ${url.protocol.slice(0, -1)}`,
        'INVALID_URL',
      );
    }

    if (url.hostname === '') {
      throw new SafeHttpError('La URL no tiene host', 'INVALID_URL');
    }

    return url;
  }

  private async resolve(url: URL): Promise<string> {
    const hostname = stripBrackets(url.hostname);

    if (isIP(hostname) !== 0) {
      if (!this.isAllowedHost(hostname)) {
        this.assertPublic(hostname, url);
      }

      return hostname;
    }

    let addresses: string[];

    try {
      addresses = await this.resolver(hostname);
    } catch (error) {
      throw new SafeHttpError(`No se pudo resolver ${hostname}`, 'BLOCKED_HOST', {
        cause: error,
      });
    }

    if (addresses.length === 0) {
      throw new SafeHttpError(`No se pudo resolver ${hostname}`, 'BLOCKED_HOST');
    }

    if (!this.isAllowedHost(hostname)) {
      for (const address of addresses) {
        this.assertPublic(address, url);
      }
    }

    // Se conecta a la primera dirección validada; no se vuelve a resolver el nombre.
    return addresses[0];
  }

  private assertPublic(address: string, url: URL): void {
    if (!isPublicAddress(address)) {
      throw new SafeHttpError(
        `La URL ${url.host} apunta a una dirección no pública (${address})`,
        'BLOCKED_HOST',
      );
    }
  }

  private async readBody(body: AsyncIterable<Uint8Array>, signal: AbortSignal): Promise<Buffer> {
    const chunks: Buffer[] = [];
    let size = 0;

    for await (const chunk of body) {
      if (signal.aborted) {
        throw abortError(signal.reason);
      }

      size += chunk.byteLength;

      if (size > this.maxBytes) {
        throw new SafeHttpError('La página supera el tamaño máximo', 'TOO_LARGE');
      }

      chunks.push(Buffer.from(chunk));
    }

    return Buffer.concat(chunks);
  }
}
