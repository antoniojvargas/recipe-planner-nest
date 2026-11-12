import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Logger } from 'nestjs-pino';
import { AppModule, ObserveInstrument } from './app.module.js';
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

await app.listen(process.env.PORT ?? 3000, '0.0.0.0');
