import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Logger } from 'nestjs-pino';
import { AppModule, ObserveInstrument } from './app.module.js';
import { configureApp } from './app.setup.js';
import { exposeRequestId, requestIdAdapterOptions } from './config/request-id.js';

const app = await NestFactory.create<NestFastifyApplication>(
  AppModule,
  new FastifyAdapter(requestIdAdapterOptions()),
  {
    // La app arranca antes de que pino esté listo; los logs de arranque se enlazan después.
    bufferLogs: true,
    instrument: ObserveInstrument,
  },
);

app.useLogger(app.get(Logger));
exposeRequestId(app);
await configureApp(app);

// SIGTERM/SIGINT pasan por el apagado ordenado: Nest deja de aceptar conexiones HTTP y
// `ShutdownService` cierra sockets, colas, Redis y Mongo en ese orden. `useProcessExit` deja
// que pino vacíe sus buffers antes de terminar el proceso.
app.enableShutdownHooks([], { useProcessExit: true });

await app.listen(process.env.PORT ?? 3000, '0.0.0.0');
