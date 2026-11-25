import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { getConnectionToken } from '@nestjs/mongoose';
import type { Connection } from 'mongoose';
import { HouseholdTimeZoneMigration } from '../households/household-timezone.migration.js';
import { MigrateModule } from './migrate.module.js';

const logger = new Logger('Migrate');
const app = await NestFactory.createApplicationContext(MigrateModule, {
  logger: ['error', 'warn', 'log'],
});

try {
  // La API usa `lazyConnection`; una migración sí puede esperar a que Mongo esté disponible.
  const connection = app.get<Connection>(getConnectionToken());
  await connection.asPromise();

  const updated = await app.get(HouseholdTimeZoneMigration).run();

  logger.log(
    updated === 0
      ? 'No había hogares sin zona horaria: nada que migrar.'
      : `Migración completada: ${String(updated)} hogares actualizados.`,
  );
} catch (error) {
  logger.error('La migración falló', error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
} finally {
  await app.close();
}
