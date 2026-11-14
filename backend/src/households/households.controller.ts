import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser, type AuthenticatedUser } from '../auth/decorators/current-user.decorator.js';
import { ParseObjectIdPipe } from '../common/pipes/parse-object-id.pipe.js';
import { HouseholdRole } from './decorators/household-role.decorator.js';
import { CreateHouseholdDto } from './dto/create-household.dto.js';
import { JoinHouseholdDto } from './dto/join-household.dto.js';
import { HouseholdMemberGuard } from './guards/household-member.guard.js';
import { HouseholdsService } from './households.service.js';
import type { HouseholdInviteResponse, HouseholdResponse } from './households.types.js';

/** Hogares del usuario autenticado. Solo valida entrada y delega en el servicio. */
@Controller('households')
export class HouseholdsController {
  constructor(private readonly householdsService: HouseholdsService) {}

  @Post()
  async create(
    @Body() dto: CreateHouseholdDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<HouseholdResponse> {
    return this.householdsService.create(dto.name, user.id);
  }

  @Get()
  async findMine(@CurrentUser() user: AuthenticatedUser): Promise<HouseholdResponse[]> {
    return this.householdsService.findMine(user.id);
  }

  @Post(':id/invite')
  @UseGuards(HouseholdMemberGuard)
  @HouseholdRole('owner')
  @HttpCode(HttpStatus.CREATED)
  async createInvite(
    @Param('id', ParseObjectIdPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<HouseholdInviteResponse> {
    return this.householdsService.createInvite(id, user.id);
  }

  @Post('join')
  @HttpCode(HttpStatus.OK)
  async join(
    @Body() dto: JoinHouseholdDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<HouseholdResponse> {
    return this.householdsService.joinWithCode(dto.code, user.id);
  }

  @Get(':id')
  @UseGuards(HouseholdMemberGuard)
  async findOne(
    @Param('id', ParseObjectIdPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<HouseholdResponse> {
    return this.householdsService.findOneForMember(id, user.id);
  }
}
