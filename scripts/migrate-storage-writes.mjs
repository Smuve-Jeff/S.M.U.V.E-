#!/usr/bin/env node
/**
 * Codemod: route raw localStorage/sessionStorage writes through the guarded
 * helpers so a failed save is reported instead of swallowed.
 *
 *   localStorage.setItem(KEY, JSON.stringify(value))  -> saveJson(KEY, value)
 *   localStorage.setItem(KEY, value)                  -> saveString(KEY, value)
 *   localStorage.removeItem(KEY)                      -> deleteSaved(KEY)
 *
 * Only direct `localStorage` / `sessionStorage` / `window.*` receivers are
 * rewritten; a Storage passed in as a parameter (the auth capability probe)
 * is left alone. Idempotent: already-guarded calls no longer match.
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import ts from 'typescript';

const ROOT = process.cwd();
const SRC = path.join(ROOT, 'src');
const TARGET = path.join(SRC, 'app', 'services', 'guarded-storage');
const SKIP = new Set([
  path.join(SRC, 'app', 'services', 'guarded-storage.ts'),
  path.join(SRC, 'app', 'services', 'local-backup.service.ts'),
  path.join(SRC, 'app', 'services', 'auth.service.ts'),
]);

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

const RECEIVERS = new Set([
  'localStorage',
  'sessionStorage',
  'window.localStorage',
  'window.sessionStorage',
]);

function receiverText(expression) {
  return expression.getText();
}

let changedFiles = 0;
let changedCalls = 0;

for (const file of collect(SRC)) {
  if (SKIP.has(file)) continue;
  const text = readFileSync(file, 'utf8');
  if (!/setItem|removeItem/.test(text)) continue;

  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const edits = [];

  const visit = (node) => {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const method = node.expression.name.text;
      const receiver = receiverText(node.expression.expression);
      if (RECEIVERS.has(receiver) && (method === 'setItem' || method === 'removeItem')) {
        const backend = receiver.includes('sessionStorage')
          ? 'sessionStorage'
          : 'localStorage';
        const args = node.arguments;
        if (method === 'removeItem' && args.length >= 1) {
          edits.push({
            start: node.getStart(source),
            end: node.getEnd(),
            text: `deleteSaved(${args[0].getText()}, '${backend}')`,
          });
        } else if (method === 'setItem' && args.length >= 2) {
          const value = args[1];
          const isJson =
            ts.isCallExpression(value) &&
            ts.isPropertyAccessExpression(value.expression) &&
            value.expression.name.text === 'stringify' &&
            receiverText(value.expression.expression) === 'JSON' &&
            value.arguments.length === 1;
          const payload = isJson
            ? value.arguments[0].getText()
            : value.getText();
          const helper = isJson ? 'saveJson' : 'saveString';
          edits.push({
            start: node.getStart(source),
            end: node.getEnd(),
            text: `${helper}(${args[0].getText()}, ${payload}, '${backend}')`,
          });
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);

  if (edits.length === 0) continue;

  edits.sort((a, b) => b.start - a.start);
  let next = text;
  for (const edit of edits) {
    next = next.slice(0, edit.start) + edit.text + next.slice(edit.end);
  }

  // Import only the helpers this file ended up using.
  const needed = ['saveJson', 'saveString', 'deleteSaved'].filter((name) =>
    new RegExp(`\\b${name}\\(`).test(next)
  );
  const relative = path
    .relative(path.dirname(file), TARGET)
    .split(path.sep)
    .join('/');
  const specifier = relative.startsWith('.') ? relative : `./${relative}`;
  const already = new RegExp(
    `import\\s*\\{[^}]*\\b${needed[0]}\\b[^}]*\\}\\s*from\\s*['"]${specifier.replace(
      /[.*+?^${}()|[\]\\]/g,
      '\\$&'
    )}['"]`
  ).test(next);

  if (!already && needed.length > 0) {
    const reparsed = ts.createSourceFile(file, next, ts.ScriptTarget.Latest, true);
    const imports = reparsed.statements.filter((statement) =>
      ts.isImportDeclaration(statement)
    );
    const insertAt = imports.length
      ? imports[imports.length - 1].getEnd()
      : 0;
    const importLine = `\nimport { ${needed.join(', ')} } from '${specifier}';`;
    next = next.slice(0, insertAt) + importLine + next.slice(insertAt);
  }

  writeFileSync(file, next);
  changedFiles += 1;
  changedCalls += edits.length;
  console.log(`${path.relative(ROOT, file)}: ${edits.length}`);
}

console.log(
  `\nmigrated ${changedCalls} storage call(s) across ${changedFiles} file(s).`
);
