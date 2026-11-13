import { Module } from '@nestjs/common';
import { APP_FILTER, APP_PIPE } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { createObserveModule } from '@nestjs/observe';
import { LoggerModule } from 'nestjs-pino';
import { fileURLToPath } from 'node:url';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AuthModule } from './auth/auth.module.js';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter.js';
import { createValidationPipe } from './common/pipes/validation.pipe.js';
import { appConfig } from './config/app.config.js';
import { configProviders, validateEnvironment, type AppConfig } from './config/index.js';
import { createLoggerOptions } from './config/logger.config.js';
import { HouseholdsModule } from './households/households.module.js';
import { ImportsModule } from './imports/imports.module.js';
import { MealPlansModule } from './meal-plans/meal-plans.module.js';
import { MediaModule } from './media/media.module.js';
import { PantryModule } from './pantry/pantry.module.js';
import { RealtimeModule } from './realtime/realtime.module.js';
import { RecipesModule } from './recipes/recipes.module.js';
import { ShoppingModule } from './shopping/shopping.module.js';
import { UsersModule } from './users/users.module.js';

export const { ObserveModule, ObserveInstrument } = createObserveModule();

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      // El `.env` vive en la raíz del repo; en Docker las variables llegan del compose.
      envFilePath: [fileURLToPath(new URL('../../.env', import.meta.url)), '.env'],
      expandVariables: true,
      load: configProviders,
      // Falla el arranque si falta una variable o un secreto no cumple el mínimo.
      validate: validateEnvironment,
    }),
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
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    // Global para que también lo reciban las apps de test que importan `AppModule`.
    { provide: APP_PIPE, useFactory: createValidationPipe },
  ],
})
export class AppModule {}
