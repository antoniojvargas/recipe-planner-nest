import { Body, Controller, HttpCode, HttpStatus, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser, type AuthenticatedUser } from '../auth/decorators/current-user.decorator.js';
import { ParseObjectIdPipe } from '../common/pipes/parse-object-id.pipe.js';
import { HouseholdMemberGuard } from '../households/guards/household-member.guard.js';
import { CreateImportDto } from './dto/create-import.dto.js';
import { ImportsService } from './imports.service.js';
import type { ImportJobResponse } from './imports.types.js';

/**
 * Importación de recetas desde una URL.
 *
 * El guard comprueba la membresía antes de crear nada. La respuesta es `202`: el trabajo se
 * procesa en segundo plano y el cliente recibe el identificador para seguirlo.
 */
@Controller('households/:householdId/imports')
@UseGuards(HouseholdMemberGuard)
export class ImportsController {
  constructor(private readonly importsService: ImportsService) {}

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  async create(
    @Param('householdId', ParseObjectIdPipe) householdId: string,
    @Body() dto: CreateImportDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ImportJobResponse> {
    return this.importsService.create(householdId, user.id, dto);
  }
}
