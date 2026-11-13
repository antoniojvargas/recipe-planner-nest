import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ShoppingList, ShoppingListSchema } from './shopping-list.schema.js';

/**
 * Lista de la compra: generación desde el plan, marcado y edición de ítems.
 */
@Module({
  imports: [MongooseModule.forFeature([{ name: ShoppingList.name, schema: ShoppingListSchema }])],
  exports: [MongooseModule],
})
export class ShoppingModule {}
