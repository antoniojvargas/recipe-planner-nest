import { Expose } from 'class-transformer';
import type { ImportJobStatus } from './import-job.schema.js';

/** Trabajo de importación tal como se devuelve al crearlo. */
export class ImportJobResponse {
  @Expose()
  id: string;

  @Expose()
  householdId: string;

  @Expose()
  url: string;

  @Expose()
  status: ImportJobStatus;

  @Expose()
  createdAt: Date;
}
