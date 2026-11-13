/**
 * Lectura tipada de variables de entorno para las fábricas `registerAs`.
 *
 * La validación del arranque (`validateEnvironment`) garantiza que las obligatorias
 * existen y son válidas; estas funciones solo convierten el `string | undefined` de
 * `process.env` al tipo que espera el resto del código.
 */

export function requireEnv(name: string): string {
  const value = process.env[name];

  if (value === undefined || value === '') {
    throw new Error(`Falta la variable de entorno ${name}`);
  }

  return value;
}

export function envOrDefault(name: string, fallback: string): string {
  const value = process.env[name];

  return value === undefined || value === '' ? fallback : value;
}

export function numberEnvOrDefault(name: string, fallback: number): number {
  const value = process.env[name];

  if (value === undefined || value === '') {
    return fallback;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed)) {
    throw new Error(`La variable ${name} debe ser un número entero, se recibió "${value}"`);
  }

  return parsed;
}
