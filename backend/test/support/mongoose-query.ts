import { vi } from 'vitest';

export interface MongooseQueryMock<T> {
  result: T;
  lean: ReturnType<typeof vi.fn>;
  sort: ReturnType<typeof vi.fn>;
  skip: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
  select: ReturnType<typeof vi.fn>;
  exec: ReturnType<typeof vi.fn>;
}

/**
 * Doble de una query de Mongoose para los tests de repositorios.
 *
 * Los modificadores devuelven la misma query (igual que Mongoose) y `exec()` resuelve el
 * resultado, de modo que se puede comprobar el filtro y que las lecturas pasan por `lean()`.
 */
export function mockMongooseQuery<T>(result: T): MongooseQueryMock<T> {
  const query = { result } as MongooseQueryMock<T>;

  query.lean = vi.fn(() => query);
  query.sort = vi.fn(() => query);
  query.skip = vi.fn(() => query);
  query.limit = vi.fn(() => query);
  query.select = vi.fn(() => query);
  query.exec = vi.fn().mockResolvedValue(result);

  return query;
}
