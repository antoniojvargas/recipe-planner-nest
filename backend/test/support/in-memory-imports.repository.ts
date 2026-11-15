import { Types } from 'mongoose';
import type { ImportJob } from '../../src/imports/import-job.schema.js';
import type {
  CreateImportJobInput,
  CreatedImportJob,
} from '../../src/imports/imports.repository.js';

export type StoredImportJob = ImportJob & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

/** Repositorio de importaciones en memoria para pruebas de integración/e2e. */
export class InMemoryImportsRepository {
  readonly jobs: StoredImportJob[] = [];

  createOrFind(input: CreateImportJobInput): Promise<CreatedImportJob> {
    const existing = this.jobs.find((job) => job.jobId === input.jobId);

    if (existing !== undefined) {
      return Promise.resolve({ job: existing, created: false });
    }

    const now = new Date();
    const job: StoredImportJob = {
      _id: new Types.ObjectId(),
      householdId: new Types.ObjectId(input.householdId),
      createdBy: new Types.ObjectId(input.createdBy),
      url: input.url,
      status: 'pending',
      jobId: input.jobId,
      createdAt: now,
      updatedAt: now,
    };

    this.jobs.push(job);

    return Promise.resolve({ job, created: true });
  }
}
