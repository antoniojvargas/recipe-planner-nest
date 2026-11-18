import { Inject, Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import type { Connection } from 'mongoose';
import { REDIS_CLIENT, type RedisClient } from '../redis/redis.module.js';

/**
 * Operaciones de mantenimiento disponibles solo en el entorno de pruebas e2e.
 *
 * Borra los datos de MongoDB y Redis para dejar la aplicación en un estado limpio
 * entre escenarios sin recrear los contenedores.
 */
@Injectable()
export class TestingService {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    @Inject(REDIS_CLIENT) private readonly redis: RedisClient,
  ) {}

  async reset(): Promise<void> {
    await this.resetMongo();
    await this.resetRedis();
  }

  private async resetMongo(): Promise<void> {
    const collections = Object.values(this.connection.collections);

    await Promise.all(collections.map((collection) => collection.deleteMany({})));
  }

  private async resetRedis(): Promise<void> {
    await this.redis.flushdb();
  }
}
