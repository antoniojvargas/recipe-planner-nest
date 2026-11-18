import { beforeEach, describe, expect, it, vi } from 'vitest';

const { ioMock, refreshSessionMock } = vi.hoisted(() => ({
  ioMock: vi.fn(),
  refreshSessionMock: vi.fn(),
}));

vi.mock('socket.io-client', () => ({ io: ioMock }));
vi.mock('@/lib/api-client', () => ({ refreshSession: refreshSessionMock }));

type Listener = (payload?: unknown) => void;

class FakeSocket {
  connected = false;
  listeners = new Map<string, Listener[]>();
  connect = vi.fn(() => {
    this.connected = true;
  });
  disconnect = vi.fn(() => {
    this.connected = false;
  });
  removeAllListeners = vi.fn(() => {
    this.listeners.clear();
  });

  on(event: string, listener: Listener): this {
    const listeners = this.listeners.get(event) ?? [];

    listeners.push(listener);
    this.listeners.set(event, listeners);

    return this;
  }

  fire(event: string, payload?: unknown): void {
    for (const listener of this.listeners.get(event) ?? []) {
      listener(payload);
    }
  }
}

let fakeSocket: FakeSocket;

async function loadSocketModule(): Promise<typeof import('./socket')> {
  vi.resetModules();

  return import('./socket');
}

beforeEach(() => {
  fakeSocket = new FakeSocket();
  ioMock.mockReset();
  ioMock.mockImplementation(() => fakeSocket);
  refreshSessionMock.mockReset();
  refreshSessionMock.mockResolvedValue(true);
});

describe('acquireRealtime / releaseRealtime', () => {
  it('abre una única conexión y la cierra al soltar la última referencia', async () => {
    const { acquireRealtime, releaseRealtime } = await loadSocketModule();

    const first = acquireRealtime();
    const second = acquireRealtime();

    expect(first).toBe(second);
    expect(ioMock).toHaveBeenCalledTimes(1);
    expect(ioMock).toHaveBeenCalledWith(
      undefined,
      expect.objectContaining({ withCredentials: true, autoConnect: false }),
    );
    expect(fakeSocket.connect).toHaveBeenCalledTimes(1);

    releaseRealtime();

    expect(fakeSocket.disconnect).not.toHaveBeenCalled();

    releaseRealtime();

    expect(fakeSocket.disconnect).toHaveBeenCalledTimes(1);
    expect(fakeSocket.removeAllListeners).toHaveBeenCalledTimes(1);
  });

  it('no conecta si ya estaba conectado y vuelve a crear la conexión tras cerrarla', async () => {
    const { acquireRealtime, releaseRealtime } = await loadSocketModule();

    acquireRealtime();
    releaseRealtime();
    const socket = acquireRealtime();

    expect(socket).toBe(fakeSocket);
    expect(ioMock).toHaveBeenCalledTimes(2);
  });

  it('ignora releaseRealtime cuando no hay consumidores', async () => {
    const { releaseRealtime } = await loadSocketModule();

    expect(() => {
      releaseRealtime();
    }).not.toThrow();
  });

  it('usa NEXT_PUBLIC_API_URL cuando está definida', async () => {
    vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://localhost:3000/');

    const { acquireRealtime } = await loadSocketModule();

    acquireRealtime();

    expect(ioMock).toHaveBeenCalledWith(
      'http://localhost:3000/realtime',
      expect.objectContaining({ withCredentials: true }),
    );

    vi.unstubAllEnvs();
  });
});

describe('caducidad de la sesión', () => {
  it('refresca y reconecta al recibir session.expired', async () => {
    const { acquireRealtime } = await loadSocketModule();

    acquireRealtime();
    fakeSocket.connected = false;
    fakeSocket.fire('session.expired', { code: 'TOKEN_EXPIRED', message: 'caducado' });

    await vi.waitFor(() => {
      expect(refreshSessionMock).toHaveBeenCalledTimes(1);
      expect(fakeSocket.connect).toHaveBeenCalledTimes(2);
    });
  });

  it('refresca y reconecta cuando el handshake rechaza con TOKEN_EXPIRED', async () => {
    const { acquireRealtime } = await loadSocketModule();

    acquireRealtime();
    fakeSocket.connected = false;
    fakeSocket.fire(
      'connect_error',
      Object.assign(new Error('caducado'), {
        data: { code: 'TOKEN_EXPIRED', message: 'caducado' },
      }),
    );

    await vi.waitFor(() => {
      expect(refreshSessionMock).toHaveBeenCalledTimes(1);
      expect(fakeSocket.connect).toHaveBeenCalledTimes(2);
    });
  });

  it('comparte un solo refresh si llegan varios avisos a la vez', async () => {
    const { acquireRealtime } = await loadSocketModule();

    acquireRealtime();
    fakeSocket.connected = false;
    fakeSocket.fire('session.expired', { code: 'TOKEN_EXPIRED', message: 'caducado' });
    fakeSocket.fire('session.expired', { code: 'TOKEN_EXPIRED', message: 'caducado' });

    await vi.waitFor(() => {
      expect(refreshSessionMock).toHaveBeenCalledTimes(1);
    });
  });

  it('no reconecta si el refresh falla', async () => {
    refreshSessionMock.mockResolvedValue(false);

    const { acquireRealtime } = await loadSocketModule();

    acquireRealtime();
    fakeSocket.connected = false;
    fakeSocket.fire('session.expired', { code: 'TOKEN_EXPIRED', message: 'caducado' });

    await vi.waitFor(() => {
      expect(refreshSessionMock).toHaveBeenCalledTimes(1);
    });
    expect(fakeSocket.connect).toHaveBeenCalledTimes(1);
  });

  it('no refresca ante un error de conexión que no es TOKEN_EXPIRED', async () => {
    const { acquireRealtime } = await loadSocketModule();

    acquireRealtime();
    fakeSocket.fire(
      'connect_error',
      Object.assign(new Error('sin sesión'), {
        data: { code: 'UNAUTHORIZED', message: 'sin sesión' },
      }),
    );

    await Promise.resolve();
    expect(refreshSessionMock).not.toHaveBeenCalled();
  });

  it('no reconecta si la conexión se cerró mientras refrescaba', async () => {
    const { acquireRealtime, releaseRealtime } = await loadSocketModule();

    acquireRealtime();
    fakeSocket.connected = false;

    let resolveRefresh: (value: boolean) => void = () => undefined;
    refreshSessionMock.mockReturnValue(
      new Promise<boolean>((resolve) => {
        resolveRefresh = resolve;
      }),
    );

    fakeSocket.fire('session.expired', { code: 'TOKEN_EXPIRED', message: 'caducado' });
    releaseRealtime();
    resolveRefresh(true);

    await vi.waitFor(() => {
      expect(refreshSessionMock).toHaveBeenCalledTimes(1);
    });
    expect(fakeSocket.connect).toHaveBeenCalledTimes(1);
  });
});
