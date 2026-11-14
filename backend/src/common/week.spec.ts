import { isWeekStart, startOfWeek } from './week.js';

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

describe('startOfWeek', () => {
  it.each<{ date: string; expected: string }>([
    { date: '2026-11-13T15:30:00.000Z', expected: '2026-11-09T00:00:00.000Z' },
    { date: '2026-11-09T00:00:00.000Z', expected: '2026-11-09T00:00:00.000Z' },
    { date: '2026-11-15T23:59:59.000Z', expected: '2026-11-09T00:00:00.000Z' },
    { date: '2027-01-01T10:00:00.000Z', expected: '2026-12-28T00:00:00.000Z' },
  ])('devuelve el lunes de $date', ({ date, expected }) => {
    expect(startOfWeek(new Date(date)).toISOString()).toBe(expected);
  });
});
