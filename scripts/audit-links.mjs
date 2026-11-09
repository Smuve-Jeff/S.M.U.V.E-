#!/usr/bin/env node
/**
 * Offline link integrity audit.
 *
 * The app has three kinds of links that can rot independently:
 *   1. the route table (`src/app/app.routes.ts`),
 *   2. the workspace registry that drives the sidebar, palette and mobile nav,
 *   3. literal `routerLink`, `navigate` and internal `href` targets.
 *
 * This checks all three against the route table, verifies relative Markdown
 * links in the docs actually resolve, and flags `target="_blank"` anchors that
 * omit `noopener`. It never touches the network, so it is safe in CI and in a
 * predeploy pass.
 *
 * Usage: npm run audit:links [-- --verbose]
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

const root = process.cwd();
const verbose = process.argv.includes('--verbose');
const errors = [];
const checked = { routes: 0, registry: 0, templates: 0, markdown: 0, blank: 0 };

const read = (path) => readFileSync(resolve(root, path), 'utf8');

const walk = (directory) => {
  const absolute = resolve(root, directory);
  if (!existsSync(absolute)) return [];
  const files = [];
  for (const entry of readdirSync(absolute)) {
    if (entry === 'node_modules' || entry === '.git' || entry === 'dist' || entry === 'Build') {
      continue;
    }
    const path = join(absolute, entry);
    if (statSync(path).isDirectory()) files.push(...walk(relative(root, path)));
    else files.push(relative(root, path));
  }
  return files;
};

// --- Route table -----------------------------------------------------------

const routesSource = read('src/app/app.routes.ts');
const routePaths = [...routesSource.matchAll(/path:\s*['"]([^'"]*)['"]/g)].map(
  (match) => match[1]
);
if (routePaths.length === 0) {
  errors.push('Could not read any paths from src/app/app.routes.ts');
}

const normalizeTarget = (value) =>
  String(value ?? '')
    .split('?')[0]
    .split('#')[0]
    .replace(/^\/+|\/+$/g, '');

/**
 * A route target matches when every segment lines up; `:param` and `*`
 * segments match anything. The catch-all `**` never counts as a destination:
 * landing there means the link was wrong.
 */
const routeMatches = (target) => {
  const wanted = normalizeTarget(target);
  if (!wanted) return routePaths.includes('');
  const wantedSegments = wanted.split('/');
  return routePaths.some((path) => {
    const candidate = normalizeTarget(path);
    if (!candidate || candidate === '**') return false;
    const segments = candidate.split('/');
    if (segments.length !== wantedSegments.length) return false;
    return segments.every(
      (segment, index) =>
        segment.startsWith(':') ||
        segment === '*' ||
        segment === wantedSegments[index]
    );
  });
};

const checkTarget = (target, source, kind) => {
  checked[kind] += 1;
  if (!routeMatches(target)) {
    errors.push(`${source}: "${target}" does not match any route`);
    return;
  }
  if (verbose) console.log(`ok  ${source}: ${target}`);
};

const appFiles = walk('src/app');

// Workspace registry: every entry must land on a real route.
const registrySource = read('src/app/services/workspace-registry.ts');
for (const match of registrySource.matchAll(/routePath:\s*['"]([^'"]+)['"]/g)) {
  checkTarget(match[1], 'workspace-registry.ts', 'registry');
}

// Literal router links in templates.
for (const file of appFiles.filter((path) => path.endsWith('.html'))) {
  const source = read(file);
  for (const match of source.matchAll(/routerLink="([^"]+)"/g)) {
    if (/^(?:https?:|mailto:|tel:)/.test(match[1])) continue;
    checkTarget(match[1], file, 'templates');
  }
  // Internal anchor navigations (asset links are not routes).
  for (const match of source.matchAll(/\bhref="(\/[^"]*)"/g)) {
    if (/\.[a-z0-9]{2,5}(?:[?#]|$)/i.test(match[1])) continue;
    checkTarget(match[1], file, 'templates');
  }
  // New tabs must sever the opener reference.
  for (const match of source.matchAll(/<a\b[^>]*target="_blank"[^>]*>/gs)) {
    checked.blank += 1;
    if (!/\brel="[^"]*noopener/i.test(match[0])) {
      const id = match[0].replace(/\s+/g, ' ').slice(0, 120);
      errors.push(`${file}: target="_blank" without rel="noopener": ${id}`);
    }
  }
}

/** Split an Angular navigation array on commas outside quoted strings. */
const splitArrayParts = (source) => {
  const parts = [];
  let current = '';
  let quote = null;
  for (const character of source) {
    if (quote) {
      current += character;
      if (character === quote) quote = null;
      continue;
    }
    if (character === "'" || character === '"') {
      quote = character;
      current += character;
      continue;
    }
    if (character === ',') {
      parts.push(current.trim());
      current = '';
      continue;
    }
    current += character;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
};

// Literal navigations in TypeScript.
for (const file of appFiles.filter((path) => path.endsWith('.ts'))) {
  if (file.endsWith('.spec.ts')) continue;
  const source = read(file);

  for (const match of source.matchAll(/navigateByUrl\(\s*['"]([^'"]+)['"]/g)) {
    checkTarget(match[1], file, 'templates');
  }

  for (const match of source.matchAll(/navigate\(\s*\[([\s\S]*?)\]\s*(?:,|\))/g)) {
    const parts = splitArrayParts(match[1]).map((part) => {
      const literal = /^['"]([^'"]*)['"]$/.exec(part);
      return literal ? literal[1] : ':param';
    });
    // A path whose first segment is computed cannot be checked statically.
    if (parts.length === 0 || parts[0] === ':param') continue;
    checkTarget(parts.join('/'), file, 'templates');
  }
}

// --- Markdown --------------------------------------------------------------

const markdownFiles = [
  'README.md',
  'AGENTS.md',
  'LEARNINGS.md',
  'CLOUDFLARE_TUNNEL.md',
  ...walk('docs').filter((path) => path.endsWith('.md')),
].filter((path, index, all) => existsSync(resolve(root, path)) && all.indexOf(path) === index);

for (const file of markdownFiles) {
  const source = read(file);
  for (const match of source.matchAll(/!?\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
    const target = match[1];
    if (/^(?:https?:|mailto:|tel:|#)/.test(target)) continue;
    const pathOnly = decodeURIComponent(target.split('#')[0].split('?')[0]);
    if (!pathOnly) continue;
    checked.markdown += 1;
    const resolved = resolve(root, dirname(file), pathOnly);
    if (!existsSync(resolved)) {
      errors.push(`${file}: missing relative link "${target}"`);
    } else if (verbose) {
      console.log(`ok  ${file}: ${target}`);
    }
  }
}

// --- Report ----------------------------------------------------------------

console.log(
  `[links] ${routePaths.length} routes · ${checked.registry} registry paths · ` +
    `${checked.templates} code links · ${checked.markdown} doc links · ` +
    `${checked.blank} new-tab links`
);

if (errors.length) {
  console.error(`\n[links] ${errors.length} broken or unsafe link(s):`);
  for (const error of errors) console.error(`  ✗ ${error}`);
  process.exit(1);
}

console.log('[links] All checked links resolve, and every new-tab link is safe.');
