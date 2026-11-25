import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { configModule } from '../config/config.module.js';
import { Household, HouseholdSchema } from '../households/household.schema.js';
import { HouseholdTimeZoneMigration } from '../households/household-timezone.migration.js';
import { ShutdownModule } from '../shutdown/shutdown.module.js';
import { DatabaseModule } from './database.module.js';

/**
 * Contexto mínimo para ejecutar migraciones de datos: configuración, Mongo y los modelos que
 * tocan. No abre Redis, S3 ni el gateway de tiempo real.
 */
@Module({
  imports: [
    configModule,
    ShutdownModule,
    DatabaseModule,
    MongooseModule.forFeature([{ name: Household.name, schema: HouseholdSchema }]),
  ],
  providers: [HouseholdTimeZoneMigration],
})
export class MigrateModule {}
