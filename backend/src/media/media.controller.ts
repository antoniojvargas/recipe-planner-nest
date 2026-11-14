import { Body, Controller, HttpCode, HttpStatus, Param, Post, UseGuards } from '@nestjs/common';
import { ParseObjectIdPipe } from '../common/pipes/parse-object-id.pipe.js';
import { HouseholdMemberGuard } from '../households/guards/household-member.guard.js';
import { CreateUploadUrlDto } from './dto/create-upload-url.dto.js';
import { MediaService } from './media.service.js';
import type { UploadUrlResponse } from './media.types.js';

/**
 * Subidas directas al almacenamiento. El guard comprueba la membresía antes de firmar nada:
 * la clave siempre queda bajo el prefijo del hogar de la ruta.
 */
@Controller('households/:householdId/media')
@UseGuards(HouseholdMemberGuard)
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

  @Post('upload-url')
  @HttpCode(HttpStatus.CREATED)
  async createUploadUrl(
    @Param('householdId', ParseObjectIdPipe) householdId: string,
    @Body() dto: CreateUploadUrlDto,
  ): Promise<UploadUrlResponse> {
    return this.mediaService.createUploadUrl(householdId, dto);
  }
}
