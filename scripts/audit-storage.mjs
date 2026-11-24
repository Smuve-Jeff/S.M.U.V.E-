#!/usr/bin/env node
/**
 * Storage guard audit.
 *
 * A failed read must never look like an empty store: every localStorage /
 * sessionStorage access in the app has to sit inside a try/catch that the
 * caller turns into a "store unreadable" state. This walks the TypeScript AST
 * and fails when it finds an access outside a try block.
 *
 * Exceptions live in scripts/storage-audit-allowlist.json with a reason, so a
 * genuinely safe access is a reviewed one-liner instead of a silent hole.
 */
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import ts from 'typescript';

const ROOT = process.cwd();
const SRC = path.join(ROOT, 'src');
const ALLOWLIST = path.join(ROOT, 'scripts', 'storage-audit-allowlist.json');

const allowlist = JSON.parse(readFileSync(ALLOWLIST, 'utf8'));
const STORAGE_NAMES = new Set(['localStorage', 'sessionStorage']);

function collect(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collect(full, out);
      continue;
    }
    if (
      entry.isFile() &&
      full.endsWith('.ts') &&
      !full.endsWith('.d.ts') &&
      !full.endsWith('.spec.ts')
    ) {
      out.push(full);
    }
  }
  return out;
}

/** True when the access sits inside the `try` block of a try/catch. */
function insideTry(node) {
  for (let parent = node.parent; parent; parent = parent.parent) {
    if (
      ts.isTryStatement(parent) &&
      parent.tryBlock.pos <= node.pos &&
      node.end <= parent.tryBlock.end
    ) {
      return true;
    }
  }
  return false;
}

/** `typeof localStorage === 'undefined'` is a capability check, not an access. */
function isTypeofOperand(node) {
  return Boolean(node.parent && ts.isTypeOfExpression(node.parent));
}

/**
 * Names, not uses: `private localStorage = inject(...)` (an IndexedDB wrapper)
 * and capability probes that pass the Storage object into a helper which does
 * its own try/catch.
 */
function isNameOrProbe(node) {
  const parent = node.parent;
  if (!parent) return false;
  if (ts.isPropertyAccessExpression(parent) && parent.name === node) return true;
  if (
    (ts.isPropertyDeclaration(parent) ||
      ts.isParameter(parent) ||
      ts.isPropertyAssignment(parent)) &&
    parent.name === node
  ) {
    return true;
  }
  return ts.isCallExpression(parent) && parent.arguments.includes(node);
}

const violations = [];
let scanned = 0;

for (const file of collect(SRC)) {
  const text = readFileSync(file, 'utf8');
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const lines = text.split(/\r?\n/);

  const visit = (node) => {
    if (ts.isIdentifier(node) && STORAGE_NAMES.has(node.text)) {
      scanned += 1;
      if (
        !isTypeofOperand(node) &&
        !isNameOrProbe(node) &&
        !insideTry(node)
      ) {
        const { line } = source.getLineAndCharacterOfPosition(
          node.getStart(source)
        );
        violations.push({
          file: path.relative(ROOT, file),
          line: line + 1,
          code: (lines[line] ?? '').trim(),
        });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
}

const unexpected = violations.filter((v) => !allowlist[v.file]);
const allowedHits = violations.filter((v) => allowlist[v.file]);

for (const hit of allowedHits) {
  console.log(`allowlisted: ${hit.file}:${hit.line} (${allowlist[hit.file]})`);
}

if (unexpected.length > 0) {
  console.error(
    `\n${unexpected.length} unguarded storage access(es) found. Wrap them in try/catch and treat a failed read as unreadable, not empty:`
  );
  for (const hit of unexpected) {
    console.error(`  ${hit.file}:${hit.line}  ${hit.code}`);
  }
  console.error(
    `\nIf an access is provably safe (e.g. reading a key this module owns and already validated), add its file to ${path.relative(ROOT, ALLOWLIST)} with a reason.\n`
  );
  process.exit(1);
}

console.log(
  `storage audit: ${scanned} storage reference(s) checked, 0 unguarded (${allowedHits.length} allowlisted file hit(s)).`
);
