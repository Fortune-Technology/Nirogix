/**
 * Aadhaar-shaped value scrubbing for everything that leaves the process (ADR-084).
 *
 * The ABDM flows are the only place an Aadhaar number legitimately enters this application,
 * and it must never survive the request: not in a log line, not in an error-tracker event, not
 * in an audit `metadata` blob, not in an HTTP error echoed back to a browser.
 *
 * **Why this is a log-boundary scrub and not a request middleware.** Rejecting 12-digit values
 * at the edge would break the one flow that legitimately needs them — the enrolment call itself
 * carries an Aadhaar number in the body. The boundary that actually matters is the one where
 * data becomes durable or leaves the trust boundary, so the scrub lives there instead, and the
 * raw value stays confined to the encrypt-and-send path in `abdm.service`.
 *
 * The pattern deliberately over-matches: any 12 consecutive digits, with or without the usual
 * `1234 5678 9012` / `1234-5678-9012` grouping. A masked 12-digit invoice number is a cheap
 * price for never leaking a national identifier. Verhoeff validation is NOT used — a mistyped
 * Aadhaar is still an Aadhaar-shaped secret, and checksum-gating the scrub would let the
 * malformed ones through.
 */

// An ABHA number is `XX-XXXX-XXXX-XXXX` — 14 digits — and its last twelve are a 4-4-4 group that
// looks exactly like a formatted Aadhaar. Matching it FIRST, and returning it untouched, is what
// stops the scrubber from corrupting the very identifier this module exists to capture. Found in
// the browser on 25/08/2026: a shared ABHA arrived as `91-XXXXXXXX9999`.
const ABHA_NUMBER = String.raw`\d{2}-\d{4}-\d{4}-\d{4}`;
// 12 digits, optionally in 4-4-4 groups separated by a single space or hyphen. Bounded by a
// non-digit (or string edge) so a 16-digit card number is not silently half-masked.
const AADHAAR = String.raw`(?<!\d)\d{4}[ -]?\d{4}[ -]?\d{4}(?!\d)`;

/** Alternation order matters: the longer, legitimate ABHA shape wins before the Aadhaar shape. */
function scanner(): RegExp {
  return new RegExp(`(${ABHA_NUMBER})|(${AADHAAR})`, 'g');
}

/** Masks every Aadhaar-shaped run in a string, keeping the last four digits for support. */
export function redactAadhaarText(value: string): string {
  return value.replace(scanner(), (match, abha: string | undefined) =>
    abha ? abha : `XXXXXXXX${match.replace(/\D/g, '').slice(-4)}`,
  );
}

/** True when the string contains something Aadhaar-shaped that is not an ABHA number. */
export function containsAadhaarLike(value: string): boolean {
  return redactAadhaarText(value) !== value;
}

/**
 * The masked hint we are allowed to store and display: `XXXXXXXX1234`. Anything shorter than
 * four digits yields a fully masked hint rather than throwing — a bad input must not become an
 * exception that carries the bad input.
 */
export function maskAadhaar(aadhaar: string): string {
  const digits = aadhaar.replace(/\D/g, '');
  return `XXXXXXXX${digits.slice(-4).padStart(4, 'X')}`;
}

/** `XXXXXX7890` — the same idea for a mobile number. */
export function maskMobile(mobile: string): string {
  const digits = mobile.replace(/\D/g, '');
  return `XXXXXX${digits.slice(-4).padStart(4, 'X')}`;
}

const MAX_DEPTH = 8;

/**
 * Recursively scrubs Aadhaar-shaped values from any structure before it is logged, captured or
 * persisted as metadata. Cycles and pathological depth are bounded; exotic types are returned
 * untouched (they cannot carry a string the scrubber would have caught anyway).
 */
export function scrubAadhaar<T>(input: T, depth = 0, seen = new WeakSet<object>()): T {
  if (typeof input === 'string') return redactAadhaarText(input) as unknown as T;
  if (input === null || typeof input !== 'object' || depth >= MAX_DEPTH) return input;

  const obj = input as unknown as object;
  if (seen.has(obj)) return input;
  seen.add(obj);

  if (Array.isArray(input)) {
    return input.map((v) => scrubAadhaar(v, depth + 1, seen)) as unknown as T;
  }
  // Errors are objects, but the message and stack are what carry the leak.
  if (input instanceof Error) {
    input.message = redactAadhaarText(input.message);
    if (input.stack) input.stack = redactAadhaarText(input.stack);
    return input;
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    out[k] = scrubAadhaar(v, depth + 1, seen);
  }
  return out as unknown as T;
}
