import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { SOCKET_EVENTS } from '@recipe-planner/contracts';
import { Types } from 'mongoose';
import { toWeekStartString } from '../common/week.js';
import { MealPlansRepository } from '../meal-plans/meal-plans.repository.js';
import { PantryRepository } from '../pantry/pantry.repository.js';
import { REALTIME_PUBLISHER, type RealtimePublisher } from '../realtime/realtime-publisher.js';
import { UsersRepository } from '../users/users.repository.js';
import { ShoppingListGenerator } from './shopping-list.generator.js';
import { ShoppingListsRepository, type ShoppingItemInput } from './shopping-lists.repository.js';
import type { ShoppingList } from './shopping-list.schema.js';

export interface UpdateShoppingItemInput {
  quantity?: number;
  checked?: boolean;
  checkedBy?: Types.ObjectId;
}

function normalizeName(name: string): string {
  return name.toLowerCase().trim();
}

/**
 * Casos de uso de la lista de la compra.
 *
 * Generar y marcar son las dos escrituras que interesan al resto de la casa, así que después
 * de guardar se publica el evento del catálogo compartido. La publicación nunca lanza: el
 * documento ya está escrito y un fallo al notificar no puede deshacerlo.
 */
@Injectable()
export class ShoppingListsService {
  constructor(
    private readonly lists: ShoppingListsRepository,
    private readonly generator: ShoppingListGenerator,
    private readonly mealPlans: MealPlansRepository,
    private readonly pantry: PantryRepository,
    private readonly users: UsersRepository,
    @Inject(REALTIME_PUBLISHER) private readonly publisher: RealtimePublisher,
  ) {}

  /**
   * Regenera los ítems `plan` desde el plan y la despensa, conservando los manuales y el
   * estado `checked` de los que siguen existiendo con el mismo nombre.
   */
  async generate(householdId: string, weekStart: Date): Promise<ShoppingList> {
    const [existing, plan, pantryItems] = await Promise.all([
      this.lists.findByWeek(householdId, weekStart),
      this.mealPlans.findByWeek(householdId, weekStart),
      this.pantry.findByHousehold(householdId),
    ]);

    const previousItems = existing?.items ?? [];
    const manualItems = previousItems.filter((item) => item.source === 'manual');
    const manualNames = new Set(manualItems.map((item) => normalizeName(item.name)));
    const checkedByName = new Map(
      previousItems
        .filter((item) => item.source === 'plan')
        .map((item) => [normalizeName(item.name), item]),
    );

    const generated =
      plan === null ? [] : await this.generator.generate(plan, pantryItems, householdId);

    const planItems: ShoppingItemInput[] = generated
      .filter((item) => !manualNames.has(normalizeName(item.name)))
      .map((item) => {
        const previous = checkedByName.get(normalizeName(item.name));

        return {
          name: item.name,
          quantity: item.quantity,
          unit: item.unit,
          source: 'plan',
          checked: previous?.checked ?? false,
          ...(previous?.checkedBy === undefined ? {} : { checkedBy: previous.checkedBy }),
        };
      });

    const list = await this.lists.replaceItems(householdId, weekStart, [
      ...manualItems,
      ...planItems,
    ]);

    if (list === null) {
      throw new NotFoundException(
        `No se pudo guardar la lista de la compra del hogar ${householdId}`,
      );
    }

    this.publisher.publish(SOCKET_EVENTS.shoppingListRegenerated, {
      householdId,
      weekStart: toWeekStartString(weekStart),
      version: list.version,
    });

    return list;
  }

  /** Actualiza un ítem y notifica el estado resultante a los demás miembros del hogar. */
  async updateItem(
    householdId: string,
    weekStart: Date,
    itemId: Types.ObjectId,
    updates: UpdateShoppingItemInput,
  ): Promise<ShoppingList> {
    const list = await this.lists.updateItem(householdId, weekStart, itemId, updates);

    if (list === null) {
      throw new NotFoundException(
        `No se encontró la lista de la compra para el hogar ${householdId} y semana ${toWeekStartString(weekStart)}, o el ítem ${itemId.toString()} no existe en la lista`,
      );
    }

    const item = list.items.find((entry) => entry._id.toString() === itemId.toString());

    if (item === undefined) {
      throw new NotFoundException(`El ítem ${itemId.toString()} no existe en la lista`);
    }

    this.publisher.publish(SOCKET_EVENTS.shoppingItemUpdated, {
      householdId,
      weekStart: toWeekStartString(weekStart),
      itemId: item._id.toString(),
      checked: item.checked,
      checkedBy: await this.checkedBy(item.checkedBy),
      quantity: item.quantity,
      unit: item.unit,
      version: list.version,
    });

    return list;
  }

  /** Añade un ítem manual; no sustituye la lista, así que no se regenera nada. */
  async addManualItem(
    householdId: string,
    weekStart: Date,
    item: ShoppingItemInput,
  ): Promise<ShoppingList> {
    const list = await this.lists.addManualItem(householdId, weekStart, item);

    if (list === null) {
      throw new NotFoundException(
        `No se pudo crear la lista de la compra para el hogar ${householdId} y semana ${toWeekStartString(weekStart)}`,
      );
    }

    return list;
  }

  private async checkedBy(
    userId: Types.ObjectId | undefined,
  ): Promise<{ userId: string; displayName: string } | null> {
    if (userId === undefined) {
      return null;
    }

    const user = await this.users.findById(userId.toString());

    return { userId: userId.toString(), displayName: user?.displayName ?? '' };
  }
}
