#!/usr/bin/env node
/**
 * Points git at the repository's checked-in hooks (`.githooks/`), so a fresh clone gets them from
 * `npm install` rather than from someone remembering. Run by the root `prepare` script.
 *
 * A hook that lives only in `.git/hooks` protects one machine; one that lives in the repository
 * protects everyone, but only once git is told where to look — which is what this does.
 *
 * **It never fails the install.** `npm ci` also runs `prepare`, and an environment without git, or
 * without a `.git` directory (an exported tarball, some CI images), would otherwise turn a missing
 * convenience into a broken install. A missing hook is a smaller problem than that, so the failure
 * is reported and swallowed.
 */

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

if (!existsSync(join(root, '.git'))) {
  console.log('hooks: not a git checkout — skipping');
  process.exit(0);
}

const result = spawnSync('git', ['config', 'core.hooksPath', '.githooks'], { cwd: root, stdio: 'inherit' });

if (result.error || result.status !== 0) {
  console.log('hooks: could not set core.hooksPath — run `git config core.hooksPath .githooks` by hand');
  process.exit(0);
}

console.log('hooks: git will run .githooks/pre-commit');
