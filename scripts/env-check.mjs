#!/usr/bin/env node
/**
 * Keeps every app's `.env.example` and `.env` in lockstep (CLAUDE.md → Environment files).
 *
 * The rule is that a key added to, renamed in, or removed from an `.env.example` is applied to
 * that app's local `.env` **in the same change**. It had been written down for months and drifted
 * twice anyway, which is the argument for this file: a rule nobody can forget beats a rule
 * everybody agrees with.
 *
 * Checks the same keys, in the same order — nothing about values, which are local by definition
 * and must never be compared or printed (a `.env` holds real credentials).
 *
 * A missing `.env` is **not** a failure: a fresh clone has none yet, and a contributor who has not
 * configured an app should not be blocked from committing an unrelated change. It is reported so
 * the gap is visible.
 *
 *   node scripts/env-check.mjs        # from the repo root, or npm run env:check
 *
 * Exit code 0 = every app in lockstep (or not configured yet), 1 = drift.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The six apps (ADR-051). Packages carry no environment of their own. */
const APPS = ['hms_backend', 'marketing', 'hms_frontend', 'patient', 'admin', 'aiportal'];

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Declared keys, in file order. Comments, blanks and anything not `KEY=` are ignored. */
function keysOf(path) {
  return readFileSync(path, 'utf8')
    .split(/\r?\n/)
    .map((line) => /^([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(line))
    .filter(Boolean)
    .map((m) => m[1]);
}

const problems = [];
const skipped = [];
let checked = 0;

for (const app of APPS) {
  const examplePath = join(ROOT, app, '.env.example');
  const localPath = join(ROOT, app, '.env');

  if (!existsSync(examplePath)) {
    problems.push({ app, lines: ['no `.env.example` — every app must commit one'] });
    continue;
  }
  if (!existsSync(localPath)) {
    skipped.push(app);
    continue;
  }

  const expected = keysOf(examplePath);
  const actual = keysOf(localPath);
  const lines = [];

  for (const key of expected) if (!actual.includes(key)) lines.push(`missing from .env:  ${key}`);
  for (const key of actual) if (!expected.includes(key)) lines.push(`not in .env.example: ${key}`);

  // Order only matters once both files hold the same set — otherwise every missing key would
  // also be reported as an ordering fault, which buries the real one.
  if (lines.length === 0 && expected.join('\n') !== actual.join('\n')) {
    const at = expected.findIndex((key, i) => key !== actual[i]);
    lines.push(`out of order at position ${at + 1}: .env.example has ${expected[at]}, .env has ${actual[at]}`);
  }

  checked++;
  if (lines.length > 0) problems.push({ app, lines });
}

const pad = (s) => s.padEnd(14, ' ');

if (problems.length === 0) {
  console.log(`env: ${checked} app${checked === 1 ? '' : 's'} in lockstep`);
  if (skipped.length > 0) {
    console.log(`env: not configured locally (no .env, skipped): ${skipped.join(', ')}`);
  }
  process.exit(0);
}

console.error('\nenv: .env.example and .env have drifted.\n');
for (const { app, lines } of problems) {
  for (const line of lines) console.error(`  ${pad(app)} ${line}`);
}
console.error(
  '\nEvery app keeps the same keys in the same order in both files (CLAUDE.md → Environment files).' +
    '\nAdd the key to the local .env with its working value, or an empty value when unconfigured —' +
    '\nnever copy a real secret into .env.example.\n',
);
if (skipped.length > 0) console.error(`Not configured locally, skipped: ${skipped.join(', ')}\n`);
process.exit(1);
