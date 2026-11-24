import { Injectable, BadRequestException, Inject } from '@nestjs/common';
import { SOCKET_EVENTS, type MealPlanUpdatedPayload } from '@recipe-planner/contracts';
import { isWeekStart, toWeekStartString } from '../common/week.js';
import { MealPlan, MealPlanSlot, MEALS } from './meal-plan.schema.js';
import { toMealPlanResponse, type MealPlanResponse } from './meal-plan.types.js';
import { MealPlansRepository } from './meal-plans.repository.js';
import { RecipesRepository } from '../recipes/recipes.repository.js';
import { REALTIME_PUBLISHER, type RealtimePublisher } from '../realtime/realtime-publisher.js';
import { Types } from 'mongoose';

type UpdatedSlot = MealPlanUpdatedPayload['slots'][number];

function toSavedPlanResponse(plan: MealPlan | null): MealPlanResponse {
  if (plan === null) {
    throw new BadRequestException('No se pudo guardar el plan de la semana');
  }

  return toMealPlanResponse(plan);
}

@Injectable()
export class MealPlansService {
  constructor(
    private readonly mealPlansRepository: MealPlansRepository,
    private readonly recipesRepository: RecipesRepository,
    @Inject(REALTIME_PUBLISHER) private readonly publisher: RealtimePublisher,
  ) {}

  async getPlan(householdId: string, weekStart: Date): Promise<MealPlanResponse> {
    if (!isWeekStart(weekStart)) {
      throw new BadRequestException('weekStart debe ser el lunes de la semana a las 00:00 UTC');
    }

    const plan = await this.mealPlansRepository.upsertEmpty(householdId, weekStart);

    if (plan === null) {
      throw new BadRequestException('No se pudo crear el plan de la semana');
    }

    return toMealPlanResponse(plan);
  }

  async updateSlots(
    householdId: string,
    weekStart: Date,
    dto: { day: number; meal: string; recipeId?: string; servings?: number },
  ): Promise<MealPlanResponse> {
    if (dto.day < 0 || dto.day > 6) {
      throw new BadRequestException('day debe ser un entero entre 0 (lunes) y 6 (domingo)');
    }

    if (!MEALS.includes(dto.meal as (typeof MEALS)[number])) {
      throw new BadRequestException(`meal debe ser uno de: ${MEALS.join(', ')}`);
    }

    // Buscar el plan (usa lean, puede retornar null)
    const plan = await this.mealPlansRepository.findByWeek(householdId, weekStart);
    if (plan === null) {
      throw new BadRequestException('El plan de la semana no existe');
    }

    // Si recipeId es nulo/undefined, se quita la receta del slot (elimina el slot)
    if (dto.recipeId == null) {
      const previous = plan.slots.find((slot) => slot.day === dto.day && slot.meal === dto.meal);
      const filteredSlots = plan.slots.filter(
        (slot) => !(slot.day === dto.day && slot.meal === dto.meal),
      );
      const result = await this.mealPlansRepository.replaceSlots(
        householdId,
        weekStart,
        filteredSlots,
      );

      this.publishUpdated(householdId, weekStart, [
        {
          day: dto.day as UpdatedSlot['day'],
          meal: dto.meal as UpdatedSlot['meal'],
          recipeId: null,
          servings: previous?.servings ?? 0,
        },
      ]);

      return toSavedPlanResponse(result);
    }

    // Validar que la receta existe y pertenece al hogar usando findById
    const recipeById = await this.recipesRepository.findById(householdId, dto.recipeId);
    if (recipeById === null) {
      throw new BadRequestException('La receta especificada no existe en este hogar');
    }

    // Verificar si ya existe una receta en este slot
    const existingSlotIndex = plan.slots.findIndex(
      (slot) => slot.day === dto.day && slot.meal === dto.meal,
    );

    const newSlot: MealPlanSlot = {
      day: dto.day,
      meal: dto.meal as (typeof MEALS)[number],
      recipeId: new Types.ObjectId(dto.recipeId),
      servings: dto.servings ?? recipeById.servings,
    };

    const updatedSlot: UpdatedSlot = {
      day: newSlot.day as UpdatedSlot['day'],
      meal: newSlot.meal,
      recipeId: newSlot.recipeId.toString(),
      servings: newSlot.servings,
    };

    if (existingSlotIndex >= 0) {
      // Ya hay una receta en este slot, actualizarla
      const result = await this.mealPlansRepository.replaceSlots(householdId, weekStart, [
        ...plan.slots.slice(0, existingSlotIndex),
        newSlot,
        ...plan.slots.slice(existingSlotIndex + 1),
      ]);

      this.publishUpdated(householdId, weekStart, [updatedSlot]);

      return toSavedPlanResponse(result);
    }

    // No hay receta en este slot, agregar una nueva
    const result = await this.mealPlansRepository.replaceSlots(householdId, weekStart, [
      ...plan.slots,
      newSlot,
    ]);

    this.publishUpdated(householdId, weekStart, [updatedSlot]);

    return toSavedPlanResponse(result);
  }

  /** Notifica solo los huecos que cambiaron; el cliente actualiza su plan sin releerlo. */
  private publishUpdated(householdId: string, weekStart: Date, slots: UpdatedSlot[]): void {
    this.publisher.publish(SOCKET_EVENTS.mealPlanUpdated, {
      householdId,
      weekStart: toWeekStartString(weekStart),
      slots,
    });
  }
}
