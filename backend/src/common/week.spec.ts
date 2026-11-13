import { isWeekStart } from './week.js';

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
