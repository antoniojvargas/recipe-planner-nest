import { Injectable, Logger } from '@nestjs/common';
import { DEFAULT_HOUSEHOLD_TIME_ZONE } from './household.schema.js';
import { HouseholdsRepository } from './households.repository.js';

/**
 * Migración de datos: los hogares creados antes de que existiera `timeZone` no tienen el campo.
 *
 * Mongoose aplica el `default` solo a documentos nuevos, así que se rellenan una vez con `UTC`
 * (la zona con la que se calculaba la semana hasta ahora). La escritura vive en el repositorio,
 * que es el único punto que toca la colección.
 */
@Injectable()
export class HouseholdTimeZoneMigration {
  private readonly logger = new Logger(HouseholdTimeZoneMigration.name);

  constructor(private readonly households: HouseholdsRepository) {}

  async run(): Promise<number> {
    const updated = await this.households.backfillMissingTimeZone(DEFAULT_HOUSEHOLD_TIME_ZONE);

    if (updated > 0) {
      this.logger.log(
        `Zona horaria ${DEFAULT_HOUSEHOLD_TIME_ZONE} añadida a ${String(updated)} hogares`,
      );
    }

    return updated;
  }
}
