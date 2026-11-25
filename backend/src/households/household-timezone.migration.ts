import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { DEFAULT_HOUSEHOLD_TIME_ZONE, Household } from './household.schema.js';

/**
 * Migración de datos: los hogares creados antes de que existiera `timeZone` no tienen el campo.
 *
 * Mongoose aplica el `default` solo a documentos nuevos, así que se rellenan una vez con `UTC`
 * (la zona con la que se calculaba la semana hasta ahora). El filtro solo toca documentos sin
 * campo, así que ejecutarla dos veces no cambia nada y no pisa una zona ya elegida.
 */
@Injectable()
export class HouseholdTimeZoneMigration {
  private readonly logger = new Logger(HouseholdTimeZoneMigration.name);

  constructor(@InjectModel(Household.name) private readonly householdModel: Model<Household>) {}

  async run(): Promise<number> {
    const result = await this.householdModel
      .updateMany(
        { timeZone: { $exists: false } },
        { $set: { timeZone: DEFAULT_HOUSEHOLD_TIME_ZONE } },
      )
      .exec();

    if (result.modifiedCount > 0) {
      this.logger.log(
        `Zona horaria ${DEFAULT_HOUSEHOLD_TIME_ZONE} añadida a ${String(result.modifiedCount)} hogares`,
      );
    }

    return result.modifiedCount;
  }
}
