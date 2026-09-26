/**
 * storageAdapter.ts
 * ------------------------------------------------------------------
 * Abstraction over "where encrypted file bytes physically live".
 *
 * Two drivers are provided:
 *   - "local": writes encrypted blobs to disk under LOCAL_STORAGE_PATH.
 *              Useful for running/demoing the project without AWS
 *              credentials.
 *   - "s3":    uploads encrypted blobs to a private Amazon S3 bucket
 *              using the official AWS SDK v3, with signed URLs for
 *              any direct access.
 *
 * IMPORTANT: In both drivers, only ENCRYPTED bytes are ever written.
 * Plaintext never touches storage.
 * ------------------------------------------------------------------
 */

import fs from 'fs';
import path from 'path';
import { env } from '../config/env';

export interface StorageAdapter {
  /** Persist encrypted bytes under the given object key. */
  putObject(objectKey: string, data: Buffer, contentType?: string): Promise<void>;
  /** Retrieve encrypted bytes previously stored under objectKey. */
  getObject(objectKey: string): Promise<Buffer>;
  /** Permanently remove the object. */
  deleteObject(objectKey: string): Promise<void>;
  /** Optional: a time-limited signed URL for direct download (S3 only; local returns null). */
  getSignedDownloadUrl(objectKey: string, expirySeconds: number): Promise<string | null>;
}

// --------------------------------------------------------------
// Local filesystem driver
// --------------------------------------------------------------
class LocalStorageAdapter implements StorageAdapter {
  private basePath: string;

  constructor() {
    this.basePath = path.resolve(env.LOCAL_STORAGE_PATH);
    fs.mkdirSync(this.basePath, { recursive: true });
  }

  private resolveSafe(objectKey: string): string {
    // Prevent path traversal: reject any key that escapes the storage root.
    const resolved = path.resolve(this.basePath, objectKey);
    if (!resolved.startsWith(this.basePath)) {
      throw new Error('Invalid object key: path traversal detected');
    }
    return resolved;
  }

  async putObject(objectKey: string, data: Buffer): Promise<void> {
    const fullPath = this.resolveSafe(objectKey);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, data);
  }

  async getObject(objectKey: string): Promise<Buffer> {
    const fullPath = this.resolveSafe(objectKey);
    if (!fs.existsSync(fullPath)) {
      throw new Error('Object not found in storage');
    }
    return fs.readFileSync(fullPath);
  }

  async deleteObject(objectKey: string): Promise<void> {
    const fullPath = this.resolveSafe(objectKey);
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
    }
  }

  async getSignedDownloadUrl(): Promise<string | null> {
    // Local driver has no direct-access URL concept; downloads always
    // go through the authenticated /files/:id/download API route.
    return null;
  }
}

// --------------------------------------------------------------
// Amazon S3 driver
// --------------------------------------------------------------
class S3StorageAdapter implements StorageAdapter {
  private client: import('@aws-sdk/client-s3').S3Client;
  private bucket: string;

  constructor() {
    // Lazy require so the AWS SDK is only loaded when actually needed.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { S3Client } = require('@aws-sdk/client-s3');
    this.client = new S3Client({
      region: env.AWS_REGION,
      // Custom endpoint + path-style addressing lets this exact same
      // adapter talk to any S3-compatible provider (Cloudflare R2,
      // Backblaze B2, MinIO, etc.), not just AWS itself - see
      // config/env.ts's AWS_S3_ENDPOINT for why this matters for a
      // free, no-time-limit demo deployment.
      ...(env.AWS_S3_ENDPOINT ? { endpoint: env.AWS_S3_ENDPOINT, forcePathStyle: env.AWS_S3_FORCE_PATH_STYLE } : {}),
      credentials:
        env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY
          ? { accessKeyId: env.AWS_ACCESS_KEY_ID, secretAccessKey: env.AWS_SECRET_ACCESS_KEY }
          : undefined,
    });
    this.bucket = env.AWS_S3_BUCKET;
    if (!this.bucket) {
      throw new Error('AWS_S3_BUCKET must be set when STORAGE_DRIVER=s3');
    }
  }

  async putObject(objectKey: string, data: Buffer, contentType?: string): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { PutObjectCommand } = require('@aws-sdk/client-s3');
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: objectKey,
        Body: data,
        ContentType: contentType ?? 'application/octet-stream',
        ServerSideEncryption: 'AES256', // defense in depth; app-layer encryption is primary
      })
    );
  }

  async getObject(objectKey: string): Promise<Buffer> {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { GetObjectCommand } = require('@aws-sdk/client-s3');
    const result = (await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: objectKey }))) as {
      Body?: AsyncIterable<Buffer>;
    };
    const chunks: Buffer[] = [];
    for await (const chunk of result.Body ?? []) {
      chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  async deleteObject(objectKey: string): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { DeleteObjectCommand } = require('@aws-sdk/client-s3');
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: objectKey }));
  }

  async getSignedDownloadUrl(objectKey: string, expirySeconds: number): Promise<string | null> {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { GetObjectCommand } = require('@aws-sdk/client-s3');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
    return getSignedUrl(this.client, new GetObjectCommand({ Bucket: this.bucket, Key: objectKey }), {
      expiresIn: expirySeconds,
    });
  }
}

let adapter: StorageAdapter | null = null;

export function getStorageAdapter(): StorageAdapter {
  if (adapter) return adapter;
  adapter = env.STORAGE_DRIVER === 's3' ? new S3StorageAdapter() : new LocalStorageAdapter();
  return adapter;
}
