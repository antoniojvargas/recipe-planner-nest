import { Transform } from 'class-transformer';
import { IsString, Length, Matches } from 'class-validator';
import { normalizeInviteCode } from '../invite-code.js';

export class JoinHouseholdDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? normalizeInviteCode(value) : value,
  )
  @IsString({ message: 'El código debe ser texto' })
  @Length(8, 8, { message: 'El código debe tener 8 caracteres' })
  @Matches(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]+$/, {
    message: 'El código no es válido',
  })
  code!: string;
}
