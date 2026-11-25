import { describe, expect, it } from 'vitest';
import {
  currentWeekStart,
  formatWeekRange,
  isWeekStartString,
  parseWeekStart,
  shiftWeek,
  startOfWeek,
  todayIso,
  weekDays,
} from './week';

describe('startOfWeek', () => {
  it('devuelve el lunes de la semana en UTC', () => {
    expect(startOfWeek(new Date('2026-11-18T12:00:00Z'))).toBe('2026-11-16');
  });

  it('trata el domingo como último día de la semana anterior', () => {
    expect(startOfWeek(new Date('2026-11-15T20:00:00Z'))).toBe('2026-11-09');
  });

  it('en un huso negativo, el domingo por la noche sigue en la semana anterior', () => {
    // Bogotá (UTC−5): domingo 15 nov 23:00 local = lunes 16 nov 04:00 UTC.
    expect(startOfWeek(new Date('2026-11-16T04:00:00Z'), 'America/Bogota')).toBe('2026-11-09');
  });

  it('en un huso negativo, el lunes por la mañana ya es la semana nueva', () => {
    // Bogotá: lunes 16 nov 09:00 local = lunes 16 nov 14:00 UTC.
    expect(startOfWeek(new Date('2026-11-16T14:00:00Z'), 'America/Bogota')).toBe('2026-11-16');
  });

  it('en un huso positivo, el domingo por la noche local sigue en la semana anterior', () => {
    // Madrid (UTC+1): domingo 15 nov 23:30 local = domingo 15 nov 22:30 UTC.
    expect(startOfWeek(new Date('2026-11-15T22:30:00Z'), 'Europe/Madrid')).toBe('2026-11-09');
  });

  it('en un huso positivo, el lunes empieza antes que en UTC', () => {
    // Tokio (UTC+9): lunes 16 nov 00:30 local = domingo 15 nov 15:30 UTC.
    expect(startOfWeek(new Date('2026-11-15T15:30:00Z'), 'Asia/Tokyo')).toBe('2026-11-16');
  });

  it('usa la semana de `now` cuando no se pasa fecha', () => {
    expect(currentWeekStart(new Date('2026-12-31T10:00:00Z'))).toBe('2026-12-28');
  });

  it('usa la zona del hogar al calcular la semana actual', () => {
    // En UTC ya es lunes 16; en Bogotá todavía es domingo 15 por la noche.
    expect(currentWeekStart(new Date('2026-11-16T04:00:00Z'), 'America/Bogota')).toBe('2026-11-09');
  });
});

describe('todayIso', () => {
  it('devuelve el día del calendario del hogar', () => {
    // Domingo 15 nov 23:00 en Bogotá = lunes 16 nov 04:00 UTC.
    expect(todayIso(new Date('2026-11-16T04:00:00Z'), 'America/Bogota')).toBe('2026-11-15');
    expect(todayIso(new Date('2026-11-15T15:30:00Z'), 'Asia/Tokyo')).toBe('2026-11-16');
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
