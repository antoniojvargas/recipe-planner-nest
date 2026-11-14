import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { MongooseModule } from '@nestjs/mongoose';
import { HouseholdsModule } from '../households/households.module.js';
import { ImportJob, ImportJobSchema } from './import-job.schema.js';
import { ImportsController } from './imports.controller.js';
import { IMPORTS_QUEUE_NAME } from './imports.queue.js';
import { ImportsRepository } from './imports.repository.js';
import { ImportsService } from './imports.service.js';

/**
 * Importación de recetas desde una URL: encola el trabajo y expone su estado.
 *
 * La API solo crea el documento y lo encola; el procesador vive en `WorkerModule`, igual que
 * las miniaturas, para que descargar y parsear no ocupe el proceso HTTP.
 */
@Module({
  imports: [
    MongooseModule.forFeature([{ name: ImportJob.name, schema: ImportJobSchema }]),
    HouseholdsModule,
    BullModule.registerQueue({ name: IMPORTS_QUEUE_NAME }),
  ],
  controllers: [ImportsController],
  providers: [ImportsRepository, ImportsService],
  exports: [MongooseModule, ImportsRepository],
})
export class ImportsModule {}
