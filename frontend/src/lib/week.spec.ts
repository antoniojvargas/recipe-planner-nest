import { describe, expect, it } from 'vitest';
import {
  currentWeekStart,
  formatWeekRange,
  isWeekStartString,
  parseWeekStart,
  shiftWeek,
  startOfWeek,
  weekDays,
} from './week';

describe('startOfWeek', () => {
  it('devuelve el lunes de la semana en UTC', () => {
    expect(startOfWeek(new Date('2026-11-18T12:00:00Z'))).toBe('2026-11-16');
  });

  it('trata el domingo como último día de la semana anterior', () => {
    expect(startOfWeek(new Date('2026-11-15T20:00:00Z'))).toBe('2026-11-09');
  });

  it('no se desplaza cuando el lunes llega ya en UTC desde un huso negativo', () => {
    // Domingo 23:00 en UTC−5 = lunes 04:00 UTC.
    expect(startOfWeek(new Date('2026-11-16T04:00:00Z'))).toBe('2026-11-16');
  });

  it('usa la semana de `now` cuando no se pasa fecha', () => {
    expect(currentWeekStart(new Date('2026-12-31T10:00:00Z'))).toBe('2026-12-28');
  });
});

describe('isWeekStartString', () => {
  it('acepta un lunes real', () => {
    expect(isWeekStartString('2026-11-16')).toBe(true);
  });

  it('rechaza otro día de la semana', () => {
    expect(isWeekStartString('2026-11-17')).toBe(false);
  });

  it('rechaza fechas que no existen y formatos raros', () => {
    expect(isWeekStartString('2026-02-30')).toBe(false);
    expect(isWeekStartString('16/11/2026')).toBe(false);
    expect(isWeekStartString('2026-1-1')).toBe(false);
  });

  it('parseWeekStart devuelve null para un martes', () => {
    expect(parseWeekStart('2026-11-17')).toBeNull();
  });
});

describe('shiftWeek', () => {
  it('suma y resta semanas sin salir de UTC', () => {
    expect(shiftWeek('2026-11-16', 1)).toBe('2026-11-23');
    expect(shiftWeek('2026-11-16', -1)).toBe('2026-11-09');
  });

  it('cruza el cambio de año', () => {
    expect(shiftWeek('2026-12-28', 1)).toBe('2027-01-04');
    expect(shiftWeek('2027-01-04', -1)).toBe('2026-12-28');
  });

  it('cruza el cambio de hora sin cambiar de día', () => {
    expect(shiftWeek('2026-10-19', 1)).toBe('2026-10-26');
    expect(shiftWeek('2026-03-23', 1)).toBe('2026-03-30');
  });

  it('devuelve el valor original si no es un lunes válido', () => {
    expect(shiftWeek('2026-11-17', 1)).toBe('2026-11-17');
  });
});

describe('weekDays', () => {
  it('pinta los siete días desde el lunes', () => {
    const days = weekDays('2026-11-16');

    expect(days).toHaveLength(7);
    expect(days[0]).toMatchObject({
      index: 0,
      date: '2026-11-16',
      weekday: 'Lun',
      dayOfMonth: 16,
      month: 'nov',
    });
    expect(days[6]).toMatchObject({
      index: 6,
      date: '2026-11-22',
      weekday: 'Dom',
      dayOfMonth: 22,
    });
  });

  it('devuelve una lista vacía si la semana no es válida', () => {
    expect(weekDays('2026-11-17')).toEqual([]);
  });
});

describe('formatWeekRange', () => {
  it('junta el rango cuando cae en el mismo mes', () => {
    expect(formatWeekRange('2026-11-16')).toBe('16 – 22 nov 2026');
  });

  it('repite el mes cuando el rango cruza de mes', () => {
    expect(formatWeekRange('2026-11-30')).toBe('30 nov – 6 dic 2026');
  });

  it('devuelve el texto original si la semana no es válida', () => {
    expect(formatWeekRange('2026-11-17')).toBe('2026-11-17');
  });
});
