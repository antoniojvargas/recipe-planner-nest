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
