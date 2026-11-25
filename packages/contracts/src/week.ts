/**
 * Cálculo de la semana del plan con la zona horaria del hogar.
 *
 * El plan se guarda con `weekStart` = lunes a las 00:00 UTC. Para decidir qué semana es
 * "esta semana" hay que mirar el calendario del hogar, no el del servidor ni el del navegador:
 * en un huso negativo el domingo por la noche todavía es domingo, y en uno positivo el lunes
 * empieza antes que en UTC.
 */

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  const cached = formatters.get(timeZone);

  if (cached !== undefined) {
    return cached;
  }

  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  formatters.set(timeZone, formatter);

  return formatter;
}

/** Zona IANA válida para `Intl` (`Europe/Madrid`, `America/Bogota`, `UTC`…). */
export function isTimeZone(value: string): boolean {
  try {
    formatterFor(value);

    return true;
  } catch {
    return false;
  }
}

/**
 * Fecha del calendario del hogar en formato `YYYY-MM-DD`.
 *
 * Si la zona no es válida se usa UTC: el dato viene validado desde el hogar, pero una lectura
 * antigua o corrupta no debe tumbar la página.
 */
export function dateInTimeZone(date: Date, timeZone = 'UTC'): string {
  let formatter: Intl.DateTimeFormat;

  try {
    formatter = formatterFor(timeZone);
  } catch {
    formatter = formatterFor('UTC');
  }

  const parts = formatter.formatToParts(date);
  const values = new Map(parts.map((part) => [part.type, part.value]));

  return `${values.get('year') ?? ''}-${values.get('month') ?? ''}-${values.get('day') ?? ''}`;
}

/**
 * Lunes de la semana a la que pertenece `date` según el calendario del hogar, como
 * `YYYY-MM-DD` (el mismo formato que usa la API para `weekStart`).
 */
export function weekStartInTimeZone(date: Date, timeZone = 'UTC'): string {
  const [year, month, day] = dateInTimeZone(date, timeZone).split('-').map(Number);
  const monday = new Date(Date.UTC(year, month - 1, day));
  const weekday = monday.getUTCDay();

  monday.setUTCDate(monday.getUTCDate() - (weekday === 0 ? 6 : weekday - 1));

  return monday.toISOString().slice(0, 10);
}
