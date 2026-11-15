import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { HouseholdsModule } from '../households/households.module.js';
import { MealPlansModule } from '../meal-plans/meal-plans.module.js';
import { PantryModule } from '../pantry/pantry.module.js';
import { RealtimePublisherModule } from '../realtime/realtime-publisher.module.js';
import { RecipesModule } from '../recipes/recipes.module.js';
import { UsersModule } from '../users/users.module.js';
import { ShoppingList, ShoppingListSchema } from './shopping-list.schema.js';
import { ShoppingListGenerator } from './shopping-list.generator.js';
import { ShoppingListsController } from './shopping-lists.controller.js';
import { ShoppingListsRepository } from './shopping-lists.repository.js';
import { ShoppingListsService } from './shopping-lists.service.js';

/**
 * Lista de la compra: generación desde el plan y la despensa, marcado y edición de ítems.
 *
 * Importa los módulos de los que lee (plan, despensa, recetas y usuarios) y el publicador de
 * eventos, que notifica la lista regenerada y cada ítem marcado al resto del hogar.
 */
@Module({
  imports: [
    MongooseModule.forFeature([{ name: ShoppingList.name, schema: ShoppingListSchema }]),
    HouseholdsModule,
    MealPlansModule,
    PantryModule,
    RecipesModule,
    UsersModule,
    RealtimePublisherModule,
  ],
  controllers: [ShoppingListsController],
  providers: [ShoppingListsRepository, ShoppingListGenerator, ShoppingListsService],
  exports: [MongooseModule, ShoppingListsRepository],
})
export class ShoppingModule {}
