import { Transform } from 'class-transformer';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';
import type { RegisterInput } from '../auth.types.js';

const EMAIL_MAX_LENGTH = 254;

export class RegisterDto implements RegisterInput {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail({}, { message: 'El email no es válido' })
  @MaxLength(EMAIL_MAX_LENGTH, { message: 'El email es demasiado largo' })
  email!: string;

  @IsString({ message: 'La contraseña debe ser texto' })
  @MinLength(8, { message: 'La contraseña debe tener al menos 8 caracteres' })
  @MaxLength(128, { message: 'La contraseña no puede superar los 128 caracteres' })
  password!: string;

  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'El nombre debe ser texto' })
  @MinLength(1, { message: 'El nombre es obligatorio' })
  @MaxLength(80, { message: 'El nombre no puede superar los 80 caracteres' })
  displayName!: string;
}
