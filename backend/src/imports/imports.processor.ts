import { Inject, Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { ERROR_CODES, SOCKET_EVENTS } from '@recipe-planner/contracts';
import type { Job } from 'bullmq';
import { Types } from 'mongoose';
import { REALTIME_PUBLISHER, type RealtimePublisher } from '../realtime/realtime-publisher.js';
import { RecipesRepository } from '../recipes/recipes.repository.js';
import { ImportsRepository } from './imports.repository.js';
import { IMPORTS_QUEUE_NAME, type ImportRecipeJobData } from './imports.queue.js';
import { extractRecipe } from './recipe-parser.js';
import { SafeHttpClient } from './safe-http.client.js';

/** Si la página no declara comensales, se asume una receta para dos. */
const DEFAULT_SERVINGS = 2;

function servingsFrom(yieldText: string | undefined): number {
  const match = yieldText?.match(/\d+/);
  const servings = match === null || match === undefined ? Number.NaN : Number(match[0]);

  return Number.isFinite(servings) && servings >= 1 ? Math.floor(servings) : DEFAULT_SERVINGS;
}

/**
 * Importación de recetas desde una URL, en el proceso `worker`.
 *
 * Descarga con `SafeHttpClient` (sin SSRF), extrae la receta del HTML y la guarda como
 * borrador. Al terminar publica `import.finished` o, si se agotaron los reintentos,
 * `import.failed` con el motivo. El evento sale por el emisor de Redis porque este proceso no
 * sirve sockets: el adaptador de la API lo reparte a las salas del hogar.
 */
@Processor(IMPORTS_QUEUE_NAME)
export class ImportsProcessor extends WorkerHost {
  private readonly logger = new Logger(ImportsProcessor.name);

  constructor(
    private readonly imports: ImportsRepository,
    private readonly recipes: RecipesRepository,
    private readonly http: SafeHttpClient,
    @Inject(REALTIME_PUBLISHER) private readonly publisher: RealtimePublisher,
  ) {
    super();
  }

  async process(job: Job<ImportRecipeJobData>): Promise<void> {
    const { importId, householdId, url } = job.data;

    try {
      const importJob = await this.imports.findById(householdId, importId);

      if (importJob === null) {
        throw new Error(`La importación ${importId} ya no existe`);
      }

      // El trabajo viene de la cola: su `householdId` puede no coincidir con el del registro.
      if (importJob.householdId.toString() !== householdId) {
        throw new Error(`La importación ${importId} pertenece a otro hogar`);
      }

      await this.imports.markProcessing(householdId, importId);

      const page = await this.http.get(url);
      const extracted = extractRecipe(page.body.toString('utf8'));

      if (!extracted.success || extracted.recipe === null) {
        throw new Error('La página no contiene una receta reconocible');
      }

      const parsed = extracted.recipe;
      const recipe = await this.recipes.create({
        householdId: new Types.ObjectId(householdId),
        createdBy: importJob.createdBy,
        title: parsed.title,
        servings: servingsFrom(parsed.yield),
        ...(parsed.description === undefined ? {} : { description: parsed.description }),
        ...(parsed.prepMinutes === undefined ? {} : { prepMinutes: parsed.prepMinutes }),
        ...(parsed.cookMinutes === undefined ? {} : { cookMinutes: parsed.cookMinutes }),
        ingredients: parsed.ingredients.map((ingredient) => ({
          name: ingredient.name,
          quantity: ingredient.quantity,
          unit: ingredient.unit,
          ...(ingredient.note === undefined ? {} : { note: ingredient.note }),
        })),
        steps: parsed.steps.map((text) => ({ text })),
        source: { url, importedAt: new Date() },
      });

      await this.imports.markCompleted(householdId, importId, recipe._id.toString());
      this.publisher.publish(SOCKET_EVENTS.importFinished, {
        householdId,
        importId,
        recipeId: recipe._id.toString(),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      this.logger.warn(`Importación ${importId} falló: ${message}`);
      await this.imports.markFailed(householdId, importId, ERROR_CODES.IMPORT_FAILED, message);

      // Solo se avisa cuando ya no quedan reintentos: así el cliente no recibe un fallo por
      // cada intento de un 503 pasajero.
      if (this.isLastAttempt(job)) {
        this.publisher.publish(SOCKET_EVENTS.importFailed, {
          householdId,
          importId,
          code: ERROR_CODES.IMPORT_FAILED,
          message,
        });
      }

      throw error;
    }
  }

  private isLastAttempt(job: Job<ImportRecipeJobData>): boolean {
    const attempts = job.opts.attempts ?? 1;

    return job.attemptsMade + 1 >= attempts;
  }
}
