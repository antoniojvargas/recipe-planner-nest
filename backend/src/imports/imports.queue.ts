import { createHash } from 'node:crypto';
import type { JobsOptions } from 'bullmq';

/** Cola de importaciones; la API encola y el proceso `worker` consume. */
export const IMPORTS_QUEUE_NAME = 'imports';

export const IMPORT_RECIPE_JOB = 'imports.recipe';

/** Ventana durante la que una misma URL no se importa dos veces en el mismo hogar. */
export const IMPORT_DEDUPE_WINDOW_MS = 10 * 60 * 1_000;

/**
 * Reintentos y limpieza de la cola.
 *
 * `attempts: 3` incluye el primer intento. Se conservan los trabajos terminados durante la
 * ventana de deduplicación para que BullMQ siga reconociendo el `jobId` y no vuelva a lanzar
 * la misma importación.
 */
export const IMPORT_JOB_OPTIONS = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 1_000 },
  removeOnComplete: { age: IMPORT_DEDUPE_WINDOW_MS / 1_000 },
  removeOnFail: { age: IMPORT_DEDUPE_WINDOW_MS / 1_000 },
} as const satisfies JobsOptions;

export interface ImportRecipeJobData {
  importId: string;
  householdId: string;
  url: string;
}

/**
 * Identificador determinista del trabajo en BullMQ.
 *
 * Incluye la ventana de diez minutos para que dos peticiones con el mismo hogar y URL dentro
 * de esa ventana compartan el mismo id y BullMQ descarte la segunda. Al cambiar de ventana el
 * id cambia y la importación puede repetirse legítimamente (por ejemplo, para refrescar una
 * receta).
 */
export function importJobId(householdId: string, url: string, now = Date.now()): string {
  const window = Math.floor(now / IMPORT_DEDUPE_WINDOW_MS);
  const digest = createHash('sha256').update(`${householdId}\n${url}`).digest('hex');

  return `import-${String(window)}-${digest.slice(0, 32)}`;
}
