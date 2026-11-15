import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { ImportJob } from './import-job.schema.js';

export interface CreateImportJobInput {
  householdId: string;
  createdBy: string;
  url: string;
  /** Id determinista que también usará BullMQ para deduplicar. */
  jobId: string;
}

export interface CreatedImportJob {
  job: ImportJob;
  /** `false` si ya existía un trabajo con el mismo `jobId`. */
  created: boolean;
}

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 11000
  );
}

/**
 * Único punto de acceso a la colección `import_jobs`.
 *
 * La creación es idempotente por `jobId`: el índice único cierra la carrera entre dos
 * peticiones simultáneas con el mismo hogar y URL. La que pierde recupera el documento que
 * creó la otra en lugar de fallar.
 */
@Injectable()
export class ImportsRepository {
  constructor(@InjectModel(ImportJob.name) private readonly importModel: Model<ImportJob>) {}

  async createOrFind(input: CreateImportJobInput): Promise<CreatedImportJob> {
    try {
      const job = await this.importModel.create(input);

      return { job, created: true };
    } catch (error) {
      if (!isDuplicateKeyError(error)) {
        throw error;
      }

      const existing = await this.importModel
        .findOne({ jobId: input.jobId })
        .lean<ImportJob>()
        .exec();

      if (existing === null) {
        throw error;
      }

      return { job: existing, created: false };
    }
  }
}
