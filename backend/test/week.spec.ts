import { isWeekStart, startOfWeek } from '../src/common/week.js';

describe('isWeekStart', () => {
  it.each<{ date: string; expected: boolean }>([
    { date: '2026-11-09T00:00:00.000Z', expected: true },
    { date: '2027-01-04T00:00:00.000Z', expected: true },
    { date: '2026-11-10T00:00:00.000Z', expected: false },
    { date: '2026-11-09T10:00:00.000Z', expected: false },
    { date: '2026-11-08T00:00:00.000Z', expected: false },
  ])('devuelve $expected para $date', ({ date, expected }) => {
    expect(isWeekStart(new Date(date))).toBe(expected);
  });
});

describe('startOfWeek en UTC', () => {
  it.each<{ date: string; expected: string }>([
    { date: '2026-11-13T15:30:00.000Z', expected: '2026-11-09T00:00:00.000Z' },
    { date: '2026-11-09T00:00:00.000Z', expected: '2026-11-09T00:00:00.000Z' },
    { date: '2026-11-15T23:59:59.000Z', expected: '2026-11-09T00:00:00.000Z' },
    { date: '2027-01-01T10:00:00.000Z', expected: '2026-12-28T00:00:00.000Z' },
  ])('devuelve el lunes de $date', ({ date, expected }) => {
    expect(startOfWeek(new Date(date)).toISOString()).toBe(expected);
  });
});

describe('startOfWeek con la zona del hogar', () => {
  it('en un huso negativo, el domingo por la noche sigue en la semana anterior', () => {
    // Bogotá (UTC−5): domingo 15 nov 23:00 local = lunes 16 nov 04:00 UTC.
    expect(startOfWeek(new Date('2026-11-16T04:00:00.000Z'), 'America/Bogota').toISOString()).toBe(
      '2026-11-09T00:00:00.000Z',
    );
  });

  it('en un huso negativo, el lunes por la mañana ya es la semana nueva', () => {
    // Bogotá: lunes 16 nov 09:00 local = lunes 16 nov 14:00 UTC.
    expect(startOfWeek(new Date('2026-11-16T14:00:00.000Z'), 'America/Bogota').toISOString()).toBe(
      '2026-11-16T00:00:00.000Z',
    );
  });

  it('en un huso positivo, el domingo por la noche local sigue en la semana anterior', () => {
    // Madrid (UTC+1): domingo 15 nov 23:30 local = domingo 15 nov 22:30 UTC.
    expect(startOfWeek(new Date('2026-11-15T22:30:00.000Z'), 'Europe/Madrid').toISOString()).toBe(
      '2026-11-09T00:00:00.000Z',
    );
  });

  it('en un huso positivo, el lunes empieza antes que en UTC', () => {
    // Tokio (UTC+9): lunes 16 nov 00:30 local = domingo 15 nov 15:30 UTC.
    expect(startOfWeek(new Date('2026-11-15T15:30:00.000Z'), 'Asia/Tokyo').toISOString()).toBe(
      '2026-11-16T00:00:00.000Z',
    );
  });

  it('cae a UTC si la zona guardada no es válida', () => {
    expect(startOfWeek(new Date('2026-11-16T04:00:00.000Z'), 'Zona/Inventada').toISOString()).toBe(
      '2026-11-16T00:00:00.000Z',
    );
  });
});
