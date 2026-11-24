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
import { toPantryItemResponse, type PantryItemResponse } from './pantry.types.js';
import { PantryRepository } from './pantry.repository.js';

@Controller('households/:householdId/pantry')
@UseGuards(HouseholdMemberGuard)
export class PantryController {
  constructor(private readonly pantryRepository: PantryRepository) {}

  /** Obtiene todos los artículos de la despensa del hogar. */
  @Get()
  @HttpCode(HttpStatus.OK)
  async getPantry(
    @Param('householdId', ParseObjectIdPipe) householdId: string,
  ): Promise<PantryItemResponse[]> {
    const items = await this.pantryRepository.findByHousehold(householdId);

    return items.map(toPantryItemResponse);
  }

  /** Agrega o actualiza un artículo en la despensa.
   *  Si el artículo ya existe, actualiza su cantidad y unidad.
   */
  @Post()
  @HttpCode(HttpStatus.OK)
  async upsertPantryItem(
    @Param('householdId', ParseObjectIdPipe) householdId: string,
    @Body() dto: { name: string; quantity: number; unit: (typeof UNITS_LIST)[number] },
  ): Promise<PantryItemResponse | null> {
    const item = await this.pantryRepository.upsert(householdId, dto);

    return item === null ? null : toPantryItemResponse(item);
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
