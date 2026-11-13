import { Global, Module } from '@nestjs/common';
import { S3Client } from '@aws-sdk/client-s3';
import { storageConfig, type StorageConfig } from '../config/index.js';

/** Token del cliente compartido de S3 (MinIO en desarrollo). */
export const S3_CLIENT = Symbol('S3_CLIENT');

const DEFAULT_REGION = 'us-east-1';

/**
 * Cliente de S3 para subidas directas desde el navegador y para el health check.
 *
 * MinIO no usa regiones, pero el SDK exige una; `forcePathStyle` hace que las peticiones
 * vayan a `S3_ENDPOINT/<bucket>` en lugar de `bucket.S3_ENDPOINT`, que es como MinIO
 * espera recibirlas.
 */
@Global()
@Module({
  providers: [
    {
      provide: S3_CLIENT,
      inject: [storageConfig.KEY],
      useFactory: (config: StorageConfig) =>
        new S3Client({
          endpoint: config.endpoint,
          region: DEFAULT_REGION,
          forcePathStyle: true,
          credentials: {
            accessKeyId: config.accessKey,
            secretAccessKey: config.secretKey,
          },
        }),
    },
  ],
  exports: [S3_CLIENT],
})
export class StorageModule {}
