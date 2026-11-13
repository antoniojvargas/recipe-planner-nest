import { HealthIndicatorService } from '@nestjs/terminus';
import type { RedisClient } from '../redis/redis.module.js';
import { RedisHealthIndicator } from './redis.health.js';

function indicatorWith(ping: ReturnType<typeof vi.fn>): RedisHealthIndicator {
  const client = { ping } as unknown as RedisClient;

  return new RedisHealthIndicator(client, new HealthIndicatorService());
}

describe('RedisHealthIndicator', () => {
  it('marca Redis como up cuando PING responde', async () => {
    const result = await indicatorWith(vi.fn().mockResolvedValue('PONG')).pingCheck('redis', 1_000);

    expect(result.redis.status).toBe('up');
    expect(typeof result.redis.responseTime).toBe('number');
  });

  it('marca Redis como down con el mensaje del error cuando PING falla', async () => {
    const result = await indicatorWith(
      vi.fn().mockRejectedValue(new Error("Stream isn't writeable")),
    ).pingCheck('redis', 1_000);

    expect(result.redis).toMatchObject({
      status: 'down',
      message: "Stream isn't writeable",
    });
  });

  it('marca Redis como down cuando PING supera el timeout', async () => {
    const hanging = vi.fn().mockImplementation(() => new Promise(() => undefined));

    const result = await indicatorWith(hanging).pingCheck('redis', 10);

    expect(result.redis.status).toBe('down');
    expect(result.redis.message).toBe('timeout of 10ms exceeded');
  });
});
