import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser, type AuthenticatedUser } from '../auth/decorators/current-user.decorator.js';
import { ParseObjectIdPipe } from '../common/pipes/parse-object-id.pipe.js';
import { HouseholdMemberGuard } from '../households/guards/household-member.guard.js';
import { ConfirmImageDto } from '../media/dto/confirm-image.dto.js';
import { CreateRecipeDto } from './dto/create-recipe.dto.js';
import { ListRecipesQueryDto } from './dto/list-recipes-query.dto.js';
import { UpdateRecipeDto } from './dto/update-recipe.dto.js';
import { RecipesService } from './recipes.service.js';
import type { RecipeListResponse, RecipeResponse } from './recipes.types.js';

/**
 * Recetario de un hogar. El guard comprueba la membresía antes de llegar aquí (404 si el
 * usuario no pertenece al hogar) y el controlador solo valida y delega en el servicio.
 */
@Controller('households/:householdId/recipes')
@UseGuards(HouseholdMemberGuard)
export class RecipesController {
  constructor(private readonly recipesService: RecipesService) {}

  @Post()
  async create(
    @Param('householdId', ParseObjectIdPipe) householdId: string,
    @Body() dto: CreateRecipeDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<RecipeResponse> {
    return this.recipesService.create(householdId, user.id, dto);
  }

  @Get()
  async list(
    @Param('householdId', ParseObjectIdPipe) householdId: string,
    @Query() query: ListRecipesQueryDto,
  ): Promise<RecipeListResponse> {
    return this.recipesService.list(householdId, query);
  }

  @Get(':recipeId')
  async findOne(
    @Param('householdId', ParseObjectIdPipe) householdId: string,
    @Param('recipeId', ParseObjectIdPipe) recipeId: string,
  ): Promise<RecipeResponse> {
    return this.recipesService.findOne(householdId, recipeId);
  }

  @Put(':recipeId/image')
  async confirmImage(
    @Param('householdId', ParseObjectIdPipe) householdId: string,
    @Param('recipeId', ParseObjectIdPipe) recipeId: string,
    @Body() dto: ConfirmImageDto,
  ): Promise<RecipeResponse> {
    return this.recipesService.confirmImage(householdId, recipeId, dto);
  }

  @Patch(':recipeId')
  async update(
    @Param('householdId', ParseObjectIdPipe) householdId: string,
    @Param('recipeId', ParseObjectIdPipe) recipeId: string,
    @Body() dto: UpdateRecipeDto,
  ): Promise<RecipeResponse> {
    return this.recipesService.update(householdId, recipeId, dto);
  }

  @Delete(':recipeId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param('householdId', ParseObjectIdPipe) householdId: string,
    @Param('recipeId', ParseObjectIdPipe) recipeId: string,
  ): Promise<void> {
    return this.recipesService.remove(householdId, recipeId);
  }
}
