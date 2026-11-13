import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Household, HouseholdSchema } from './household.schema.js';

/**
 * Hogares compartidos, membresías, roles e invitaciones con código.
 *
 * Exporta `MongooseModule` para que los agregados que cuelgan del hogar (recetas, planes,
 * lista de la compra) puedan resolver sus referencias sin duplicar el registro del modelo.
 */
@Module({
  imports: [MongooseModule.forFeature([{ name: Household.name, schema: HouseholdSchema }])],
  exports: [MongooseModule],
})
export class HouseholdsModule {}
