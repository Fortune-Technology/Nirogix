// File storage provider abstraction (ADR-007): no module imports a storage SDK directly. Swapping
// local disk for E2E Object Storage (S3-compatible) is a config change, not a code change.
export interface FileStorageProvider {
  readonly name: string;
  putObject(key: string, body: Buffer, contentType: string): Promise<void>;
  getObject(key: string): Promise<Buffer>;
  deleteObject(key: string): Promise<void>;
  // A provider-native short-lived signed URL, or null if the provider cannot mint one — then the
  // app serves the object itself via a tokenized content route (used by the local dev provider).
  getSignedDownloadUrl(key: string, filename: string): Promise<string | null>;
}
