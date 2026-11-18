/**
 * La semana del plan se identifica por el lunes a las 00:00 UTC en formato `YYYY-MM-DD`.
 *
 * Todo se calcula en UTC, igual que la API: si se usara la zona local, un domingo por la noche
 * en un huso negativo caería en la semana siguiente y se abriría el plan equivocado.
 */

export type WeekStart = string;

const WEEK_START_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Convierte una fecha en el lunes de su semana (UTC), como `YYYY-MM-DD`. */
export function startOfWeek(date: Date): WeekStart {
  const monday = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const weekday = monday.getUTCDay();

  monday.setUTCDate(monday.getUTCDate() - (weekday === 0 ? 6 : weekday - 1));

  return toWeekStartString(monday);
}

/** Lunes de la semana actual, que es el que usa la navegación "Esta semana". */
export function currentWeekStart(now: Date = new Date()): WeekStart {
  return startOfWeek(now);
}

/** Fecha de hoy como `YYYY-MM-DD` en UTC, para marcar el día en la cuadrícula. */
export function todayIso(now: Date = new Date()): string {
  return toWeekStartString(now);
}

export function toWeekStartString(date: Date): WeekStart {
  return date.toISOString().slice(0, 10);
}

/**
 * Valida que el texto sea un lunes real y no una fecha cualquiera: `2026-02-30` no existe y
 * `2026-11-17` es martes, así que la API respondería 400.
 */
export function isWeekStartString(value: string): boolean {
  if (!WEEK_START_PATTERN.test(value)) {
    return false;
  }

  const date = new Date(`${value}T00:00:00.000Z`);

  return (
    !Number.isNaN(date.getTime()) && date.getUTCDay() === 1 && toWeekStartString(date) === value
  );
}

/** Devuelve la fecha o `null` si el texto no es un lunes válido. */
export function parseWeekStart(value: string): Date | null {
  return isWeekStartString(value) ? new Date(`${value}T00:00:00.000Z`) : null;
}

/** Suma (o resta, con números negativos) semanas a un `weekStart` válido. */
export function shiftWeek(weekStart: WeekStart, weeks: number): WeekStart {
  const date = parseWeekStart(weekStart);

  if (date === null) {
    return weekStart;
  }

  date.setUTCDate(date.getUTCDate() + weeks * 7);

  return toWeekStartString(date);
}

export interface WeekDay {
  /** 0 = lunes … 6 = domingo, el mismo índice que usa el plan. */
  index: number;
  date: WeekStart;
  /** Nombre corto del día, p. ej. `lun`. */
  weekday: string;
  dayOfMonth: number;
  /** Mes abreviado, p. ej. `nov`. */
  month: string;
}

const CAPITALIZE = /^./u;

function capitalize(text: string): string {
  return text.replace(CAPITALIZE, (first) => first.toUpperCase());
}

/** Los siete días de la semana, con su nombre listo para la cabecera de la cuadrícula. */
export function weekDays(weekStart: WeekStart, locale = 'es-ES'): WeekDay[] {
  const monday = parseWeekStart(weekStart);

  if (monday === null) {
    return [];
  }

  const weekdayFormat = new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' });
  const monthFormat = new Intl.DateTimeFormat(locale, { month: 'short', timeZone: 'UTC' });
  const days: WeekDay[] = [];

  for (let index = 0; index < 7; index += 1) {
    const date = new Date(monday);

    date.setUTCDate(date.getUTCDate() + index);
    days.push({
      index,
      date: toWeekStartString(date),
      weekday: capitalize(weekdayFormat.format(date).replace(/\.$/u, '')),
      dayOfMonth: date.getUTCDate(),
      month: monthFormat.format(date).replace(/\.$/u, ''),
    });
  }

  return days;
}

/** Rango legible para la cabecera: `16 – 22 nov 2026` o `30 nov – 6 dic 2026`. */
export function formatWeekRange(weekStart: WeekStart, locale = 'es-ES'): string {
  const start = parseWeekStart(weekStart);

  if (start === null) {
    return weekStart;
  }

  const end = new Date(start);

  end.setUTCDate(end.getUTCDate() + 6);

  const dayFormat = new Intl.DateTimeFormat(locale, { day: 'numeric', timeZone: 'UTC' });
  const monthFormat = new Intl.DateTimeFormat(locale, { month: 'short', timeZone: 'UTC' });
  const yearFormat = new Intl.DateTimeFormat(locale, { year: 'numeric', timeZone: 'UTC' });
  const startMonth = monthFormat.format(start);
  const endMonth = monthFormat.format(end);
  const year = yearFormat.format(end);

  if (startMonth === endMonth) {
    return `${dayFormat.format(start)} – ${dayFormat.format(end)} ${endMonth} ${year}`;
  }

  return `${dayFormat.format(start)} ${startMonth} – ${dayFormat.format(end)} ${endMonth} ${year}`;
}
