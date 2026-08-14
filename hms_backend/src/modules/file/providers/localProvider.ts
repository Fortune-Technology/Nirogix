import { promises as fs } from 'node:fs';
import { join, dirname } from 'node:path';
import { env } from '../../../config/env';
import type { FileStorageProvider } from './types';

// Development provider — stores objects on local disk under FILE_STORAGE_LOCAL_DIR (gitignored).
// Cannot mint native signed URLs, so downloads are served by the app's tokenized content route.
export class LocalFileStorageProvider implements FileStorageProvider {
  readonly name = 'local';
  private readonly base = env.FILE_STORAGE_LOCAL_DIR;

  private pathFor(key: string): string {
    return join(this.base, key);
  }

  async putObject(key: string, body: Buffer): Promise<void> {
    const p = this.pathFor(key);
    await fs.mkdir(dirname(p), { recursive: true });
    await fs.writeFile(p, body);
  }

  async getObject(key: string): Promise<Buffer> {
    return fs.readFile(this.pathFor(key));
  }

  async deleteObject(key: string): Promise<void> {
    await fs.rm(this.pathFor(key), { force: true });
  }

  async getSignedDownloadUrl(): Promise<string | null> {
    return null; // app serves via /api/v1/files/content/:id?token=...
  }
}
