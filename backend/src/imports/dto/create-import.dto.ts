import { Transform } from 'class-transformer';
import { IsString, IsUrl, MaxLength, MinLength } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/** Longitud máxima de una URL de receta; evita guardar cadenas arbitrariamente grandes. */
const MAX_URL_LENGTH = 2_048;

/** Cuerpo de `POST /households/:householdId/imports`. */
export class CreateImportDto {
  @Transform(trim)
  @IsString({ message: 'La URL debe ser texto' })
  @MinLength(1, { message: 'La URL es obligatoria' })
  @MaxLength(MAX_URL_LENGTH, {
    message: `La URL no puede superar los ${String(MAX_URL_LENGTH)} caracteres`,
  })
  @IsUrl(
    { protocols: ['http', 'https'], require_protocol: true, require_tld: false },
    { message: 'La URL debe ser una dirección http o https válida' },
  )
  url!: string;
}
