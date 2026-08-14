import { env } from '../../../config/env';
import type { FileStorageProvider } from './types';
import { LocalFileStorageProvider } from './localProvider';
import { R2FileStorageProvider } from './r2Provider';

let instance: FileStorageProvider | null = null;

// Provider chosen by config; the rest of the app depends only on the FileStorageProvider interface.
export function getFileStorageProvider(): FileStorageProvider {
  if (!instance) {
    instance =
      env.FILE_STORAGE_PROVIDER === 'r2'
        ? new R2FileStorageProvider()
        : new LocalFileStorageProvider();
  }
  return instance;
}

export * from './types';
