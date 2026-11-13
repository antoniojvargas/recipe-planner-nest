import 'reflect-metadata';
import { createInfraFakes } from './support/fake-infra.js';
import { createTestApp } from './support/test-app.js';

describe('Apagado ordenado (e2e)', () => {
  it('cierra Redis y Mongo al apagar la app', async () => {
    const fakes = createInfraFakes();
    const app = await createTestApp(fakes);

    await app.close();

    expect(fakes.redis.quit).toHaveBeenCalledOnce();
    expect(fakes.mongo.close).toHaveBeenCalled();
  });

  it('corta Redis con disconnect si no está conectado', async () => {
    const fakes = createInfraFakes();
    fakes.redis.status = 'reconnecting';
    const app = await createTestApp(fakes);

    await app.close();

    expect(fakes.redis.quit).not.toHaveBeenCalled();
    expect(fakes.redis.disconnect).toHaveBeenCalledOnce();
  });
});
