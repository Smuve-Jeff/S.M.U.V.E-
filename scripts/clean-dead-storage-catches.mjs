/**
 * Removes try/catch blocks that only wrapped guarded storage helpers.
 *
 * After the storage sweep, `saveJson` / `saveString` / `deleteSaved` report a
 * refused write instead of throwing, so a catch whose body held nothing but
 * those calls can never run. The codemod only unwraps blocks whose try body
 * makes no other call (no getters, no builders, no DOM), and whose catch body
 * has no statements, so a block that still guards real work is left alone.
 *
 * Usage: node scripts/clean-dead-storage-catches.mjs [--dry]
 */
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const HELPERS = new Set([
  'saveJson',
  'saveString',
  'deleteSaved',
  'writeJsonStore',
  'removeStore',
]);
const dry = process.argv.includes('--dry');
const files = [];

(function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p);
    else if (p.endsWith('.ts') && !p.endsWith('.spec.ts')) files.push(p);
  }
})('src/app');

let changed = 0;

for (const file of files) {
  const text = fs.readFileSync(file, 'utf8');
  if (!/\b(saveJson|saveString|deleteSaved)\b/.test(text)) continue;
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const edits = [];

  const visit = (node) => {
    if (ts.isTryStatement(node) && node.catchClause) {
      const { catchClause } = node;
      let hasHelper = false;
      let otherCall = false;

      const scan = (n) => {
        if (ts.isCallExpression(n)) {
          if (ts.isIdentifier(n.expression) && HELPERS.has(n.expression.text)) {
            hasHelper = true;
          } else {
            otherCall = true;
          }
        }
        if (
          ts.isAwaitExpression(n) ||
          ts.isThrowStatement(n) ||
          ts.isNewExpression(n) ||
          ts.isTaggedTemplateExpression(n)
        ) {
          otherCall = true;
        }
        ts.forEachChild(n, scan);
      };
      ts.forEachChild(node.tryBlock, scan);

      const catchEmpty = catchClause.block.statements.length === 0;
      if (hasHelper && !otherCall && catchEmpty) {
        edits.push({ start: node.getStart(sf), end: node.getEnd(), block: node.tryBlock });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  if (!edits.length) continue;

  let next = text;
  for (const edit of edits.reverse()) {
    const startLine = next.slice(0, edit.start).split('\n').length - 1;
    const indent = next.split('\n')[startLine].match(/^\s*/)[0];
    const inner = edit.block.statements
      .map((s) => s.getText(sf))
      .join('\n\n');
    const dedented = inner
      .split('\n')
      .map((line) => (line.startsWith(indent + '  ') ? line.slice(indent.length + 2) : line))
      .join('\n');
    next = next.slice(0, edit.start) + dedented + next.slice(edit.end);
  }
  if (!dry) fs.writeFileSync(file, next);
  changed += edits.length;
  console.log(`${file}: ${edits.length} block(s)`);
}

console.log(`${dry ? 'would remove' : 'removed'} ${changed} try/catch block(s)`);
