import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AUTH_CLOCK, systemAuthClock } from '../auth/auth.clock.js';
import { RealtimeRoomsModule } from '../realtime/realtime-rooms.module.js';
import { Household, HouseholdSchema } from './household.schema.js';
import { HouseholdsController } from './households.controller.js';
import { HouseholdsRepository } from './households.repository.js';
import { HouseholdsService } from './households.service.js';

/**
 * Hogares compartidos, membresías, roles e invitaciones con código.
 *
 * Exporta `MongooseModule`, `HouseholdsRepository` y `HouseholdsService` para que otros módulos
 * (auth, recetas, planes, lista de la compra, tiempo real) resuelvan el hogar sin duplicar el
 * registro del modelo. Importa `RealtimeRoomsModule` para actualizar las salas de Socket.IO
 * cuando cambia una membresía.
 */
@Module({
  imports: [
    MongooseModule.forFeature([{ name: Household.name, schema: HouseholdSchema }]),
    RealtimeRoomsModule,
  ],
  controllers: [HouseholdsController],
  providers: [
    HouseholdsRepository,
    HouseholdsService,
    { provide: AUTH_CLOCK, useValue: systemAuthClock },
  ],
  exports: [MongooseModule, HouseholdsRepository, HouseholdsService],
})
export class HouseholdsModule {}
