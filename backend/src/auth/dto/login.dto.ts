import { Transform } from 'class-transformer';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';
import type { LoginInput } from '../auth.types.js';

const EMAIL_MAX_LENGTH = 254;

export class LoginDto implements LoginInput {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail({}, { message: 'El email no es válido' })
  @MaxLength(EMAIL_MAX_LENGTH, { message: 'El email es demasiado largo' })
  email!: string;

  @IsString({ message: 'La contraseña debe ser texto' })
  @MinLength(1, { message: 'La contraseña es obligatoria' })
  @MaxLength(128, { message: 'La contraseña no puede superar los 128 caracteres' })
  password!: string;
}
