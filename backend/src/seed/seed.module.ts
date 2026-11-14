import { Module } from '@nestjs/common';
import { configModule } from '../config/config.module.js';
import { DatabaseModule } from '../database/database.module.js';
import { HouseholdsModule } from '../households/households.module.js';
import { MealPlansModule } from '../meal-plans/meal-plans.module.js';
import { PantryModule } from '../pantry/pantry.module.js';
import { RecipesModule } from '../recipes/recipes.module.js';
import { ShutdownModule } from '../shutdown/shutdown.module.js';
import { UsersModule } from '../users/users.module.js';
import { SeedService } from './seed.service.js';

/**
 * Contexto mínimo del seed: configuración, Mongo y los agregados que se rellenan.
 *
 * No importa `AppModule` para no abrir Redis, S3 ni el gateway de tiempo real: un seed solo
 * necesita la base de datos.
 */
@Module({
  imports: [
    configModule,
    ShutdownModule,
    DatabaseModule,
    UsersModule,
    HouseholdsModule,
    RecipesModule,
    MealPlansModule,
    PantryModule,
  ],
  providers: [SeedService],
})
export class SeedModule {}
