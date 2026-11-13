import { Inject, Injectable } from '@nestjs/common';
import { HealthIndicatorService, type HealthCheckAttempt } from '@nestjs/terminus';
import { REDIS_CLIENT, type RedisClient } from '../redis/redis.module.js';

/**
 * Comprueba que Redis responde a un `PING`.
 *
 * `withTimeout` corta la espera a 2 s: con Redis caído y el cliente reintentando, sin él
 * el health check podría quedarse colgado hasta que el socket diera error.
 */
@Injectable()
export class RedisHealthIndicator {
  constructor(
    @Inject(REDIS_CLIENT) private readonly client: RedisClient,
    private readonly healthIndicatorService: HealthIndicatorService,
  ) {}

  pingCheck(key: string, timeoutMs: number): HealthCheckAttempt {
    return this.healthIndicatorService
      .check(key)
      .attempt(async () => {
        await this.client.ping();
      })
      .withTimeout(timeoutMs);
  }
}
