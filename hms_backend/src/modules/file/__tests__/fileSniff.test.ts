import { describe, test, expect } from 'vitest';
import { contentMatchesDeclared, looksLikeText, sniffMimeType } from '../fileSniff';

// The declared MIME type is a claim by the uploader; these assert the bytes decide
// (ADR-082, SECURITY-AUDIT.md M-4).

const PDF = Buffer.from('%PDF-1.7\n%âãÏÓ\n');
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
const GIF = Buffer.from('GIF89a________');
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBPVP8 ')]);
const DOCX = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x06, 0x00]);
const DOC = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0x00, 0x00]);
const TEXT = Buffer.from('Patient handout\r\nTake one tablet twice daily.\n');
// An ELF binary: the classic "rename it to .png and upload it" payload.
const ELF = Buffer.from([0x7f, 0x45, 0x4c, 0x46, 0x02, 0x01, 0x01, 0x00, 0x00, 0x00]);

describe('file content sniffing', () => {
  test('identifies each allowed type from its signature', () => {
    expect(sniffMimeType(PDF)).toBe('application/pdf');
    expect(sniffMimeType(PNG)).toBe('image/png');
    expect(sniffMimeType(JPEG)).toBe('image/jpeg');
    expect(sniffMimeType(GIF)).toBe('image/gif');
    expect(sniffMimeType(WEBP)).toBe('image/webp');
    expect(sniffMimeType(DOCX)).toBe(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
    expect(sniffMimeType(DOC)).toBe('application/msword');
    expect(sniffMimeType(TEXT)).toBe('text/plain');
  });

  test('a binary renamed as an image is refused', () => {
    expect(contentMatchesDeclared('image/png', sniffMimeType(ELF))).toBe(false);
    expect(contentMatchesDeclared('text/plain', sniffMimeType(ELF))).toBe(false);
  });

  test('a real file declared as the wrong allowed type is refused', () => {
    expect(contentMatchesDeclared('image/png', sniffMimeType(PDF))).toBe(false);
    expect(contentMatchesDeclared('application/pdf', sniffMimeType(PNG))).toBe(false);
  });

  test('a matching declaration passes', () => {
    expect(contentMatchesDeclared('application/pdf', sniffMimeType(PDF))).toBe(true);
    expect(contentMatchesDeclared('image/jpeg', sniffMimeType(JPEG))).toBe(true);
    expect(contentMatchesDeclared('text/plain', sniffMimeType(TEXT))).toBe(true);
  });

  test('text detection rejects NUL bytes, control bytes and invalid UTF-8', () => {
    expect(looksLikeText(Buffer.from('plain clinical note'))).toBe(true);
    expect(looksLikeText(Buffer.from([0x68, 0x69, 0x00, 0x68]))).toBe(false);
    expect(looksLikeText(Buffer.from([0x68, 0x69, 0x07, 0x68]))).toBe(false);
    expect(looksLikeText(Buffer.from([0xc3, 0x28]))).toBe(false); // invalid UTF-8 sequence
  });

  test('an unknown signature is not silently accepted', () => {
    expect(sniffMimeType(Buffer.from([0x1f, 0x8b, 0x08, 0x00]))).toBeNull(); // gzip
    expect(contentMatchesDeclared('application/pdf', null)).toBe(false);
  });
});
