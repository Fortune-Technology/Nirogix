import { afterEach, describe, expect, test, vi } from 'vitest';

// Unit test for the R2 provider's presigned-URL shaping — fully mocked, no network or DB.
// Locks in the fix for the staging branding 403: display assets (logo/favicon/letterhead) must
// be signed *inline* with NO `response-content-disposition` override, while documents keep the
// forced-download disposition. The override was the one response-header R2 had to validate on top
// of the base signature, and dropping it for images both renders them in place and removes a
// signing surface. See providers/r2Provider.ts.

const { presignedGetObject } = vi.hoisted(() => ({ presignedGetObject: vi.fn().mockResolvedValue('https://signed.example/obj') }));

vi.mock('minio', () => ({
  Client: vi.fn().mockImplementation(() => ({ presignedGetObject })),
}));

vi.mock('../../../config/env', () => ({
  env: {
    R2_ENDPOINT: 'https://acct.r2.cloudflarestorage.com',
    R2_REGION: 'auto',
    R2_BUCKET: 'nirogix-documents-staging',
    R2_ACCESS_KEY_ID: 'key',
    R2_SECRET_ACCESS_KEY: 'secret',
  },
}));

import { R2FileStorageProvider } from '../providers/r2Provider';

const KEY = 'tenant-1/branding/uuid-logo.png';
const EXPIRY = 600;

afterEach(() => presignedGetObject.mockClear());

describe('R2 provider — presigned download URL disposition', () => {
  test('default (attachment) forces a download with the original filename', async () => {
    await new R2FileStorageProvider().getSignedDownloadUrl(KEY, 'logo.png');
    expect(presignedGetObject).toHaveBeenCalledWith('nirogix-documents-staging', KEY, EXPIRY, {
      'response-content-disposition': 'attachment; filename="logo.png"',
    });
  });

  test('inline serves a plain presigned GET with no response-header override', async () => {
    await new R2FileStorageProvider().getSignedDownloadUrl(KEY, 'logo.png', 'inline');
    // Exactly three args — no fourth respHeaders object to sign.
    expect(presignedGetObject).toHaveBeenCalledWith('nirogix-documents-staging', KEY, EXPIRY);
    expect(presignedGetObject.mock.calls[0]).toHaveLength(3);
  });

  test('explicit attachment still carries the disposition override', async () => {
    await new R2FileStorageProvider().getSignedDownloadUrl(KEY, 'report.pdf', 'attachment');
    expect(presignedGetObject).toHaveBeenCalledWith('nirogix-documents-staging', KEY, EXPIRY, {
      'response-content-disposition': 'attachment; filename="report.pdf"',
    });
  });
});
