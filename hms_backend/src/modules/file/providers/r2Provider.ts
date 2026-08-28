import { Client as MinioClient } from 'minio';
import { env } from '../../../config/env';
import type { FileStorageProvider } from './types';

// Cloudflare R2 (S3-compatible object storage) via the MinIO client — no AWS dependency or account.
// Default-private bucket + short-lived presigned URLs. Selected when FILE_STORAGE_PROVIDER=r2;
// dormant otherwise. For PHI, pin the R2 bucket's jurisdiction to India (architecture.md → File
// Storage). Also works with any other S3-compatible store (e.g. E2E Object Storage) by endpoint.
function parseEndpoint(raw: string): { endPoint: string; port: number; useSSL: boolean } {
  try {
    const u = new URL(raw.includes('://') ? raw : `https://${raw}`);
    return {
      endPoint: u.hostname,
      port: u.port ? Number(u.port) : u.protocol === 'http:' ? 80 : 443,
      useSSL: u.protocol !== 'http:',
    };
  } catch {
    return { endPoint: raw, port: 443, useSSL: true };
  }
}

export class R2FileStorageProvider implements FileStorageProvider {
  readonly name = 'r2';
  private readonly bucket = env.R2_BUCKET ?? '';
  private readonly client: MinioClient;

  constructor() {
    const { endPoint, port, useSSL } = parseEndpoint(env.R2_ENDPOINT ?? '');
    this.client = new MinioClient({
      endPoint,
      port,
      useSSL,
      region: env.R2_REGION,
      accessKey: env.R2_ACCESS_KEY_ID ?? '',
      secretKey: env.R2_SECRET_ACCESS_KEY ?? '',
    });
  }

  async putObject(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.client.putObject(this.bucket, key, body, body.length, {
      'Content-Type': contentType,
    });
  }

  async getObject(key: string): Promise<Buffer> {
    const stream = await this.client.getObject(this.bucket, key);
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk as Buffer);
    return Buffer.concat(chunks);
  }

  async deleteObject(key: string): Promise<void> {
    await this.client.removeObject(this.bucket, key);
  }

  async getSignedDownloadUrl(
    key: string,
    filename: string,
    disposition: 'inline' | 'attachment' = 'attachment',
  ): Promise<string | null> {
    // Display assets (a tenant logo, favicon or letterhead) are embedded in an <img>/<link>,
    // so they must render inline — the same way the local provider serves them. An inline
    // asset also carries NO signed `response-content-disposition` override, keeping the
    // presigned GET a plain, robustly-signed request (a forced-download override is the one
    // response-header R2 has to validate on top of the base signature). Documents keep the
    // attachment disposition so they download with their original filename.
    if (disposition === 'inline') {
      return this.client.presignedGetObject(this.bucket, key, 600);
    }
    return this.client.presignedGetObject(this.bucket, key, 600, {
      'response-content-disposition': `attachment; filename="${filename}"`,
    });
  }
}
