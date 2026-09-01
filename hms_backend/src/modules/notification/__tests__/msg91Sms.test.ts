import { describe, expect, test } from 'vitest';
import { toMsg91Mobile } from '../providers/msg91Provider';

// The DLT path is unforgiving about two things: the number's shape and the fact that only the
// template's variables may travel. Both are pure enough to test without a provider or a database.

describe('toMsg91Mobile', () => {
  test('prefixes the country code onto a bare ten-digit number', () => {
    expect(toMsg91Mobile('9876543210')).toBe('919876543210');
  });

  test('strips the punctuation people actually type', () => {
    expect(toMsg91Mobile('+91 98765 43210')).toBe('919876543210');
    expect(toMsg91Mobile('+91-98765-43210')).toBe('919876543210');
  });

  test('drops a leading trunk zero', () => {
    expect(toMsg91Mobile('09876543210')).toBe('919876543210');
  });

  test('leaves an already-prefixed number alone', () => {
    expect(toMsg91Mobile('919876543210')).toBe('919876543210');
  });

  test('passes an unrecognised number through for MSG91 to reject', () => {
    // Better a provider error naming the number than a local guess that silently sends to someone else.
    expect(toMsg91Mobile('12345')).toBe('12345');
  });
});
