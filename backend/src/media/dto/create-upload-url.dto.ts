import { Type } from 'class-transformer';
import { IsIn, IsInt, Max, Min } from 'class-validator';
import { ALLOWED_IMAGE_TYPES, type AllowedImageType, MAX_IMAGE_BYTES } from '../media.constants.js';

/** Cuerpo de `POST /households/:householdId/media/upload-url`. */
export class CreateUploadUrlDto {
  @IsIn(ALLOWED_IMAGE_TYPES, {
    message: `El tipo debe ser uno de: ${ALLOWED_IMAGE_TYPES.join(', ')}`,
  })
  contentType!: AllowedImageType;

  /** Tamaño en bytes que el cliente declara; se convierte en el máximo del POST. */
  @Type(() => Number)
  @IsInt({ message: 'El tamaño debe ser un número entero de bytes' })
  @Min(1, { message: 'El tamaño debe ser mayor que cero' })
  @Max(MAX_IMAGE_BYTES, { message: 'La imagen no puede superar los 5 MiB' })
  size!: number;
}
