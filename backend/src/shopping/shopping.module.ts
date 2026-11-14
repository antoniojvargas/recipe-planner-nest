import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ShoppingList, ShoppingListSchema } from './shopping-list.schema.js';
import { ShoppingListsRepository } from './shopping-lists.repository.js';

/**
 * Lista de la compra: generación desde el plan, marcado y edición de ítems.
 */
@Module({
  imports: [MongooseModule.forFeature([{ name: ShoppingList.name, schema: ShoppingListSchema }])],
  providers: [ShoppingListsRepository],
  exports: [MongooseModule, ShoppingListsRepository],
})
export class ShoppingModule {}
