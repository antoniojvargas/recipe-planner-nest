import { Injectable, type ArgumentMetadata, type PipeTransform } from '@nestjs/common';
import { ERROR_CODES } from '@recipe-planner/contracts';
import { AppException } from '../exceptions/app.exception.js';

const OBJECT_ID_PATTERN = /^[0-9a-fA-F]{24}$/;

/**
 * Valida que un parámetro de ruta sea un `ObjectId` de Mongo (24 caracteres hexadecimales).
 *
 * No depende del driver de Mongo: la comprobación es la misma que hace `ObjectId.isValid` y
 * permite usar el pipe antes de que exista el modelo. Un valor inválido es un 400 de validación,
 * no un 500 de base de datos.
 */
@Injectable()
export class ParseObjectIdPipe implements PipeTransform<string, string> {
  transform(value: string, metadata: ArgumentMetadata): string {
    if (!OBJECT_ID_PATTERN.test(value)) {
      const field = typeof metadata.data === 'string' ? metadata.data : 'id';

      throw new AppException({
        status: 400,
        code: ERROR_CODES.VALIDATION_ERROR,
        message: `El parámetro ${field} no es un identificador válido`,
        details: [{ field, message: 'Debe ser un ObjectId de 24 caracteres hexadecimales' }],
      });
    }

    return value;
  }
}
