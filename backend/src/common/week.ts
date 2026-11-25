import { weekStartInTimeZone } from '@recipe-planner/contracts';

/**
 * El plan semanal y la lista de la compra se identifican por la semana que empieza en lunes.
 * Guardar la fecha como el lunes a las 00:00 UTC evita que una hora suelta o la zona horaria
 * del cliente asocien el documento a una semana distinta.
 */
export function isWeekStart(value: Date): boolean {
  return (
    value.getUTCDay() === 1 &&
    value.getUTCHours() === 0 &&
    value.getUTCMinutes() === 0 &&
    value.getUTCSeconds() === 0 &&
    value.getUTCMilliseconds() === 0
  );
}

/** Configuración compartida del `@Prop` de `weekStart`. */
export const WEEK_START_VALIDATION = {
  validator: isWeekStart,
  message: 'weekStart debe ser el lunes de la semana a las 00:00 UTC',
} as const;

/**
 * `weekStart` tal como viaja en los eventos y en las URLs: `YYYY-MM-DD`.
 *
 * Se corta el ISO en UTC, no en la zona del servidor: la fecha guardada ya es el lunes a las
 * 00:00 UTC y convertirla a local podría devolver el domingo anterior.
 */
export function toWeekStartString(weekStart: Date): string {
  return weekStart.toISOString().slice(0, 10);
}

/**
 * Lunes a las 00:00 UTC de la semana a la que pertenece `date` según el calendario del hogar.
 *
 * `timeZone` es la zona IANA del hogar. Sin ella se usa UTC, que es lo que hacía la app antes
 * de que el hogar tuviera zona. El resultado sigue siendo un `weekStart` válido aunque el
 * instante caiga en otro día UTC.
 */
export function startOfWeek(date: Date = new Date(), timeZone = 'UTC'): Date {
  return new Date(`${weekStartInTimeZone(date, timeZone)}T00:00:00.000Z`);
}
