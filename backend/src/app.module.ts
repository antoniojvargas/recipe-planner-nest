import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { APP_FILTER, APP_GUARD, APP_PIPE } from '@nestjs/core';
import { createObserveModule } from '@nestjs/observe';
import { LoggerModule } from 'nestjs-pino';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AuthModule } from './auth/auth.module.js';
import { CsrfGuard } from './common/csrf/csrf.guard.js';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter.js';
import { createValidationPipe } from './common/pipes/validation.pipe.js';
import { appConfig } from './config/app.config.js';
import { databaseConfig, type AppConfig, type DatabaseConfig } from './config/index.js';
import { configModule } from './config/config.module.js';
import { createLoggerOptions } from './config/logger.config.js';
import { DatabaseModule } from './database/database.module.js';
import { HealthModule } from './health/health.module.js';
import { HouseholdsModule } from './households/households.module.js';
import { ImportsModule } from './imports/imports.module.js';
import { MealPlansModule } from './meal-plans/meal-plans.module.js';
import { MediaModule } from './media/media.module.js';
import { PantryModule } from './pantry/pantry.module.js';
import { RealtimeModule } from './realtime/realtime.module.js';
import { RecipesModule } from './recipes/recipes.module.js';
import { RedisModule } from './redis/redis.module.js';
import { bullMqConnection } from './queues/bullmq.connection.js';
import { ShoppingModule } from './shopping/shopping.module.js';
import { ShutdownModule } from './shutdown/shutdown.module.js';
import { StorageModule } from './storage/storage.module.js';
import { TestingModule } from './testing/testing.module.js';
import { UsersModule } from './users/users.module.js';

export const { ObserveModule, ObserveInstrument } = createObserveModule();

// Endpoints de mantenimiento (p. ej. reinicio de datos) disponibles solo en e2e.
const testingImports = process.env.APP_ENV === 'test' ? [TestingModule] : [];

@Module({
  imports: [
    configModule,
    LoggerModule.forRootAsync({
      inject: [appConfig.KEY],
      useFactory: (config: AppConfig) => createLoggerOptions(config),
    }),
    // Distributed tracing, auto-correlated logs, request/job metrics, error
    // telemetry, alarms, and more — out of the box. Sign up at https://observe.nestjs.com,
    // then run `npx @nestjs/observe link` to write your key pair into .env.
    ObserveModule.forRoot({
      appKey: process.env.OBSERVE_APP_KEY ?? 'YOUR_APP_KEY',
      appSecret: process.env.OBSERVE_APP_SECRET ?? 'YOUR_APP_SECRET',
      serviceId: 'backend',
    }),
    // Colas: la API solo encola; el proceso `worker` consume con la misma configuración.
    BullModule.forRootAsync({
      inject: [databaseConfig.KEY],
      useFactory: (config: DatabaseConfig) => ({
        connection: bullMqConnection(config.redisUrl),
      }),
    }),
    // Infraestructura compartida: Mongo, Redis y S3 para todos los módulos de dominio.
    // El apagado ordenado va primero para recibir las tareas de cierre de los demás.
    ShutdownModule,
    DatabaseModule,
    RedisModule,
    StorageModule,
    HealthModule,
    AuthModule,
    UsersModule,
    HouseholdsModule,
    RecipesModule,
    MediaModule,
    ImportsModule,
    MealPlansModule,
    ShoppingModule,
    PantryModule,
    RealtimeModule,
    ...testingImports,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    // Global para que también lo reciban las apps de test que importan `AppModule`.
    { provide: APP_PIPE, useFactory: createValidationPipe },
    // Doble capa CSRF (Origin + double submit) en todas las mutaciones.
    { provide: APP_GUARD, useClass: CsrfGuard },
  ],
})
export class AppModule {}
