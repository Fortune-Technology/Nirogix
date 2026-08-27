/**
 * The platform's ONE password policy (ADR-082, SECURITY-AUDIT.md M-6).
 *
 * Before this, "the policy" was a `z.string().min(10)` on the two self-service
 * endpoints, while an administrator could create an account with any 8-character
 * string and the generated temporary passwords were `Hms-` + six random bytes — a
 * fixed, guessable prefix on the one credential that is emailed, read aloud and
 * written on paper. A policy that only applies where a user chooses their own
 * password is not a policy; every path that sets a password now comes through here.
 *
 * What it enforces:
 * - length (12–200; the upper bound guards bcrypt's cost, not the user),
 * - at least three of the four character classes, so length is not the only defence,
 * - a blocklist of the passwords attackers actually try first, matched after
 *   normalising the leetspeak substitutions that defeat naive list checks, and
 * - no password built from what the attacker already knows: the person's own email,
 *   name, organisation code, or the product's name.
 *
 * What it deliberately does NOT do: call an external breach API. A live HIBP lookup
 * (k-anonymity range query) would strengthen the check, but it puts a third-party
 * network call on the sign-up/reset path of a PHI system. The local list covers the
 * head of the distribution; the API call is recorded in `BACKLOG.md` as a decision
 * for the compliance owner rather than taken unilaterally here.
 */

import { randomInt } from 'node:crypto';
import { z } from '../../openapi/registry';
import { Errors } from '../../http/error';

export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 200;

/**
 * The head of every credential-stuffing list, plus the patterns this product would
 * attract specifically (its own name, "hospital", "admin"). Stored normalised: the
 * check folds case and the common `a→@ e→3 i→1 o→0 s→$ t→7` substitutions first, so
 * `P@ssw0rd!` and `passw0rd` both land on `password`.
 */
const BLOCKED = new Set([
  'password',
  'passwordpassword',
  'password1',
  'password123',
  'passw0rd',
  'letmein',
  'welcome',
  'welcome1',
  'welcome123',
  'qwerty',
  'qwertyuiop',
  'qwerty123',
  'asdfghjkl',
  'zxcvbnm',
  '123456',
  '1234567',
  '12345678',
  '123456789',
  '1234567890',
  '111111',
  '000000',
  'abc123',
  'abcd1234',
  'iloveyou',
  'monkey',
  'dragon',
  'sunshine',
  'princess',
  'football',
  'baseball',
  'trustno1',
  'admin',
  'admin123',
  'administrator',
  'root',
  'toor',
  'changeme',
  'changeme123',
  'secret',
  'default',
  'temp123',
  'india123',
  'bharat123',
  'hospital',
  'hospital123',
  'hospitals',
  'doctor',
  'doctor123',
  'nirogix',
  'nirogix123',
  'hms',
  'hms123',
  'takoriya',
]);

/** Words that must not form the bulk of a password, supplied per call. */
export type PasswordContext = {
  email?: string | null;
  fullName?: string | null;
  orgCode?: string | null;
};

function normalise(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[@]/g, 'a')
    .replace(/[3]/g, 'e')
    .replace(/[1!|]/g, 'i')
    .replace(/[0]/g, 'o')
    .replace(/[$5]/g, 's')
    .replace(/[7]/g, 't')
    .replace(/[^a-z0-9]/g, '');
}

function characterClasses(password: string): number {
  let classes = 0;
  if (/[a-z]/.test(password)) classes += 1;
  if (/[A-Z]/.test(password)) classes += 1;
  if (/[0-9]/.test(password)) classes += 1;
  if (/[^A-Za-z0-9]/.test(password)) classes += 1;
  return classes;
}

/** Personal tokens worth blocking, from whatever context the caller has. */
function contextTokens(ctx: PasswordContext): string[] {
  const raw: string[] = [];
  if (ctx.email) raw.push(ctx.email.split('@')[0] ?? '', ctx.email.split('@')[1]?.split('.')[0] ?? '');
  if (ctx.fullName) raw.push(...ctx.fullName.split(/\s+/));
  if (ctx.orgCode) raw.push(ctx.orgCode);
  return raw
    .map((t) => normalise(t))
    // Two- and three-letter fragments match far too much to be useful signal.
    .filter((t) => t.length >= 4);
}

/**
 * Every reason this password is unacceptable, in the order worth telling the user.
 * Empty array = acceptable. Pure, so the policy is testable without a request.
 */
export function passwordIssues(password: string, ctx: PasswordContext = {}): string[] {
  const issues: string[] = [];
  if (password.length < PASSWORD_MIN_LENGTH) {
    issues.push(`Use at least ${PASSWORD_MIN_LENGTH} characters.`);
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    issues.push(`Use at most ${PASSWORD_MAX_LENGTH} characters.`);
  }
  if (/\s{2,}|^\s|\s$/.test(password)) {
    issues.push('Remove leading, trailing or repeated spaces.');
  }
  if (characterClasses(password) < 3) {
    issues.push(
      'Mix at least three of: lowercase letters, uppercase letters, numbers, and symbols.',
    );
  }

  const flat = normalise(password);
  if (BLOCKED.has(flat)) {
    issues.push('This is one of the most commonly guessed passwords. Choose something else.');
  } else if ([...BLOCKED].some((b) => b.length >= 6 && flat.includes(b))) {
    issues.push('This contains a commonly guessed password. Choose something else.');
  }

  // A single character repeated, or a straight run, is long without being strong.
  if (/^(.)\1+$/.test(password)) {
    issues.push('Do not repeat a single character.');
  }

  for (const token of contextTokens(ctx)) {
    if (flat.includes(token)) {
      issues.push('Do not use your name, email address or organization code in your password.');
      break;
    }
  }

  return issues;
}

/**
 * Throws the canonical 422 when the password fails the policy. Used by every service
 * that sets a password with the surrounding context in hand (the Zod schema below
 * enforces the context-free half at the HTTP boundary).
 */
export function assertAcceptablePassword(password: string, ctx: PasswordContext = {}): void {
  const issues = passwordIssues(password, ctx);
  if (issues.length > 0) {
    throw Errors.validation({ password: issues }, issues[0]!);
  }
}

/**
 * The request-boundary schema: the context-free half of the policy, so an invalid
 * password is refused by validation (and documented in OpenAPI) before any handler
 * runs. Services still call `assertAcceptablePassword` with the user's own details.
 */
export const PasswordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH)
  .max(PASSWORD_MAX_LENGTH)
  .refine((v) => passwordIssues(v).length === 0, {
    message:
      `Use at least ${PASSWORD_MIN_LENGTH} characters, mixing at least three of ` +
      'lowercase, uppercase, numbers and symbols, and avoid commonly guessed passwords.',
  })
  .openapi({
    description:
      `At least ${PASSWORD_MIN_LENGTH} characters, at least three character classes, ` +
      'not a commonly guessed password, and not built from the account holder\'s own details.',
    example: 'Gulmohar-Clinic-42',
  });

// Ambiguous glyphs are left out on purpose: a temporary password gets read aloud over
// a phone and copied off a screen, and `l`/`1`/`I` and `O`/`0` are where that fails.
const LOWER = 'abcdefghijkmnpqrstuvwxyz';
const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const DIGITS = '23456789';
const SYMBOLS = '!@#$%^&*-_=+?';

function pick(alphabet: string): string {
  return alphabet[randomInt(alphabet.length)]!;
}

/**
 * A temporary password an operator hands over. CSPRNG throughout, one character from
 * each class guaranteed, then shuffled — so it satisfies the same policy it is checked
 * against, and carries no fixed prefix that shortens the search for an attacker who has
 * seen one of them before.
 */
export function generateTempPassword(length = 16): string {
  const size = Math.max(PASSWORD_MIN_LENGTH, length);
  const all = LOWER + UPPER + DIGITS + SYMBOLS;
  const chars = [pick(LOWER), pick(UPPER), pick(DIGITS), pick(SYMBOLS)];
  while (chars.length < size) chars.push(pick(all));
  // Fisher-Yates with a CSPRNG: without the shuffle the first four positions would
  // always be lower/upper/digit/symbol, which is structure an attacker can exploit.
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j]!, chars[i]!];
  }
  const password = chars.join('');
  // Vanishingly unlikely, but a generated password must never fail the policy it feeds.
  return passwordIssues(password).length === 0 ? password : generateTempPassword(size);
}
