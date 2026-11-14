import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import type { Queue } from 'bullmq';
import type { CreateImportDto } from './dto/create-import.dto.js';
import type { ImportJob } from './import-job.schema.js';
import {
  IMPORT_JOB_OPTIONS,
  IMPORT_RECIPE_JOB,
  IMPORTS_QUEUE_NAME,
  importJobId,
  type ImportRecipeJobData,
} from './imports.queue.js';
import { ImportsRepository } from './imports.repository.js';
import type { ImportJobResponse } from './imports.types.js';

function toResponse(job: ImportJob): ImportJobResponse {
  return {
    id: job._id.toString(),
    householdId: job.householdId.toString(),
    url: job.url,
    status: job.status,
    createdAt: job.createdAt,
  };
}

/**
 * Importaciones de recetas desde una URL.
 *
 * El servicio solo crea el registro y encola: descargar y parsear es trabajo del worker. La
 * creación es idempotente durante diez minutos por hogar y URL, así que un doble clic o un
 * reintento del cliente no lanza dos importaciones.
 */
@Injectable()
export class ImportsService {
  constructor(
    private readonly imports: ImportsRepository,
    @InjectQueue(IMPORTS_QUEUE_NAME) private readonly queue: Queue<ImportRecipeJobData>,
  ) {}

  async create(
    householdId: string,
    userId: string,
    dto: CreateImportDto,
  ): Promise<ImportJobResponse> {
    const jobId = importJobId(householdId, dto.url);
    const { job } = await this.imports.createOrFind({
      householdId,
      createdBy: userId,
      url: dto.url,
      jobId,
    });

    // Se encola también cuando el registro ya existía: si el primer encolado falló, este
    // reintento lo repara. BullMQ descarta el `add` si el `jobId` sigue vivo, así que no
    // duplica el trabajo.
    await this.queue.add(
      IMPORT_RECIPE_JOB,
      { importId: job._id.toString(), householdId, url: job.url },
      { ...IMPORT_JOB_OPTIONS, jobId },
    );

    return toResponse(job);
  }
}
