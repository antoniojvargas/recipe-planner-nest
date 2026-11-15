import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Logger } from 'nestjs-pino';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter.js';
import { ThrottlerModule } from '@nestjs/throttler';
import { AppModule, ObserveInstrument } from './app.module.js';
import { configureApp } from './app.setup.js';
import { exposeRequestId, requestIdAdapterOptions } from './config/request-id.js';
import { registerRealtimeAdapter } from './realtime/redis-io.adapter.js';

async function bootstrap() {
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

  // Configuración de Swagger / OpenAPI
  const documentBuilder = new DocumentBuilder()
    .setTitle('Recipe Planner API')
    .setDescription('API para el planificador de recetas')
    .setVersion('1.0')
    .addServer(process.env.PUBLIC_URL ?? 'http://localhost:3000', 'Servidor de la API')
    .addSecurity('cookie', {
      type: 'apiKey',
      in: 'cookie',
      name: 'access_token',
    })
    .addSecurity('bearer', {
      type: 'http',
      scheme: 'bearer',
      bearerFormat: 'JWT',
    })
    .addSecurityRequirements('cookie')
    .addSecurityRequirements('bearer')
    .addTag('auth', 'Autenticación y sesiones')
    .addTag('households', 'Gestión de hogares')
    .addTag('recipes', 'Recetas y planes')
    .addTag('shopping', 'Listas de la compra')
    .addTag('imports', 'Importaciones')
    .addTag('media', 'Media y thumbnails')
    .addTag('health', 'Health checks')
    .build();

  const document = SwaggerModule.createDocument(app, documentBuilder);

  // La UI de Swagger sólo está disponible fuera de producción para evitar exponer
  // rutas internas en entornos de despliegue. En producción se sirve un HTML
  // estático mínimamente diferente que apunta al contrato versionado.
  const isProduction = process.env.NODE_ENV === 'production';

  if (!isProduction) {
    // Swagger UI con CSP relajada solo en entornos de desarrollo/local.
    // Esto permite cargar los recursos (CSS/JS) desde CDNs o orígenes mixtos
    // sin que el policy de seguridad del navegador bloquee la UI.
    SwaggerModule.setup('docs', app, document, {
      swaggerOptions: {
        persistAuthorization: true,
        displayOperations: true,
      },
      customSiteTitle: 'Recipe Planner API Docs',
    });
  } else {
    // En producción servimos solo el JSON en /json; la UI no está expuesta.
    SwaggerModule.setup('json', app, document, {
      swaggerOptions: {
        persistAuthorization: true,
      },
    });
  }

  // Configuración de @nestjs/throttler
  // Se usa el almacenamiento por defecto (en memoria para desarrollo).
  // Los límites específicos se aplicarán mediante el decorador @Throttle() en los
  // controladores correspondientes (auth, users, households, imports).
  // Ejemplos de límites configurables con @Throttle():
  // - @Throttle(5, 60) - 5 logins por minuto por IP y email
  // - @Throttle(30, 3600) - 30 refresh por hora por familia
  // - @Throttle(10, 3600) - 10 importaciones por hora por hogar
  // - @Throttle(120, 1) - 120 escrituras por minuto por usuario
  ThrottlerModule.forRoot();

  // Socket.IO sobre Redis: varias réplicas comparten salas y el worker puede publicar. Se
  // registra antes de escuchar porque el servidor de sockets se crea al inicializar.
  registerRealtimeAdapter(app);

  // SIGTERM/SIGINT pasan por el apagado ordenado: Nest deja de aceptar conexiones HTTP y
  // `ShutdownService` cierra sockets, colas, Redis y Mongo en ese orden. `useProcessExit` deja
  // que pino vacíe sus buffers antes de terminar el proceso.
  app.enableShutdownHooks([], { useProcessExit: true });

  await app.listen(process.env.PORT ?? 3000, '0.0.0.0');
}

bootstrap();