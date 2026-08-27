/**
 * Content-based file-type validation (ADR-082, SECURITY-AUDIT.md M-4).
 *
 * `Content-Type` on a multipart part is written by the client, so it says whatever the
 * uploader wants it to say. Everything downstream of an upload — the browser that later
 * renders a lab report, the viewer a doctor opens a scan in — decides what to do with the
 * bytes, not with the label. Checking only the label means a file can be stored under a
 * type it is not, which is how an "image" ends up being served as something executable.
 *
 * So the bytes are inspected: the leading signature must match a type on the allow-list,
 * AND it must agree with what the client claimed. Text is the one type with no signature —
 * it is accepted only if the payload decodes as UTF-8 with no control bytes, which is also
 * what stops a binary being smuggled in as `text/plain`.
 *
 * This is not virus scanning and does not pretend to be: it is the type check, done against
 * the file instead of against a header. PHI-bearing files continue to be served only through
 * short-lived signed URLs.
 */

/** Types the platform accepts, each with the signature(s) that prove it. */
type Signature = { offset: number; bytes: number[]; extraCheck?: (buf: Buffer) => boolean };

const SIGNATURES: Record<string, Signature[]> = {
  'application/pdf': [{ offset: 0, bytes: [0x25, 0x50, 0x44, 0x46] }], // %PDF
  'image/png': [{ offset: 0, bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] }],
  'image/jpeg': [{ offset: 0, bytes: [0xff, 0xd8, 0xff] }],
  'image/gif': [
    { offset: 0, bytes: [0x47, 0x49, 0x46, 0x38, 0x37, 0x61] }, // GIF87a
    { offset: 0, bytes: [0x47, 0x49, 0x46, 0x38, 0x39, 0x61] }, // GIF89a
  ],
  'image/webp': [
    {
      offset: 0,
      bytes: [0x52, 0x49, 0x46, 0x46], // RIFF ... WEBP
      extraCheck: (buf) => buf.subarray(8, 12).toString('ascii') === 'WEBP',
    },
  ],
  'image/tiff': [
    { offset: 0, bytes: [0x49, 0x49, 0x2a, 0x00] }, // little-endian
    { offset: 0, bytes: [0x4d, 0x4d, 0x00, 0x2a] }, // big-endian
  ],
  // .docx is a ZIP container; .doc is the OLE2 compound-file format.
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': [
    { offset: 0, bytes: [0x50, 0x4b, 0x03, 0x04] },
    { offset: 0, bytes: [0x50, 0x4b, 0x05, 0x06] }, // empty archive
    { offset: 0, bytes: [0x50, 0x4b, 0x07, 0x08] }, // spanned archive
  ],
  'application/msword': [
    { offset: 0, bytes: [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1] },
  ],
};

function matches(buf: Buffer, sig: Signature): boolean {
  if (buf.length < sig.offset + sig.bytes.length) return false;
  for (let i = 0; i < sig.bytes.length; i += 1) {
    if (buf[sig.offset + i] !== sig.bytes[i]) return false;
  }
  return sig.extraCheck ? sig.extraCheck(buf) : true;
}

/**
 * Plain text has no signature, so it is defined by exclusion: valid UTF-8, no NUL, and no
 * control characters beyond tab / newline / carriage return / form feed. A renamed binary
 * fails all three.
 */
export function looksLikeText(buf: Buffer): boolean {
  if (buf.length === 0) return true;
  const sample = buf.subarray(0, 8192);
  if (sample.includes(0x00)) return false;
  const decoded = new TextDecoder('utf-8', { fatal: true });
  try {
    const text = decoded.decode(sample);
    // Control characters other than tab (09), LF (0A), FF (0C) and CR (0D).
    // eslint-disable-next-line no-control-regex
    return !/[\u0001-\u0008\u000B\u000E-\u001F]/.test(text);
  } catch {
    return false; // not valid UTF-8
  }
}

/** The type the BYTES say this is, or null when nothing on the allow-list matches. */
export function sniffMimeType(buf: Buffer): string | null {
  for (const [mime, signatures] of Object.entries(SIGNATURES)) {
    if (signatures.some((sig) => matches(buf, sig))) return mime;
  }
  return looksLikeText(buf) ? 'text/plain' : null;
}

/**
 * Does the content agree with what the client declared? Exact match, with the two
 * unavoidable ambiguities allowed for:
 * - `.docx` and every other Office Open XML file is a ZIP, so the sniffed type for a
 *   declared `.docx` is the ZIP signature — accepted, since the declared type is on the
 *   allow-list and the container is genuinely what it claims to be.
 * - A text file whose contents happen to be a valid UTF-8 document is `text/plain`.
 */
export function contentMatchesDeclared(declared: string, sniffed: string | null): boolean {
  if (!sniffed) return false;
  if (declared === sniffed) return true;
  // A plain-text payload declared as a document type is a mismatch worth refusing; the
  // reverse (a binary declared as text) is caught because `looksLikeText` fails on it.
  return false;
}
