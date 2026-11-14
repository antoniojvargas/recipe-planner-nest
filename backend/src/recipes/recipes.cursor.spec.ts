import { Types } from 'mongoose';
import { decodeCursor, encodeCursor } from './recipes.cursor.js';

describe('recipes cursor', () => {
  const id = new Types.ObjectId();
  const updatedAt = new Date('2026-02-01T12:34:56.789Z');

  it('codifica y decodifica una posición del recetario', () => {
    const encoded = encodeCursor({ updatedAt, id });

    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeCursor(encoded)).toEqual({ updatedAt, id });
  });

  it('conserva la puntuación de una búsqueda de texto', () => {
    const decoded = decodeCursor(encodeCursor({ updatedAt, id, score: 3.5 }));

    expect(decoded).toEqual({ updatedAt, id, score: 3.5 });
  });

  it('devuelve null para un cursor que no es base64url ni JSON', () => {
    expect(decodeCursor('no-es-un-cursor')).toBeNull();
    expect(decodeCursor(Buffer.from('hola', 'utf8').toString('base64url'))).toBeNull();
  });

  it('devuelve null si el identificador o la fecha no son válidos', () => {
    const payload = (value: unknown) =>
      Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');

    expect(decodeCursor(payload({ u: updatedAt.toISOString(), i: '123' }))).toBeNull();
    expect(decodeCursor(payload({ u: 'ayer', i: id.toHexString() }))).toBeNull();
    expect(
      decodeCursor(payload({ u: updatedAt.toISOString(), i: id.toHexString(), s: 'alto' })),
    ).toBeNull();
  });

  it('devuelve null para valores que no son objetos', () => {
    expect(decodeCursor(Buffer.from('42', 'utf8').toString('base64url'))).toBeNull();
    expect(decodeCursor(Buffer.from('null', 'utf8').toString('base64url'))).toBeNull();
  });
});
