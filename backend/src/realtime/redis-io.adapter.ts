import { Logger, type INestApplication, type INestApplicationContext } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { Redis } from 'ioredis';
import type { ServerOptions } from 'socket.io';
import { appConfig, databaseConfig, type AppConfig, type DatabaseConfig } from '../config/index.js';
import { SHUTDOWN_ORDER } from '../shutdown/shutdown.constants.js';
import { ShutdownService } from '../shutdown/shutdown.service.js';

/**
 * Prefijo de los canales de Redis. Lo comparten el adaptador y el emisor del worker, así que
 * los dos procesos tienen que usar el mismo valor para verse.
 */
export const REALTIME_REDIS_KEY = 'socket.io';

const logger = new Logger('RealtimeAdapter');

function createRedisClient(redisUrl: string): Redis {
  const client = new Redis(redisUrl);

  // Sin listener, ioredis emite `error` sin manejar y tumba el proceso.
  client.on('error', (error: Error) => {
    logger.error(`Error de conexión con Redis (Socket.IO): ${error.message}`);
  });

  return client;
}

/**
 * Cierra el cliente como el resto de la infraestructura: `quit` si está sano para vaciar las
 * respuestas pendientes y `disconnect` si está caído, para no esperar a una conexión que puede
 * no llegar.
 */
async function closeRedisClient(client: Redis): Promise<void> {
  try {
    if (client.status === 'ready') {
      await client.quit();

      return;
    }

    client.disconnect();
  } catch {
    client.disconnect();
  }
}

/**
 * Adaptador de Socket.IO sobre Redis Pub/Sub.
 *
 * Cada réplica de la API publica los eventos en Redis y todas las réplicas los reciben, así
 * que un socket conectado a una instancia ve los cambios que originó otra. El mismo canal es
 * el que usará el worker con `@socket.io/redis-emitter`: no necesita servir sockets, solo
 * publicar, y los eventos llegan a los clientes de cualquier réplica.
 *
 * El adaptador necesita dos conexiones propias, no el cliente compartido: una se queda en modo
 * suscripción y no puede ejecutar comandos normales.
 */
export class RedisIoAdapter extends IoAdapter {
  private readonly frontendOrigin: string;
  private readonly pubClient: Redis;
  private readonly subClient: Redis;
  private readonly adapterFactory: ReturnType<typeof createAdapter>;
  private closed = false;

  constructor(app: INestApplicationContext, redisUrl: string, frontendUrl: string) {
    super(app);
    this.frontendOrigin = new URL(frontendUrl).origin;
    this.pubClient = createRedisClient(redisUrl);
    this.subClient = createRedisClient(redisUrl);
    this.adapterFactory = createAdapter(this.pubClient, this.subClient, {
      key: REALTIME_REDIS_KEY,
    });
  }

  /**
   * Añade el CORS del handshake, que es el de `FRONTEND_URL` con credenciales, y monta el
   * adaptador de Redis en el servidor raíz: los namespaces lo heredan.
   */
  override createIOServer(port: number, options?: Partial<ServerOptions>) {
    const cors = typeof options?.cors === 'object' ? options.cors : undefined;
    const server = super.createIOServer(port, {
      ...options,
      cors: { ...cors, origin: this.frontendOrigin, credentials: true },
    } as ServerOptions);

    server.adapter(this.adapterFactory);

    return server;
  }

  /** Cierra las dos conexiones del adaptador. Es idempotente: el apagado puede repetirse. */
  async disconnect(): Promise<void> {
    if (this.closed) {
      return;
    }

    this.closed = true;
    await Promise.allSettled([closeRedisClient(this.pubClient), closeRedisClient(this.subClient)]);
  }
}

/**
 * Sustituye el adaptador por defecto de Nest y registra su cierre.
 *
 * Se llama antes de `listen()`: Nest crea el servidor de Socket.IO al inicializar y, si el
 * adaptador llegara después, los sockets ya estarían en el adaptador local de un solo proceso.
 */
export function registerRealtimeAdapter(app: INestApplication): RedisIoAdapter {
  const database = app.get<DatabaseConfig>(databaseConfig.KEY);
  const config = app.get<AppConfig>(appConfig.KEY);
  const adapter = new RedisIoAdapter(app, database.redisUrl, config.frontendUrl);

  app.useWebSocketAdapter(adapter);

  app.get(ShutdownService).register({
    name: 'Socket.IO',
    order: SHUTDOWN_ORDER.realtime,
    close: () => adapter.disconnect(),
  });

  return adapter;
}
