import type { ImportJobStatus } from './import-job.schema.js';

/** Trabajo de importación tal como se devuelve al crearlo. */
export interface ImportJobResponse {
  id: string;
  householdId: string;
  url: string;
  status: ImportJobStatus;
  createdAt: Date;
}
