import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { WorkerModule } from './worker.module.js';

/**
 * Entrada del proceso `worker` (misma imagen que la API, `node dist/worker.js`).
 *
 * Crea el contexto de Nest sin servidor HTTP. Los `@Processor` de BullMQ empiezan a consumir
 * al inicializar; los hooks de apagado cierran los workers y sus conexiones a Redis.
 */
const app = await NestFactory.createApplicationContext(WorkerModule, { bufferLogs: true });

app.useLogger(app.get(Logger));
app.enableShutdownHooks();
