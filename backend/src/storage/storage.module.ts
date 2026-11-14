import { Global, Module } from '@nestjs/common';
import { S3Client } from '@aws-sdk/client-s3';
import { storageConfig, type StorageConfig } from '../config/index.js';

/** Token del cliente compartido de S3 (MinIO en desarrollo). */
export const S3_CLIENT = Symbol('S3_CLIENT');

/** Token del cliente que firma URLs para el navegador, con el host público. */
export const S3_PUBLIC_CLIENT = Symbol('S3_PUBLIC_CLIENT');

const DEFAULT_REGION = 'us-east-1';

function createClient(endpoint: string, config: StorageConfig): S3Client {
  return new S3Client({
    endpoint,
    region: DEFAULT_REGION,
    forcePathStyle: true,
    credentials: {
      accessKeyId: config.accessKey,
      secretAccessKey: config.secretKey,
    },
  });
}

/**
 * Clientes de S3 (MinIO en desarrollo).
 *
 * - `S3_CLIENT` habla con `S3_ENDPOINT`, el nombre interno del servicio: subir, `HeadObject`,
 *   borrar. Ese host no lo resuelve el navegador.
 * - `S3_PUBLIC_CLIENT` usa `S3_PUBLIC_ENDPOINT` y solo firma URLs que abre el navegador, de
 *   modo que la URL entregada y la firmada son la misma.
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
      useFactory: (config: StorageConfig) => createClient(config.endpoint, config),
    },
    {
      provide: S3_PUBLIC_CLIENT,
      inject: [storageConfig.KEY],
      useFactory: (config: StorageConfig) => createClient(config.publicEndpoint, config),
    },
  ],
  exports: [S3_CLIENT, S3_PUBLIC_CLIENT],
})
export class StorageModule {}
