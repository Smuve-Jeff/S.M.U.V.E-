#!/usr/bin/env node
/**
 * Localise the factory sample bank.
 *
 * The Studio used to audition and play factory presets from third-party hosts
 * (gleitz.github.io, tonejs.github.io, danigb.github.io). That made the
 * "offline-capable" PWA depend on someone else's GitHub Pages, added a network
 * round trip to the first note, and meant a dropped connection silenced a
 * factory instrument. This script mirrors every preset sample once, records its
 * provenance, and rewrites the preset URLs to the bundled copy.
 *
 * Run from the repository root:
 *   node scripts/fetch-factory-samples.mjs
 *
 * The output is committed so a normal build never needs the network. Re-running
 * is idempotent: files are overwritten from the same source URLs and the source
 * file is rewritten only when a remote URL is still present.
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const SERVICE = 'src/app/services/instruments.service.ts';
const OUT_DIR = 'src/assets/samples/factory';
const SAMPLE_URL = /https:\/\/[^'"\s]+\.(?:mp3|m4a|wav|ogg)/g;

/** Readable, collision-resistant local name derived from the source URL. */
function localNameFor(url, used) {
  const parsed = new URL(url);
  const cleanPath = decodeURIComponent(parsed.pathname).replace(/^\/+/, '');
  const ext = path.extname(cleanPath).toLowerCase();
  const stem = cleanPath
    .slice(0, -ext.length)
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
  let name = `${stem}${ext}`;
  if (used.has(name)) {
    const suffix = createHash('sha1').update(url).digest('hex').slice(0, 8);
    name = `${stem}-${suffix}${ext}`;
  }
  used.add(name);
  return name;
}

function attributionFor(url) {
  const host = new URL(url).host;
  if (host === 'gleitz.github.io') {
    return 'FluidR3 GM soundfont by Frank Wen, rendered by MIDI.js Soundfonts (CC BY 3.0).';
  }
  if (host === 'danigb.github.io') {
    if (url.includes('/vcsl/')) return 'Versilian Community Sample Library (CC0).';
    if (url.includes('/sample-pi/')) return 'Sample Pi one-shots (CC0).';
    return 'Splendid Grand Piano (public domain), danigb/samples mirror.';
  }
  if (host === 'tonejs.github.io') {
    if (url.includes('/salamander/')) {
      return 'Salamander Grand Piano by Alexander Holm (CC BY 3.0), Tone.js audio examples.';
    }
    return 'Tone.js audio example sample; see the Tone.js repository for provenance.';
  }
  return 'See the source project for licence terms.';
}

const source = await readFile(SERVICE, 'utf8');
const urls = [...new Set(source.match(SAMPLE_URL) ?? [])];
if (urls.length === 0) {
  console.log('No remote preset samples found — nothing to localise.');
  process.exit(0);
}

await mkdir(OUT_DIR, { recursive: true });
const used = new Set();
const files = [];
const failures = [];

for (const url of urls) {
  const name = localNameFor(url, used);
  const local = `assets/samples/factory/${name}`;
  const destination = path.join(OUT_DIR, name);
  try {
    const response = await fetch(url, { redirect: 'follow' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.byteLength < 1024) throw new Error(`only ${bytes.byteLength} bytes`);
    await writeFile(destination, bytes);
    files.push({
      source: url,
      local,
      bytes: bytes.byteLength,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      attribution: attributionFor(url),
    });
    console.log(`ok  ${name} (${(bytes.byteLength / 1024).toFixed(0)} KB)`);
  } catch (error) {
    failures.push({ url, message: error instanceof Error ? error.message : String(error) });
    console.error(`FAIL ${url} — ${failures.at(-1).message}`);
  }
}

await writeFile(
  path.join(OUT_DIR, 'manifest.json'),
  `${JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      note: 'Bundled factory samples. Regenerate with node scripts/fetch-factory-samples.mjs.',
      files,
    },
    null,
    2,
  )}\n`,
);

const attributionRows = files
  .map((file) => `| \`${path.basename(file.local)}\` | ${file.attribution} | ${file.source} |`)
  .join('\n');
await writeFile(
  path.join(OUT_DIR, 'SOURCES.md'),
  `# Factory sample sources

These files are bundled so factory presets work offline. They are one-shot
samples, not a general-purpose library. Each row records the upstream file and
the attribution supplied by the project that publishes it.

| Local file | Attribution | Source URL |
| --- | --- | --- |
${attributionRows}

FluidR3 GM is distributed under CC BY 3.0. Splendid Grand Piano is public
domain. VCSL and Sample Pi are CC0. Salamander Grand Piano is CC BY 3.0.
Tone.js itself is MIT; individual example samples may carry their own terms.
Check the upstream terms again before any commercial redistribution.
`,
);

// Rewrite only URLs that downloaded successfully, so a failed fetch does not
// point a preset at a missing file.
let rewritten = source;
for (const file of files) rewritten = rewritten.split(file.source).join(file.local);
if (rewritten !== source) await writeFile(SERVICE, rewritten);

const totalBytes = files.reduce((sum, file) => sum + file.bytes, 0);
console.log(
  `\n${files.length}/${urls.length} samples localised (${(totalBytes / 1024 / 1024).toFixed(1)} MB).`,
);
if (failures.length) {
  console.error(`${failures.length} sample(s) still remote — see failures above.`);
  process.exit(1);
}
