import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { SeedModule } from './seed.module.js';
import { SEED_PASSWORD, SEED_USERS, SeedService } from './seed.service.js';

const logger = new Logger('Seed');
const app = await NestFactory.createApplicationContext(SeedModule, {
  logger: ['error', 'warn', 'log'],
});

try {
  const summary = await app.get(SeedService).run();
  const week = summary.weekStart.toISOString().slice(0, 10);

  logger.log(
    `Datos de ejemplo listos: ${String(summary.recipes)} recetas, ${String(summary.slots)} huecos en el plan de la semana del ${week} y ${String(summary.pantryItems)} artículos en la despensa.`,
  );
  logger.log(
    `Usuarios: ${SEED_USERS.map((user) => user.email).join(', ')} · contraseña: ${SEED_PASSWORD}`,
  );
} catch (error) {
  logger.error('El seed falló', error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
} finally {
  // Cierra Mongo con la misma secuencia que la API.
  await app.close();
}
