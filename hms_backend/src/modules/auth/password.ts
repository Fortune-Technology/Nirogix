import bcrypt from 'bcryptjs';

const ROUNDS = 12;

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, ROUNDS);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/**
 * A precomputed hash of a value nobody can supply, used to burn the same bcrypt
 * work when the account does not exist. Without it, "unknown email" returns much
 * faster than "wrong password", and that timing difference is an account
 * enumeration oracle (SECURITY-AUDIT.md M-5).
 */
const DUMMY_HASH = bcrypt.hashSync('nirogix::nonexistent-account::timing-equaliser', ROUNDS);

/** Spends the same time a real verification would, then always fails. */
export async function burnPasswordComparison(plain: string): Promise<void> {
  await bcrypt.compare(plain, DUMMY_HASH);
}
