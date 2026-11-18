/**
 * Utilidades para consumir las respuestas de `openapi-fetch`.
 *
 * El contrato todavía no declara los cuerpos de respuesta (los `200` no tienen `schema`), así
 * que TypeScript tipa `data` como `never`. Estas funciones comprueban el estado HTTP real y
 * convierten el cuerpo al tipo de dominio: el contrato se completará más adelante y entonces
 * se podrá quitar el casteo.
 */

export interface ApiResult {
  data?: unknown;
  response: Response;
}

/** Mensaje del sobre común `{ error: { code, message } }` de la API. */
export function apiErrorMessage(body: unknown, fallback: string): string {
  if (typeof body !== 'object' || body === null || !('error' in body)) {
    return fallback;
  }

  const error = body.error;

  if (typeof error !== 'object' || error === null || !('message' in error)) {
    return fallback;
  }

  const message = error.message;

  return typeof message === 'string' && message.length > 0 ? message : fallback;
}

async function readBody(response: Response): Promise<unknown> {
  try {
    return (await response.json()) as unknown;
  } catch {
    // Un 5xx del proxy puede no ser JSON; el mensaje de respaldo sigue siendo útil.
    return null;
  }
}

/** Devuelve el cuerpo si la respuesta es 2xx y lanza con el mensaje de la API si no. */
export async function unwrapApiResult<T>(result: ApiResult, fallback: string): Promise<T> {
  if (!result.response.ok) {
    throw new Error(apiErrorMessage(await readBody(result.response), fallback));
  }

  return result.data as T;
}
