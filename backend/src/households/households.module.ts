import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AUTH_CLOCK, systemAuthClock } from '../auth/auth.clock.js';
import { Household, HouseholdSchema } from './household.schema.js';
import { HouseholdsController } from './households.controller.js';
import { HouseholdsRepository } from './households.repository.js';
import { HouseholdsService } from './households.service.js';

/**
 * Hogares compartidos, membresías, roles e invitaciones con código.
 *
 * Exporta `MongooseModule` y `HouseholdsRepository` para que otros módulos (auth, recetas,
 * planes, lista de la compra) resuelvan el hogar sin duplicar el registro del modelo.
 */
@Module({
  imports: [MongooseModule.forFeature([{ name: Household.name, schema: HouseholdSchema }])],
  controllers: [HouseholdsController],
  providers: [
    HouseholdsRepository,
    HouseholdsService,
    { provide: AUTH_CLOCK, useValue: systemAuthClock },
  ],
  exports: [MongooseModule, HouseholdsRepository],
})
export class HouseholdsModule {}
