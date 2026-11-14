import { Controller, Get, HttpStatus, Res, ServiceUnavailableException } from '@nestjs/common';
import { Public } from '../auth/decorators/public.decorator.js';
import {
  HealthCheck,
  HealthCheckService,
  MongooseHealthIndicator,
  type HealthCheckResult,
} from '@nestjs/terminus';
import type { FastifyReply } from 'fastify';
import { HEALTH_CHECK_TIMEOUT_MS, HEALTH_KEYS } from './health.constants.js';
import { RedisHealthIndicator } from './redis.health.js';
import { StorageHealthIndicator } from './storage.health.js';

/**
 * `GET /api/health`: estado de la API y de sus dependencias.
 *
 * Terminus lanza `ServiceUnavailableException` cuando alguna dependencia está caída. Aquí se
 * captura para responder 503 **con el detalle** de qué falla: el `AllExceptionsFilter` global
 * convertiría el 503 en el sobre genérico `INTERNAL_ERROR` y perdería esa información, que es
 * justo la útil en un health check. El cuerpo mantiene el formato de Terminus
 * (`status`, `info`, `error`, `details`) tanto en 200 como en 503.
 */
@Public()
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly mongoose: MongooseHealthIndicator,
    private readonly redis: RedisHealthIndicator,
    private readonly storage: StorageHealthIndicator,
  ) {}

  @Get()
  @HealthCheck()
  async check(@Res({ passthrough: true }) response: FastifyReply): Promise<HealthCheckResult> {
    try {
      return await this.health.check([
        () => this.mongoose.pingCheck(HEALTH_KEYS.mongo, { timeout: HEALTH_CHECK_TIMEOUT_MS }),
        () => this.redis.pingCheck(HEALTH_KEYS.redis, HEALTH_CHECK_TIMEOUT_MS),
        () => this.storage.check(HEALTH_KEYS.storage, HEALTH_CHECK_TIMEOUT_MS),
      ]);
    } catch (error) {
      if (error instanceof ServiceUnavailableException) {
        response.status(HttpStatus.SERVICE_UNAVAILABLE);

        return error.getResponse() as HealthCheckResult;
      }

      throw error;
    }
  }
}
