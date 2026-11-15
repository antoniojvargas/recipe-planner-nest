import {
  type HostResolver,
  type SafeHttpClientOptions,
  type SafeHttpRawResponse,
  SafeHttpClient,
  type SafeHttpRequest,
  type SafeHttpTransport,
} from './safe-http.client.js';

const PUBLIC_IP = '93.184.216.34';
const PRIVATE_IP = '127.0.0.1';

async function* chunks(...parts: string[]): AsyncIterable<Uint8Array> {
  for (const part of parts) {
    yield Buffer.from(part);
  }
  await Promise.resolve();
}

function html(body = '<html><body>Receta</body></html>'): SafeHttpRawResponse {
  return {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8' },
    body: chunks(body),
  };
}

function redirect(location: string): SafeHttpRawResponse {
  return {
    status: 302,
    headers: { location },
    body: chunks(),
    destroy: vi.fn(),
  };
}

function ipWithContentLength(length: number): SafeHttpRawResponse {
  return {
    status: 200,
    headers: { 'content-type': 'text/html', 'content-length': String(length) },
    body: (async function* generate() {
      throw new Error('El cuerpo no debería leerse');
      // `yield` inalcanzable para que el generador sea válido.
      yield new Uint8Array();
      await Promise.resolve();
    })(),
  };
}

interface Doubles {
  client: SafeHttpClient;
  resolver: ReturnType<typeof vi.fn>;
  transport: ReturnType<typeof vi.fn>;
}

function createDoubles(overrides: Partial<SafeHttpClientOptions> = {}): Doubles {
  const resolver = vi.fn().mockResolvedValue([PUBLIC_IP]);
  const transport = vi.fn().mockResolvedValue(html());

  return {
    resolver,
    transport,
    client: new SafeHttpClient({
      resolver: resolver as unknown as HostResolver,
      transport: transport as unknown as SafeHttpTransport,
      ...overrides,
    }),
  };
}

describe('SafeHttpClient', () => {
  describe('URLs permitidas', () => {
    it('descarga HTML de una URL pública y conecta a la IP validada', async () => {
      const { client, resolver, transport } = createDoubles();

      const response = await client.get('https://recetas.example.com/paella');

      expect(resolver).toHaveBeenCalledWith('recetas.example.com');
      expect(transport).toHaveBeenCalledWith(
        expect.objectContaining({
          address: PUBLIC_IP,
          url: new URL('https://recetas.example.com/paella'),
        }),
      );
      expect(response.url).toBe('https://recetas.example.com/paella');
      expect(response.contentType).toBe('text/html; charset=utf-8');
      expect(response.body.toString()).toContain('Receta');
    });

    it.each([
      'http://recetas.example.com:80/paella',
      'http://recetas.example.com/paella',
      'https://recetas.example.com:443/paella',
      'https://recetas.example.com/paella',
    ])('admite %s', async (url) => {
      const { client, transport } = createDoubles();

      await expect(client.get(url)).resolves.toMatchObject({ body: expect.any(Buffer) as unknown });
      expect(transport).toHaveBeenCalledTimes(1);
    });

    it.each([
      ['ftp://recetas.example.com/paella'],
      ['file:///etc/passwd'],
      ['http://recetas.example.com:8080/paella'],
      ['https://recetas.example.com:80/paella'],
      ['http://usuario:secreto@recetas.example.com/paella'],
      ['no es una url'],
    ])('rechaza %s sin resolver ni conectar', async (url) => {
      const { client, resolver, transport } = createDoubles();

      await expect(client.get(url)).rejects.toMatchObject({ code: 'INVALID_URL' });
      expect(resolver).not.toHaveBeenCalled();
      expect(transport).not.toHaveBeenCalled();
    });
  });

  describe('SSRF', () => {
    it.each([
      ['10.0.0.1'],
      ['172.16.0.1'],
      ['192.168.1.10'],
      ['127.0.0.1'],
      ['169.254.169.254'],
      ['100.64.0.1'],
      ['0.0.0.0'],
      ['224.0.0.1'],
      ['::1'],
      ['fe80::1'],
      ['fc00::1'],
      ['::ffff:127.0.0.1'],
      ['2001:db8::1'],
    ])('rechaza la dirección no pública %s', async (address) => {
      const { client, transport } = createDoubles();
      const resolver = vi.fn().mockResolvedValue([address]);

      const unsafe = new SafeHttpClient({
        resolver: resolver as unknown as HostResolver,
        transport: transport as unknown as SafeHttpTransport,
      });

      await expect(unsafe.get('https://recetas.example.com/paella')).rejects.toMatchObject({
        code: 'BLOCKED_HOST',
      });
      expect(transport).not.toHaveBeenCalled();
      expect(client).toBeInstanceOf(SafeHttpClient);
    });

    it('rechaza una IP literal interna sin consultar el DNS', async () => {
      const { client, resolver, transport } = createDoubles();

      await expect(client.get('http://169.254.169.254/latest/meta-data')).rejects.toMatchObject({
        code: 'BLOCKED_HOST',
      });
      expect(resolver).not.toHaveBeenCalled();
      expect(transport).not.toHaveBeenCalled();
    });

    it('rechaza el host si el DNS devuelve una mezcla de direcciones públicas y privadas', async () => {
      const { client, resolver, transport } = createDoubles();
      resolver.mockResolvedValue([PUBLIC_IP, PRIVATE_IP]);

      await expect(client.get('https://recetas.example.com/paella')).rejects.toMatchObject({
        code: 'BLOCKED_HOST',
      });
      expect(transport).not.toHaveBeenCalled();
    });

    it('conecta a la IP validada y no vuelve a resolver (DNS rebinding)', async () => {
      const { client, resolver, transport } = createDoubles();
      resolver.mockReset();
      resolver.mockResolvedValueOnce([PUBLIC_IP]).mockResolvedValue([PRIVATE_IP]);

      await client.get('https://recetas.example.com/paella');

      expect(resolver).toHaveBeenCalledTimes(1);
      expect(transport).toHaveBeenCalledWith(expect.objectContaining({ address: PUBLIC_IP }));
    });

    it('vuelve a validar el host en cada redirección (DNS rebinding en un salto)', async () => {
      const { client, resolver, transport } = createDoubles();
      resolver.mockReset();
      resolver.mockResolvedValueOnce([PUBLIC_IP]).mockResolvedValueOnce([PRIVATE_IP]);
      transport.mockResolvedValueOnce(redirect('https://otra.example.com/receta'));

      await expect(client.get('https://recetas.example.com/paella')).rejects.toMatchObject({
        code: 'BLOCKED_HOST',
      });
      expect(resolver).toHaveBeenNthCalledWith(1, 'recetas.example.com');
      expect(resolver).toHaveBeenNthCalledWith(2, 'otra.example.com');
      expect(transport).toHaveBeenCalledTimes(1);
    });
  });

  describe('redirecciones', () => {
    it('sigue hasta tres redirecciones y resuelve la URL relativa', async () => {
      const { client, transport } = createDoubles();
      transport
        .mockResolvedValueOnce(redirect('/uno'))
        .mockResolvedValueOnce(redirect('/dos'))
        .mockResolvedValueOnce(redirect('../tres'))
        .mockResolvedValueOnce(html('final'));

      const response = await client.get('https://recetas.example.com/inicio');

      expect(transport).toHaveBeenCalledTimes(4);
      expect(response.url).toBe('https://recetas.example.com/tres');
      expect(response.body.toString()).toBe('final');
    });

    it('falla al superar tres redirecciones', async () => {
      const { client, transport } = createDoubles();
      transport.mockResolvedValue(redirect('/otra'));

      await expect(client.get('https://recetas.example.com/inicio')).rejects.toMatchObject({
        code: 'TOO_MANY_REDIRECTS',
      });
      expect(transport).toHaveBeenCalledTimes(4);
    });

    it('exige Location en una redirección', async () => {
      const { client, transport } = createDoubles();
      transport.mockResolvedValueOnce({ ...redirect('/x'), headers: {} });

      await expect(client.get('https://recetas.example.com/inicio')).rejects.toMatchObject({
        code: 'HTTP_ERROR',
      });
    });
  });

  describe('contenido', () => {
    it('rechaza un tipo que no es text/html', async () => {
      const { client, transport } = createDoubles();
      transport.mockResolvedValueOnce({
        status: 200,
        headers: { 'content-type': 'application/json' },
        body: chunks('{}'),
      });

      await expect(client.get('https://recetas.example.com/paella')).rejects.toMatchObject({
        code: 'UNSUPPORTED_CONTENT_TYPE',
      });
    });

    it('rechaza una respuesta sin Content-Type', async () => {
      const { client, transport } = createDoubles();
      transport.mockResolvedValueOnce({ status: 200, headers: {}, body: chunks('<html />') });

      await expect(client.get('https://recetas.example.com/paella')).rejects.toMatchObject({
        code: 'UNSUPPORTED_CONTENT_TYPE',
      });
    });

    it('rechaza un estado que no es 2xx', async () => {
      const { client, transport } = createDoubles();
      transport.mockResolvedValueOnce({
        status: 500,
        headers: { 'content-type': 'text/html' },
        body: chunks('error'),
      });

      await expect(client.get('https://recetas.example.com/paella')).rejects.toMatchObject({
        code: 'HTTP_ERROR',
      });
    });

    it('rechaza por Content-Length antes de leer el cuerpo', async () => {
      const { client, transport } = createDoubles({ maxBytes: 1024 });
      transport.mockResolvedValueOnce(ipWithContentLength(1025));

      await expect(client.get('https://recetas.example.com/paella')).rejects.toMatchObject({
        code: 'TOO_LARGE',
      });
    });

    it('corta la lectura cuando el cuerpo supera el máximo aunque no lo declare', async () => {
      const { client, transport } = createDoubles({ maxBytes: 10 });
      transport.mockResolvedValueOnce({
        status: 200,
        headers: { 'content-type': 'text/html' },
        body: chunks('123456', '789012'),
      });

      await expect(client.get('https://recetas.example.com/paella')).rejects.toMatchObject({
        code: 'TOO_LARGE',
      });
    });
  });

  describe('tiempo y red', () => {
    it('aborta cuando se supera el tiempo máximo, también mientras espera cabeceras', async () => {
      const resolver = vi.fn().mockResolvedValue([PUBLIC_IP]);
      const transport = vi.fn(
        ({ signal }: SafeHttpRequest) =>
          new Promise<SafeHttpRawResponse>((_resolve, reject) => {
            signal.addEventListener('abort', () => {
              reject(signal.reason as Error);
            });
          }),
      );
      const client = new SafeHttpClient({
        resolver: resolver as unknown as HostResolver,
        transport: transport as unknown as SafeHttpTransport,
        timeoutMs: 20,
      });

      await expect(client.get('https://recetas.example.com/paella')).rejects.toMatchObject({
        code: 'TIMEOUT',
      });
    });

    it('envuelve un fallo de red del transporte', async () => {
      const { client, transport } = createDoubles();
      transport.mockRejectedValueOnce(new Error('ECONNRESET'));

      await expect(client.get('https://recetas.example.com/paella')).rejects.toMatchObject({
        code: 'NETWORK_ERROR',
      });
    });
  });
});
