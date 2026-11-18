import { Body, Controller, Get, HttpCode, HttpStatus, Param, Put, UseGuards } from '@nestjs/common';
import { HouseholdMemberGuard } from '../households/guards/household-member.guard.js';
import { MealPlansService } from './meal-plans.service.js';
import { MealPlan } from './meal-plan.schema.js';

@Controller('households/:householdId/meal-plans')
@UseGuards(HouseholdMemberGuard)
export class MealPlansController {
  constructor(private readonly mealPlansService: MealPlansService) {}

  /** Obtiene el plan de la semana actual o lo crea vacío si no existe. */
  @Get(':weekStart')
  @HttpCode(HttpStatus.OK)
  async getPlan(
    @Param('householdId') householdId: string,
    @Param('weekStart') weekStart: string,
  ): Promise<MealPlan> {
    const date = new Date(weekStart);
    return this.mealPlansService.getPlan(householdId, date);
  }

  /** Asigna o quita una receta de un slot del plan semanal. */
  @Put(':weekStart/slots')
  @HttpCode(HttpStatus.OK)
  async updateSlots(
    @Param('householdId') householdId: string,
    @Param('weekStart') weekStart: string,
    @Body() dto: { day: number; meal: string; recipeId?: string; servings?: number },
  ): Promise<MealPlan> {
    const date = new Date(weekStart);
    return this.mealPlansService.updateSlots(householdId, date, dto);
  }
}
