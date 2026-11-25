import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/** Zonas que acepta `Intl`, más `UTC`, que no aparece en `supportedValuesOf`. */
const TIME_ZONES = ['UTC', ...Intl.supportedValuesOf('timeZone')];

export class CreateHouseholdDto {
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'El nombre debe ser texto' })
  @MinLength(1, { message: 'El nombre es obligatorio' })
  @MaxLength(80, { message: 'El nombre no puede superar los 80 caracteres' })
  name!: string;

  /**
   * Zona IANA del hogar. Si no llega, el esquema aplica `UTC`; el cliente que la conozca (el
   * navegador) puede enviarla al crear el hogar.
   */
  @IsOptional()
  @IsIn(TIME_ZONES, { message: 'La zona horaria no es una zona IANA válida' })
  timeZone?: string;
}
