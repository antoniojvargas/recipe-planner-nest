import { ARGON2_OPTIONS, PasswordHasher } from './password.hasher.js';

describe('PasswordHasher', () => {
  const hasher = new PasswordHasher();

  beforeAll(async () => {
    await hasher.onModuleInit();
  });

  it('genera hashes argon2id con los parámetros configurados', async () => {
    const hash = await hasher.hash('Correcta123');

    expect(hash).toMatch(/^\$argon2id\$v=19\$/);
    expect(ARGON2_OPTIONS).toMatchObject({ memoryCost: 19_456, timeCost: 2, parallelism: 1 });
  });

  it('acepta la contraseña correcta y rechaza otra', async () => {
    const hash = await hasher.hash('Correcta123');

    await expect(hasher.verify(hash, 'Correcta123')).resolves.toBe(true);
    await expect(hasher.verify(hash, 'Incorrecta123')).resolves.toBe(false);
  });

  it('trata un hash con formato inválido como contraseña incorrecta', async () => {
    await expect(hasher.verify('no-es-un-hash', 'Correcta123')).resolves.toBe(false);
  });

  it('el verificador de relleno siempre devuelve false', async () => {
    await expect(hasher.verifyDummy('Correcta123')).resolves.toBe(false);
  });
});
