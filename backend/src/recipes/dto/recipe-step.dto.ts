import { Transform } from 'class-transformer';
import { IsString, MaxLength, MinLength } from 'class-validator';

/** Paso de la receta, en orden de preparación. */
export class RecipeStepDto {
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'El texto del paso debe ser texto' })
  @MinLength(1, { message: 'El texto del paso es obligatorio' })
  @MaxLength(1000, { message: 'El texto del paso no puede superar los 1000 caracteres' })
  text!: string;
}
