import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PantryItem, PantryItemSchema } from './pantry-item.schema.js';

/**
 * Despensa del hogar: lo que ya hay en casa y se descuenta de la lista de la compra.
 */
@Module({
  imports: [MongooseModule.forFeature([{ name: PantryItem.name, schema: PantryItemSchema }])],
  exports: [MongooseModule],
})
export class PantryModule {}
