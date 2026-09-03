import { describe, test, expect } from 'vitest';
import {
  PASSWORD_MIN_LENGTH,
  PasswordSchema,
  assertAcceptablePassword,
  generateTempPassword,
  passwordIssues,
} from '../passwordPolicy';

// One policy, every path (ADR-082). These assert the rules the audit's M-6 finding named:
// administrator-created passwords, generated temporary passwords and self-service changes
// are all held to the same bar, and the bar is not "length only".

describe('password policy', () => {
  test('accepts a genuinely strong password', () => {
    expect(passwordIssues('Gulmohar-Clinic-42')).toEqual([]);
  });

  test('rejects anything shorter than the minimum', () => {
    expect(passwordIssues('Ab3$efgh')).toContain(`Use at least ${PASSWORD_MIN_LENGTH} characters.`);
  });

  test('rejects length without variety', () => {
    const issues = passwordIssues('abcdefghijklmnop');
    expect(issues.some((i) => i.includes('at least three of'))).toBe(true);
  });

  test('rejects the passwords attackers try first, including leetspeak dressing', () => {
    expect(passwordIssues('password123456').length).toBeGreaterThan(0);
    expect(passwordIssues('P@ssw0rd!P@ss').length).toBeGreaterThan(0);
    expect(passwordIssues('Nirogix@123456').length).toBeGreaterThan(0);
    expect(passwordIssues('Hospital#2026x').length).toBeGreaterThan(0);
  });

  test('rejects a password built from what the attacker already knows', () => {
    const ctx = {
      email: 'meera.iyer@citycare.example',
      fullName: 'Meera Iyer',
      orgCode: 'CITYCARE',
    };
    expect(passwordIssues('Meera-Iyer-2026!', ctx).length).toBeGreaterThan(0);
    expect(passwordIssues('Citycare#Portal9', ctx).length).toBeGreaterThan(0);
    // The same password is fine for someone else — the rule is contextual, not a blocklist entry.
    expect(passwordIssues('Meera-Iyer-2026!', { email: 'raj@other.example' })).toEqual([]);
  });

  test('rejects a single repeated character however long it is', () => {
    expect(passwordIssues('aaaaaaaaaaaaaaaa').length).toBeGreaterThan(0);
  });

  test('assertAcceptablePassword throws the canonical 422 with the reason', () => {
    expect(() => assertAcceptablePassword('short')).toThrowError();
    try {
      assertAcceptablePassword('short');
    } catch (err) {
      expect(err).toMatchObject({ statusCode: 422, code: 'VALIDATION_ERROR' });
    }
    expect(() => assertAcceptablePassword('Gulmohar-Clinic-42')).not.toThrow();
  });

  test('the request-boundary schema enforces the same rules', () => {
    expect(PasswordSchema.safeParse('Gulmohar-Clinic-42').success).toBe(true);
    expect(PasswordSchema.safeParse('password1234').success).toBe(false);
    expect(PasswordSchema.safeParse('Ab3$efgh').success).toBe(false);
  });

  test('generated temporary passwords satisfy the policy they are checked against', () => {
    for (let i = 0; i < 50; i += 1) {
      const generated = generateTempPassword();
      expect(generated.length).toBeGreaterThanOrEqual(PASSWORD_MIN_LENGTH);
      expect(passwordIssues(generated)).toEqual([]);
    }
  });

  test('generated passwords carry no fixed prefix and do not repeat', () => {
    const generated = Array.from({ length: 20 }, () => generateTempPassword());
    expect(new Set(generated).size).toBe(generated.length);
    // The old generator started every password with the same four characters.
    expect(new Set(generated.map((p) => p.slice(0, 4))).size).toBeGreaterThan(1);
  });
});
