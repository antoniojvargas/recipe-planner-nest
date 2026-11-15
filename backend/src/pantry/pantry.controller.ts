import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { UNITS_LIST } from '@recipe-planner/contracts';
import { ParseObjectIdPipe } from '../common/pipes/parse-object-id.pipe.js';
import { HouseholdMemberGuard } from '../households/guards/household-member.guard.js';
import { PantryRepository } from './pantry.repository.js';
import type { PantryItem } from './pantry-item.schema.js';

@Controller('households/:householdId/pantry')
@UseGuards(HouseholdMemberGuard)
export class PantryController {
  constructor(private readonly pantryRepository: PantryRepository) {}

  /** Obtiene todos los artículos de la despensa del hogar. */
  @Get()
  @HttpCode(HttpStatus.OK)
  async getPantry(@Param('householdId', ParseObjectIdPipe) householdId: string): Promise<PantryItem[]> {
    return this.pantryRepository.findByHousehold(householdId);
  }

  /** Agrega o actualiza un artículo en la despensa.
   *  Si el artículo ya existe, actualiza su cantidad y unidad.
   */
  @Post()
  @HttpCode(HttpStatus.OK)
  async upsertPantryItem(
    @Param('householdId', ParseObjectIdPipe) householdId: string,
    @Body() dto: { name: string; quantity: number; unit: (typeof UNITS_LIST)[number] },
  ): Promise<PantryItem | null> {
    return this.pantryRepository.upsert(householdId, dto);
  }

  /** Remueve un artículo de la despensa por nombre. */
  @Delete(':name')
  @HttpCode(HttpStatus.OK)
  async removePantryItem(
    @Param('householdId', ParseObjectIdPipe) householdId: string,
    @Param('name') name: string,
  ): Promise<boolean> {
    return this.pantryRepository.remove(householdId, name);
  }
}
