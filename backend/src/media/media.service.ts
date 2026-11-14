import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { S3Client } from '@aws-sdk/client-s3';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';
import { storageConfig, type StorageConfig } from '../config/index.js';
import { S3_PUBLIC_CLIENT } from '../storage/storage.module.js';
import type { CreateUploadUrlDto } from './dto/create-upload-url.dto.js';
import {
  householdMediaPrefix,
  IMAGE_EXTENSIONS,
  UPLOAD_URL_TTL_SECONDS,
} from './media.constants.js';
import type { UploadUrlResponse } from './media.types.js';

/**
 * URLs prefirmadas para que el navegador suba la imagen directamente a MinIO/S3.
 *
 * La API no recibe el fichero: entrega una política de `POST` de corta duración atada al tipo,
 * al tamaño declarado y a una clave aleatoria dentro del prefijo del hogar. La URL se firma con
 * el cliente público (`S3_PUBLIC_ENDPOINT`) porque es el host que el navegador puede abrir.
 */
@Injectable()
export class MediaService {
  constructor(
    @Inject(S3_PUBLIC_CLIENT) private readonly s3: S3Client,
    @Inject(storageConfig.KEY) private readonly config: StorageConfig,
  ) {}

  async createUploadUrl(householdId: string, dto: CreateUploadUrlDto): Promise<UploadUrlResponse> {
    const key = `${householdMediaPrefix(householdId)}${randomUUID()}.${IMAGE_EXTENSIONS[dto.contentType]}`;
    const expiresAt = new Date(Date.now() + UPLOAD_URL_TTL_SECONDS * 1_000);

    const { url, fields } = await createPresignedPost(this.s3, {
      Bucket: this.config.bucket,
      Key: key,
      Expires: UPLOAD_URL_TTL_SECONDS,
      Fields: { 'Content-Type': dto.contentType },
      Conditions: [
        ['eq', '$Content-Type', dto.contentType],
        // Ni un byte de más: el tamaño declarado es también el techo de la subida.
        ['content-length-range', 1, dto.size],
      ],
    });

    return { key, url, fields, expiresAt };
  }
}
