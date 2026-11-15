import { Types } from 'mongoose';
import type { Queue } from 'bullmq';
import {
  IMPORT_DEDUPE_WINDOW_MS,
  IMPORT_JOB_OPTIONS,
  IMPORT_RECIPE_JOB,
  importJobId,
  type ImportRecipeJobData,
} from './imports.queue.js';
import { ImportsRepository } from './imports.repository.js';
import { ImportsService } from './imports.service.js';

const householdId = new Types.ObjectId().toString();
const userId = new Types.ObjectId().toString();
const url = 'https://recetas.example.com/paella';

function storedJob(jobId: string) {
  return {
    _id: new Types.ObjectId(),
    householdId: new Types.ObjectId(householdId),
    createdBy: new Types.ObjectId(userId),
    url,
    status: 'pending' as const,
    jobId,
    createdAt: new Date('2026-11-14T10:00:00.000Z'),
    updatedAt: new Date('2026-11-14T10:00:00.000Z'),
  };
}

function createDoubles() {
  const imports = { createOrFind: vi.fn() };
  const queue = { add: vi.fn().mockResolvedValue({ id: 'job-1' }) };

  return {
    imports,
    queue,
    service: new ImportsService(
      imports as unknown as ImportsRepository,
      queue as unknown as Queue<ImportRecipeJobData>,
    ),
  };
}

describe('ImportsService', () => {
  it('crea el ImportJob y lo encola con reintentos y un jobId determinista', async () => {
    const { service, imports, queue } = createDoubles();
    const job = storedJob(importJobId(householdId, url));
    imports.createOrFind.mockResolvedValue({ job, created: true });

    const response = await service.create(householdId, userId, { url });

    expect(imports.createOrFind).toHaveBeenCalledWith({
      householdId,
      createdBy: userId,
      url,
      jobId: importJobId(householdId, url),
    });
    expect(queue.add).toHaveBeenCalledWith(
      IMPORT_RECIPE_JOB,
      { importId: job._id.toString(), householdId, url },
      { ...IMPORT_JOB_OPTIONS, jobId: importJobId(householdId, url) },
    );
    expect(queue.add.mock.calls[0]?.[2]).toMatchObject({
      attempts: 3,
      backoff: { type: 'exponential', delay: 1_000 },
      jobId: expect.stringMatching(/^import-\d+-[0-9a-f]{32}$/) as unknown,
    });
    expect(response).toEqual({
      id: job._id.toString(),
      householdId,
      url,
      status: 'pending',
      createdAt: job.createdAt,
    });
  });

  it('reutiliza el trabajo existente y vuelve a encolarlo con el mismo jobId', async () => {
    const { service, imports, queue } = createDoubles();
    const jobId = importJobId(householdId, url);
    const job = { ...storedJob(jobId), status: 'processing' as const };
    imports.createOrFind.mockResolvedValue({ job, created: false });

    const response = await service.create(householdId, userId, { url });

    expect(response.id).toBe(job._id.toString());
    expect(response.status).toBe('processing');
    expect(queue.add).toHaveBeenCalledTimes(1);
    expect(queue.add.mock.calls[0]?.[2]).toMatchObject({ jobId });
  });
});

describe('importJobId', () => {
  const now = new Date('2026-11-14T10:00:00.000Z').getTime();

  it('es el mismo para el mismo hogar y URL dentro de la ventana de diez minutos', () => {
    const first = importJobId(householdId, url, now);
    const later = importJobId(householdId, url, now + IMPORT_DEDUPE_WINDOW_MS - 1);

    expect(later).toBe(first);
  });

  it('cambia al pasar de ventana, de hogar o de URL', () => {
    const base = importJobId(householdId, url, now);

    expect(importJobId(householdId, url, now + IMPORT_DEDUPE_WINDOW_MS)).not.toBe(base);
    expect(importJobId(new Types.ObjectId().toString(), url, now)).not.toBe(base);
    expect(importJobId(householdId, `${url}?otra`, now)).not.toBe(base);
  });
});
