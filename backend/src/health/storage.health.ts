import { Inject, Injectable } from '@nestjs/common';
import { HeadBucketCommand, type S3Client } from '@aws-sdk/client-s3';
import { HealthIndicatorService, type HealthCheckAttempt } from '@nestjs/terminus';
import { storageConfig, type StorageConfig } from '../config/index.js';
import { S3_CLIENT } from '../storage/storage.module.js';

/**
 * Comprueba que el bucket de MinIO/S3 existe y es accesible.
 *
 * `HeadBucket` no descarga nada: solo consulta la cabecera del bucket, con los mismos
 * permisos que usará la API para firmar subidas.
 */
@Injectable()
export class StorageHealthIndicator {
  constructor(
    @Inject(S3_CLIENT) private readonly client: S3Client,
    @Inject(storageConfig.KEY) private readonly config: StorageConfig,
    private readonly healthIndicatorService: HealthIndicatorService,
  ) {}

  check(key: string, timeoutMs: number): HealthCheckAttempt {
    return this.healthIndicatorService
      .check(key)
      .attempt(async () => {
        await this.client.send(new HeadBucketCommand({ Bucket: this.config.bucket }));
      })
      .withTimeout(timeoutMs);
  }
}
