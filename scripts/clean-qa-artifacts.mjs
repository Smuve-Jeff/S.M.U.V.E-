#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { statSync, unlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const artifactDirectory = 'artifacts';
const screenshotPattern = /\.(?:png|jpe?g|webp)$/i;
const dryRun = process.argv.includes('--dry-run');
const verbose = process.argv.includes('--verbose');

if (process.argv.includes('--help')) {
  console.log(`Usage: npm run artifacts:clean -- [--dry-run] [--verbose]

Deletes untracked screenshot files under ${artifactDirectory}/.
Tracked artifacts are always preserved.

Options:
  --dry-run  Preview the files without deleting them.
  --verbose  List every screenshot before it is deleted.`);
  process.exit(0);
}

const listed = spawnSync(
  'git',
  [
    'ls-files',
    '--others',
    '--exclude-standard',
    '-z',
    '--',
    artifactDirectory,
  ],
  { cwd: root, encoding: 'utf8' }
);

if (listed.error) {
  console.error(`Could not run git: ${listed.error.message}`);
  process.exit(1);
}
if (listed.status !== 0) {
  console.error(listed.stderr.trim() || 'git ls-files failed.');
  process.exit(listed.status ?? 1);
}

const files = listed.stdout
  .split('\0')
  .filter(Boolean)
  .filter((path) => screenshotPattern.test(path));

let bytes = 0;
for (const path of files) {
  try {
    bytes += statSync(`${root}${path}`).size;
  } catch {
    // A concurrent process may have already removed it.
  }
}

if (!files.length) {
  console.log(`No untracked QA screenshots found in ${artifactDirectory}/.`);
  process.exit(0);
}

const size = bytes >= 1024 * 1024
  ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  : bytes >= 1024
    ? `${(bytes / 1024).toFixed(1)} KB`
    : `${bytes} B`;
const noun = files.length === 1 ? 'screenshot' : 'screenshots';

if (verbose) {
  for (const path of files) {
    console.log(`${dryRun ? 'Would delete' : 'Deleting'}: ${path}`);
  }
}

if (dryRun) {
  console.log(
    `Would delete ${files.length} untracked QA ${noun} (${size}) from ${artifactDirectory}/.`
  );
  process.exit(0);
}

const failures = [];
for (const path of files) {
  try {
    unlinkSync(`${root}${path}`);
  } catch (error) {
    failures.push(`${path}: ${error.message}`);
  }
}

const deleted = files.length - failures.length;
console.log(
  `Deleted ${deleted} untracked QA ${deleted === 1 ? 'screenshot' : 'screenshots'} (${size}) from ${artifactDirectory}/.`
);
if (failures.length) {
  console.error(`Could not delete ${failures.length} file(s):`);
  for (const failure of failures.slice(0, 10)) console.error(`  ${failure}`);
  process.exit(1);
}
