import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PantryItem, PantryItemSchema } from './pantry-item.schema.js';
import { PantryRepository } from './pantry.repository.js';

/**
 * Despensa del hogar: lo que ya hay en casa y se descuenta de la lista de la compra.
 */
@Module({
  imports: [MongooseModule.forFeature([{ name: PantryItem.name, schema: PantryItemSchema }])],
  providers: [PantryRepository],
  exports: [MongooseModule, PantryRepository],
})
export class PantryModule {}
