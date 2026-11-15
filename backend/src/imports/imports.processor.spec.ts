import { Types } from 'mongoose';
import type { SafeHttpClient } from './safe-http.client.js';
import type { RecipesRepository } from '../recipes/recipes.repository.js';
import { ImportsProcessor } from './imports.processor.js';
import type { ImportsRepository } from './imports.repository.js';

const householdId = new Types.ObjectId().toString();
const importId = new Types.ObjectId().toString();
const url = 'https://recetas.example.com/paella';
const createdAt = new Date('2026-11-16T10:00:00.000Z');

const html = `<html><body><script type="application/ld+json">${JSON.stringify({
  '@context': 'https://schema.org/',
  '@type': 'Recipe',
  name: 'Paella',
  recipeIngredient: ['400 g de arroz'],
  recipeInstructions: [{ '@text': 'Sofríe todo.' }],
  recipeYield: '4 raciones',
})}</script></body></html>`;

interface Harness {
  processor: ImportsProcessor;
  imports: {
    markProcessing: ReturnType<typeof vi.fn>;
    findById: ReturnType<typeof vi.fn>;
    markCompleted: ReturnType<typeof vi.fn>;
    markFailed: ReturnType<typeof vi.fn>;
  };
  recipes: { create: ReturnType<typeof vi.fn> };
  http: { get: ReturnType<typeof vi.fn> };
  publisher: { publish: ReturnType<typeof vi.fn> };
}

function createProcessor(): Harness {
  const imports = {
    markProcessing: vi.fn().mockResolvedValue(null),
    findById: vi.fn().mockResolvedValue({
      _id: new Types.ObjectId(importId),
      householdId: new Types.ObjectId(householdId),
      createdBy: new Types.ObjectId(),
      url,
      status: 'processing',
      jobId: 'job-1',
      createdAt,
      updatedAt: createdAt,
    }),
    markCompleted: vi.fn().mockResolvedValue(null),
    markFailed: vi.fn().mockResolvedValue(null),
  };
  const recipes = { create: vi.fn().mockResolvedValue({ _id: new Types.ObjectId() }) };
  const http = { get: vi.fn().mockResolvedValue({ body: Buffer.from(html) }) };
  const publisher = { publish: vi.fn() };
  const processor = new ImportsProcessor(
    imports as unknown as ImportsRepository,
    recipes as unknown as RecipesRepository,
    http as unknown as SafeHttpClient,
    publisher,
  );

  return { processor, imports, recipes, http, publisher };
}

function job(attemptsMade = 0, attempts = 1): Parameters<ImportsProcessor['process']>[0] {
  return {
    data: { importId, householdId, url },
    attemptsMade,
    opts: { attempts },
  } as unknown as Parameters<ImportsProcessor['process']>[0];
}

describe('ImportsProcessor', () => {
  it('guarda la receta y publica import.finished', async () => {
    const { processor, imports, recipes, publisher } = createProcessor();

    await processor.process(job());

    const recipeId = (await recipes.create.mock.results[0]?.value) as
      { _id: Types.ObjectId } | undefined;

    expect(recipes.create).toHaveBeenCalledWith(
      expect.objectContaining({
        householdId: new Types.ObjectId(householdId),
        title: 'Paella',
        servings: 4,
        source: expect.objectContaining({ url }) as unknown,
      }),
    );
    expect(imports.markCompleted).toHaveBeenCalledWith(importId, recipeId?._id.toString());
    expect(publisher.publish).toHaveBeenCalledWith('import.finished', {
      householdId,
      importId,
      recipeId: recipeId?._id.toString(),
    });
  });

  it('en el último intento publica import.failed y propaga el error para que BullMQ lo registre', async () => {
    const { processor, imports, http, publisher } = createProcessor();

    http.get.mockRejectedValue(new Error('La página respondió con el estado 503'));

    await expect(processor.process(job(2, 3))).rejects.toThrow('503');
    expect(imports.markFailed).toHaveBeenCalledWith(
      importId,
      'IMPORT_FAILED',
      'La página respondió con el estado 503',
    );
    expect(publisher.publish).toHaveBeenCalledWith('import.failed', {
      householdId,
      importId,
      code: 'IMPORT_FAILED',
      message: 'La página respondió con el estado 503',
    });
  });

  it('en un intento intermedio no avisa del fallo: todavía puede funcionar', async () => {
    const { processor, http, publisher } = createProcessor();

    http.get.mockRejectedValue(new Error('La página respondió con el estado 503'));

    await expect(processor.process(job(0, 3))).rejects.toThrow('503');
    expect(publisher.publish).not.toHaveBeenCalled();
  });
});
