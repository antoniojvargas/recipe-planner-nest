import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser, type AuthenticatedUser } from '../auth/decorators/current-user.decorator.js';
import { ParseObjectIdPipe } from '../common/pipes/parse-object-id.pipe.js';
import { HouseholdMemberGuard } from '../households/guards/household-member.guard.js';
import { ShoppingListsRepository } from './shopping-lists.repository.js';
import { ShoppingList } from '../shopping/shopping-list.schema.js';
import { ShoppingListGenerator } from './shopping-list.generator.js';

@Controller('households/:householdId/shopping-lists')
@UseGuards(HouseholdMemberGuard)
export class ShoppingListsController {
  constructor(
    private readonly shoppingListsRepository: ShoppingListsRepository,
    private readonly shoppingListGenerator: ShoppingListGenerator,
  ) {}

  /** Regenera la lista de la compra desde el plan de la semana.
   * 
   * Flujo:
   *   1. Obtener o crear la lista existente para el hogar y semana
   *   2. Separar ítems 'manual' (se conservan con checked/checkedBy)
   *   3. Generar nuevos ítems 'plan' desde el plan de comidas
   *   4. Combinar: manuales conservados + plan regenerados (preservando checked cuándo coincide nombre)
   *   5. Guardar la lista regenerada
   */
  @Post(':weekStart/generate')
  @HttpCode(HttpStatus.OK)
  async generate(
    @Param('householdId', ParseObjectIdPipe) householdId: string,
    @Param('weekStart') weekStart: string,
  ): Promise<ShoppingList> {
    // Parsear la fecha de inicio de semana (lunes a las 00:00 UTC)
    const date = new Date(weekStart);

    // 1. Obtener o crear la lista existente
    const list = await this.shoppingListsRepository.findByWeek(householdId, date);
    // Crear lista nueva si no existe
    let shoppingList: ShoppingList;
    if (list === null) {
      shoppingList = await this.shoppingListsRepository.replaceItems(
        householdId,
        date,
        [],
      );
    } else {
      shoppingList = list;
    }

    // 2. Separar ítems 'manual' de los 'plan'
    const manualItems = shoppingList.items.filter(
      (item) => item.source === 'manual',
    );
    const planItems = shoppingList.items.filter(
      (item) => item.source === 'plan',
    );

    // 3. Generar nuevos ítems 'plan' desde el plan de comidas
    // Usando el generator service - pasamos los manual items para preservar checked state
    const generatedPlanItems = await this.shoppingListGenerator.generatePlanItems(
      planItems,
      manualItems,
    );

    // 4. Combinar: manuales conservados + plan regenerados
    const newItems = [...manualItems, ...generatedPlanItems];

    // 5. Guardar la lista regenerada
    return this.shoppingListsRepository.replaceItems(householdId, date, newItems);
  }
}
