import { DEFAULT_HOUSEHOLD_TIME_ZONE } from '../src/households/household.schema.js';
import { HouseholdTimeZoneMigration } from '../src/households/household-timezone.migration.js';
import type { HouseholdsRepository } from '../src/households/households.repository.js';

describe('HouseholdTimeZoneMigration', () => {
  it('rellena con UTC los hogares que no tienen zona', async () => {
    const backfillMissingTimeZone = vi.fn().mockResolvedValue(3);
    const migration = new HouseholdTimeZoneMigration({
      backfillMissingTimeZone,
    } as unknown as HouseholdsRepository);

    await expect(migration.run()).resolves.toBe(3);
    expect(backfillMissingTimeZone).toHaveBeenCalledWith(DEFAULT_HOUSEHOLD_TIME_ZONE);
  });

  it('es idempotente: si ya no quedan hogares sin zona no modifica nada', async () => {
    const migration = new HouseholdTimeZoneMigration({
      backfillMissingTimeZone: vi.fn().mockResolvedValue(0),
    } as unknown as HouseholdsRepository);

    await expect(migration.run()).resolves.toBe(0);
  });
});
