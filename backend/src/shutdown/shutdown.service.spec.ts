import { Logger } from '@nestjs/common';
import { ShutdownService } from './shutdown.service.js';

beforeEach(() => {
  // El caso de fallo registra un error esperado; se silencia para no ensuciar la salida.
  vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ShutdownService', () => {
  it('cierra las tareas en orden de prioridad', async () => {
    const service = new ShutdownService();
    const calls: string[] = [];

    service.register({ name: 'mongo', order: 40, close: () => void calls.push('mongo') });
    service.register({ name: 'sockets', order: 10, close: () => void calls.push('sockets') });
    service.register({ name: 'redis', order: 30, close: () => void calls.push('redis') });

    await service.onApplicationShutdown('SIGTERM');

    expect(calls).toEqual(['sockets', 'redis', 'mongo']);
  });

  it('sigue cerrando los demás recursos cuando uno falla', async () => {
    const service = new ShutdownService();
    const closed: string[] = [];

    service.register({
      name: 'redis',
      order: 30,
      close: () => Promise.reject(new Error('sin conexión')),
    });
    service.register({ name: 'mongo', order: 40, close: () => void closed.push('mongo') });

    await service.onApplicationShutdown();

    expect(closed).toEqual(['mongo']);
  });

  it('no repite el cierre si llega otra señal', async () => {
    const service = new ShutdownService();
    const close = vi.fn();

    service.register({ name: 'redis', order: 30, close });

    await Promise.all([service.onApplicationShutdown('SIGTERM'), service.onApplicationShutdown()]);
    await service.onApplicationShutdown('SIGINT');

    expect(close).toHaveBeenCalledOnce();
  });
});
