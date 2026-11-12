import { Module } from '@nestjs/common';
import { createObserveModule } from '@nestjs/observe';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AuthModule } from './auth/auth.module.js';
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
  providers: [AppService],
})
export class AppModule {}
