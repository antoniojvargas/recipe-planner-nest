import { Transform } from 'class-transformer';
import { IsString, MaxLength, MinLength } from 'class-validator';

/** Cuerpo de `PUT /households/:householdId/recipes/:recipeId/image`. */
export class ConfirmImageDto {
  /** Clave devuelta por `POST /media/upload-url`, bajo el prefijo del hogar. */
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'La clave debe ser texto' })
  @MinLength(1, { message: 'La clave es obligatoria' })
  @MaxLength(300, { message: 'La clave no es válida' })
  key!: string;
}
