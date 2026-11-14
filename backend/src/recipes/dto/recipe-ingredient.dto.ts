import { UNITS_LIST, type Unit } from '@recipe-planner/contracts';
import { Transform, Type } from 'class-transformer';
import { IsIn, IsNumber, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/** Ingrediente tal como lo envía el cliente al crear o editar una receta. */
export class RecipeIngredientDto {
  @Transform(trim)
  @IsString({ message: 'El nombre del ingrediente debe ser texto' })
  @MinLength(1, { message: 'El nombre del ingrediente es obligatorio' })
  @MaxLength(120, { message: 'El nombre del ingrediente no puede superar los 120 caracteres' })
  name!: string;

  @Type(() => Number)
  @IsNumber({}, { message: 'La cantidad debe ser un número' })
  @Min(0, { message: 'La cantidad no puede ser negativa' })
  quantity!: number;

  @IsIn(UNITS_LIST, {
    message: `La unidad debe ser una del catálogo: ${UNITS_LIST.join(', ')}`,
  })
  unit!: Unit;

  @Transform(trim)
  @IsOptional()
  @IsString({ message: 'La nota del ingrediente debe ser texto' })
  @MaxLength(200, { message: 'La nota del ingrediente no puede superar los 200 caracteres' })
  note?: string;
}
