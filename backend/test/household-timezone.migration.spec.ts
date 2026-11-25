import type { Model } from 'mongoose';
import { DEFAULT_HOUSEHOLD_TIME_ZONE, type Household } from '../src/households/household.schema.js';
import { HouseholdTimeZoneMigration } from '../src/households/household-timezone.migration.js';

describe('HouseholdTimeZoneMigration', () => {
  it('rellena la zona de los hogares que no tienen el campo', async () => {
    const exec = vi.fn().mockResolvedValue({ modifiedCount: 3 });
    const updateMany = vi.fn().mockReturnValue({ exec });
    const migration = new HouseholdTimeZoneMigration({
      updateMany,
    } as unknown as Model<Household>);

    await expect(migration.run()).resolves.toBe(3);
    expect(updateMany).toHaveBeenCalledWith(
      { timeZone: { $exists: false } },
      { $set: { timeZone: DEFAULT_HOUSEHOLD_TIME_ZONE } },
    );
    expect(exec).toHaveBeenCalledOnce();
  });

  it('es idempotente: si ya no quedan hogares sin zona no modifica nada', async () => {
    const exec = vi.fn().mockResolvedValue({ modifiedCount: 0 });
    const migration = new HouseholdTimeZoneMigration({
      updateMany: vi.fn().mockReturnValue({ exec }),
    } as unknown as Model<Household>);

    await expect(migration.run()).resolves.toBe(0);
  });
});
