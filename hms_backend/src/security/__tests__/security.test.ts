import { describe, expect, test } from 'vitest';
import {
  decryptSecret,
  encryptSecret,
  isEncryptionConfigured,
  safeEqual,
  tryDecryptSecret,
} from '../encryption';
import {
  containsAadhaarLike,
  maskAadhaar,
  maskMobile,
  redactAadhaarText,
  scrubAadhaar,
} from '../redaction';

/**
 * The two security primitives ABDM Milestone 1 rests on (ADR-084). No database — these are pure
 * functions, and they are the ones that decide whether an Aadhaar number can leak and whether a
 * stolen row hands over a live bearer token.
 */

describe('encryption at rest', () => {
  test('round-trips a value', () => {
    expect(isEncryptionConfigured()).toBe(true);
    const secret = 'linking-token-abc-123';
    const envelope = encryptSecret(secret);
    expect(envelope).not.toContain(secret);
    expect(envelope.startsWith('v1.')).toBe(true);
    expect(decryptSecret(envelope)).toBe(secret);
  });

  test('the same plaintext encrypts differently every time', () => {
    // A deterministic ciphertext would let anyone with read access tell which rows hold the same
    // token — the nonce is what prevents that.
    expect(encryptSecret('same')).not.toBe(encryptSecret('same'));
  });

  test('a tampered envelope is rejected, not silently decrypted', () => {
    const envelope = encryptSecret('sensitive');
    const parts = envelope.split('.');
    const flipped = Buffer.from(parts[3]!, 'base64');
    flipped[0] = (flipped[0]! ^ 0xff) & 0xff;
    const tampered = [parts[0], parts[1], parts[2], flipped.toString('base64')].join('.');
    expect(() => decryptSecret(tampered)).toThrow();
    expect(tryDecryptSecret(tampered)).toBeNull();
  });

  test('an unrecognised envelope fails closed', () => {
    expect(() => decryptSecret('not-an-envelope')).toThrow();
    expect(tryDecryptSecret(null)).toBeNull();
    expect(tryDecryptSecret(undefined)).toBeNull();
  });

  test('safeEqual compares without leaking length-independent timing', () => {
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abd')).toBe(false);
    expect(safeEqual('abc', 'abcd')).toBe(false);
  });
});

describe('Aadhaar redaction', () => {
  test('masks a bare 12-digit number', () => {
    expect(redactAadhaarText('aadhaar 123456789012 sent')).toBe('aadhaar XXXXXXXX9012 sent');
  });

  test('masks the spaced and hyphenated forms', () => {
    expect(redactAadhaarText('1234 5678 9012')).toBe('XXXXXXXX9012');
    expect(redactAadhaarText('1234-5678-9012')).toBe('XXXXXXXX9012');
  });

  test('leaves a longer digit run alone rather than half-masking it', () => {
    // A 16-digit card number must not come out as a mangled hybrid that looks redacted but is not.
    const card = '4111111111111111';
    expect(redactAadhaarText(card)).toBe(card);
  });

  test('an ABHA number survives — it is not an Aadhaar', () => {
    // Regression: `91-1234-5678-9999` was being stored as `91-XXXXXXXX9999`, because its last
    // twelve digits are a 4-4-4 group. Found in the browser via a Scan-and-Share profile.
    expect(redactAadhaarText('ABHA 91-1234-5678-9999 verified')).toBe(
      'ABHA 91-1234-5678-9999 verified',
    );
    expect(redactAadhaarText('91-1234-5678-9999')).toBe('91-1234-5678-9999');
    expect(containsAadhaarLike('91-1234-5678-9999')).toBe(false);
  });

  test('an Aadhaar beside an ABHA is still masked', () => {
    const out = redactAadhaarText('abha 91-1234-5678-9999 aadhaar 123456789012');
    expect(out).toContain('91-1234-5678-9999');
    expect(out).toContain('XXXXXXXX9012');
    expect(out).not.toContain('123456789012');
  });

  test('detects Aadhaar-shaped content', () => {
    expect(containsAadhaarLike('id 999988887777')).toBe(true);
    expect(containsAadhaarLike('no numbers here')).toBe(false);
    // Called repeatedly — a stateful regex would return alternating answers for the same input.
    expect(containsAadhaarLike('id 999988887777')).toBe(true);
  });

  test('masking keeps only the last four digits', () => {
    expect(maskAadhaar('123456789012')).toBe('XXXXXXXX9012');
    expect(maskAadhaar('1234 5678 9012')).toBe('XXXXXXXX9012');
    expect(maskMobile('9876543210')).toBe('XXXXXX3210');
  });

  test('scrubs nested structures, arrays and errors', () => {
    const scrubbed = scrubAadhaar({
      note: 'patient 123456789012',
      list: ['other 210987654321'],
      nested: { deep: { value: '111122223333' } },
    });
    expect(JSON.stringify(scrubbed)).not.toContain('123456789012');
    expect(JSON.stringify(scrubbed)).not.toContain('210987654321');
    expect(JSON.stringify(scrubbed)).not.toContain('111122223333');

    const err = new Error('failed for 123456789012');
    scrubAadhaar(err);
    expect(err.message).toBe('failed for XXXXXXXX9012');
  });

  test('survives a cyclic object without hanging', () => {
    const cyclic: Record<string, unknown> = { id: '123456789012' };
    cyclic.self = cyclic;
    expect(() => scrubAadhaar(cyclic)).not.toThrow();
  });
});
