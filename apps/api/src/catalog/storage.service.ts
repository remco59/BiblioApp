import { Injectable } from '@nestjs/common';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export interface StoredObject {
  body: Buffer;
  contentType: string;
}

/**
 * Bestandsopslag voor covers: S3/MinIO als `S3_ENDPOINT` is gezet, anders de lokale schijf
 * (`STORAGE_DIR`, standaard ./uploads) zodat ontwikkelen en tests geen MinIO nodig hebben.
 */
@Injectable()
export class StorageService {
  private s3?: S3Client;

  private get bucket() {
    return process.env.S3_BUCKET ?? 'covers';
  }

  private get dir() {
    return process.env.STORAGE_DIR ?? join(process.cwd(), 'uploads');
  }

  private client() {
    this.s3 ??= new S3Client({
      endpoint: process.env.S3_ENDPOINT,
      region: process.env.S3_REGION ?? 'us-east-1',
      forcePathStyle: true,
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY ?? 'biblio',
        secretAccessKey: process.env.S3_SECRET_KEY ?? 'biblio-secret',
      },
    });
    return this.s3;
  }

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    if (process.env.S3_ENDPOINT) {
      await this.client().send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: body,
          ContentType: contentType,
        }),
      );
      return;
    }
    await mkdir(this.dir, { recursive: true });
    await writeFile(join(this.dir, key), body);
    await writeFile(join(this.dir, `${key}.type`), contentType);
  }

  async get(key: string): Promise<StoredObject | null> {
    try {
      if (process.env.S3_ENDPOINT) {
        const res = await this.client().send(
          new GetObjectCommand({ Bucket: this.bucket, Key: key }),
        );
        return {
          body: Buffer.from(await res.Body!.transformToByteArray()),
          contentType: res.ContentType ?? 'application/octet-stream',
        };
      }
      const [body, type] = await Promise.all([
        readFile(join(this.dir, key)),
        readFile(join(this.dir, `${key}.type`), 'utf8'),
      ]);
      return { body, contentType: type };
    } catch {
      return null;
    }
  }
}
