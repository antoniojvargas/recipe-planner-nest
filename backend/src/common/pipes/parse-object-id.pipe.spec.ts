import type { ArgumentMetadata } from '@nestjs/common';
import { AppException } from '../exceptions/app.exception.js';
import { ParseObjectIdPipe } from './parse-object-id.pipe.js';

const pipe = new ParseObjectIdPipe();
const paramMetadata: ArgumentMetadata = { type: 'param', data: 'recipeId' };

describe('ParseObjectIdPipe', () => {
  it('deja pasar un ObjectId de 24 caracteres hexadecimales', () => {
    expect(pipe.transform('507f1f77bcf86cd799439011', paramMetadata)).toBe(
      '507f1f77bcf86cd799439011',
    );
  });

  it('acepta hexadecimal en mayúsculas', () => {
    expect(pipe.transform('507F1F77BCF86CD799439011', paramMetadata)).toBe(
      '507F1F77BCF86CD799439011',
    );
  });

  it.each([
    ['null', ''],
    ['un id de 12 bytes', 'not-an-object-id'],
    ['23 caracteres', '507f1f77bcf86cd79943901'],
    ['25 caracteres', '507f1f77bcf86cd7994390111'],
    ['caracteres que no son hexadecimales', '507f1f77bcf86cd79943901z'],
  ])('rechaza %s con un 400 de validación', (_case, value) => {
    const exception = (() => {
      try {
        pipe.transform(value, paramMetadata);
      } catch (error) {
        return error as AppException;
      }

      throw new Error('Se esperaba una AppException');
    })();

    expect(exception).toBeInstanceOf(AppException);
    expect(exception.getStatus()).toBe(400);
    expect(exception.code).toBe('VALIDATION_ERROR');
    expect(exception.details).toEqual([
      {
        field: 'recipeId',
        message: 'Debe ser un ObjectId de 24 caracteres hexadecimales',
      },
    ]);
  });

  it('usa `id` como campo cuando el parámetro no trae nombre', () => {
    let exception: AppException | undefined;

    try {
      pipe.transform('invalido', { type: 'param' });
    } catch (error) {
      exception = error as AppException;
    }

    expect(exception?.details[0].field).toBe('id');
  });
});
