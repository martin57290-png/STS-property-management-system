import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl as presign } from '@aws-sdk/s3-request-presigner';
import type { StorageService } from './index';

/**
 * S3-compatible implementation (AWS S3, Cloudflare R2, MinIO, ...).
 * Configure via S3_BUCKET / S3_REGION / S3_ENDPOINT / S3_ACCESS_KEY_ID /
 * S3_SECRET_ACCESS_KEY and set STORAGE_DRIVER=s3.
 */
export class S3StorageService implements StorageService {
  private client: S3Client;
  private bucket: string;

  constructor() {
    this.bucket = process.env.S3_BUCKET || '';
    if (!this.bucket) {
      throw new Error('STORAGE_DRIVER=s3 requires S3_BUCKET to be set');
    }
    this.client = new S3Client({
      region: process.env.S3_REGION || 'us-west-1',
      ...(process.env.S3_ENDPOINT ? { endpoint: process.env.S3_ENDPOINT, forcePathStyle: true } : {}),
      credentials:
        process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY
          ? {
              accessKeyId: process.env.S3_ACCESS_KEY_ID,
              secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
            }
          : undefined,
    });
  }

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType }),
    );
  }

  async get(key: string): Promise<Buffer> {
    const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    const bytes = await res.Body?.transformToByteArray();
    if (!bytes) throw new Error(`S3 object ${key} has no body`);
    return Buffer.from(bytes);
  }

  async getSignedUrl(key: string, expiresInSeconds = 900): Promise<string> {
    return presign(this.client, new GetObjectCommand({ Bucket: this.bucket, Key: key }), {
      expiresIn: expiresInSeconds,
    });
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}
