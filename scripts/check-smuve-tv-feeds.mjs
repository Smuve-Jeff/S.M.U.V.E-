#!/usr/bin/env node
/**
 * S.M.U.V.E. TV HLS health check.
 *
 * This reads the real `SMUVE_TV_LIVE_FEEDS` constant out of the TypeScript
 * source with the TypeScript AST, then walks the same path a browser does:
 *
 *   master playlist -> first variant playlist -> first media segment
 *
 * A feed passes only when all three answer successfully and the segment
 * returns real bytes. A dead, geo-blocked, malformed or empty feed fails the
 * run, which is what makes this safe to use as a release gate.
 *
 * Usage:
 *   node scripts/check-smuve-tv-feeds.mjs
 *   npm run check:tv-feeds
 *
 * Useful flags / environment variables:
 *   --list                 Parse and print the catalogue without probing.
 *   --concurrency=6        Parallel feed probes (default 6).
 *   --timeout=20000        Per-request timeout in milliseconds.
 *   --retries=1            Retries for transient failures.
 *
 * Exit codes:
 *   0  every feed is playable
 *   1  at least one feed failed, or the catalogue could not be parsed
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FEED_SOURCE = path.join(ROOT, 'src/app/services/smuve-tv-feeds.service.ts');
const BROWSER_UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

const requestedConcurrency = readNumberFlag('concurrency', 6);
const timeoutMs = readNumberFlag('timeout', 20_000);
const retries = readNumberFlag('retries', 1);
const concurrency = Math.max(1, Math.min(12, requestedConcurrency));
const listOnly = process.argv.includes('--list');

function readNumberFlag(name, fallback) {
  const prefix = `--${name}=`;
  const entry = process.argv.find((argument) => argument.startsWith(prefix));
  if (!entry) return fallback;
  const parsed = Number(entry.slice(prefix.length));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function propertyName(name) {
  if (ts.isIdentifier(name) || ts.isStringLiteralLike(name)) return name.text;
  return undefined;
}

function extractFeeds() {
  const sourceText = fs.readFileSync(FEED_SOURCE, 'utf8');
  const source = ts.createSourceFile(
    FEED_SOURCE,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  );

  let feeds = null;
  const visit = (node) => {
    if (
      !feeds &&
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === 'SMUVE_TV_LIVE_FEEDS' &&
      node.initializer &&
      ts.isArrayLiteralExpression(node.initializer)
    ) {
      feeds = [];
      for (const element of node.initializer.elements) {
        if (!ts.isObjectLiteralExpression(element)) continue;
        const values = {};
        for (const property of element.properties) {
          if (!ts.isPropertyAssignment(property)) continue;
          const key = propertyName(property.name);
          if (key && ts.isStringLiteralLike(property.initializer)) {
            values[key] = property.initializer.text;
          }
        }

        const id = values.id?.trim() || '<unknown>';
        for (const key of ['id', 'name', 'url', 'genre', 'operator', 'source']) {
          if (!values[key]?.trim()) {
            throw new Error(`Feed ${id} is missing a non-empty "${key}"`);
          }
        }

        let parsed;
        try {
          parsed = new URL(values.url);
        } catch {
          throw new Error(`Feed ${id} has an invalid URL: ${values.url}`);
        }
        if (parsed.protocol !== 'https:' || !parsed.pathname.endsWith('.m3u8')) {
          throw new Error(
            `Feed ${id} must use an https .m3u8 URL, got ${values.url}`
          );
        }

        feeds.push({
          id,
          name: values.name,
          url: values.url,
          genre: values.genre,
          operator: values.operator,
          source: values.source,
        });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);

  if (!feeds) {
    throw new Error('SMUVE_TV_LIVE_FEEDS was not found in the feed service');
  }
  if (!feeds.length) {
    throw new Error('SMUVE_TV_LIVE_FEEDS is empty');
  }

  const ids = feeds.map((feed) => feed.id);
  const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
  if (duplicates.length) {
    throw new Error(`Duplicate feed ids: ${[...new Set(duplicates)].join(', ')}`);
  }

  return feeds;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function isTransient(status) {
  return status === 0 || status === 408 || status === 425 || status === 429 || status >= 500;
}

async function request(url, headers = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'user-agent': BROWSER_UA,
        accept:
          'application/vnd.apple.mpegurl,application/x-mpegURL,text/plain,*/*',
        ...headers,
      },
    });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchPlaylist(url, label) {
  let lastError = null;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await request(url);
      if (!response.ok) {
        lastError = new Error(`${label} returned HTTP ${response.status}`);
        if (!isTransient(response.status)) break;
      } else {
        const text = await response.text();
        if (!text.includes('#EXTM3U')) {
          lastError = new Error(`${label} did not return an HLS playlist`);
          break;
        }
        return { response, text };
      }
    } catch (error) {
      lastError = new Error(`${label} request failed: ${error.message}`);
    }

    if (attempt < retries) await sleep(1_000 * (attempt + 1));
  }

  throw lastError || new Error(`${label} failed`);
}

function firstVariantUri(playlist) {
  const lines = playlist
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const streamIndex = lines.findIndex((line) =>
    line.startsWith('#EXT-X-STREAM-INF')
  );
  if (streamIndex < 0) return null;

  for (let index = streamIndex + 1; index < lines.length; index += 1) {
    if (!lines[index].startsWith('#')) return lines[index];
  }
  return null;
}

function firstSegmentUri(playlist) {
  return (
    playlist
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line && !line.startsWith('#')) ?? null
  );
}

async function probeSegment(url) {
  let lastError = null;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await request(url, { range: 'bytes=0-131071' });
      if (!response.ok) {
        lastError = new Error(`media segment returned HTTP ${response.status}`);
        if (!isTransient(response.status)) break;
      } else if (!response.body) {
        const bytes = (await response.arrayBuffer()).byteLength;
        if (bytes > 0) return { status: response.status, bytes };
        lastError = new Error('media segment was empty');
      } else {
        const reader = response.body.getReader();
        const { value } = await reader.read();
        await reader.cancel().catch(() => {});
        const bytes = value?.byteLength ?? 0;
        if (bytes > 0) return { status: response.status, bytes };
        lastError = new Error('media segment was empty');
      }
    } catch (error) {
      lastError = new Error(`media segment request failed: ${error.message}`);
    }

    if (attempt < retries) await sleep(1_000 * (attempt + 1));
  }

  throw lastError || new Error('media segment failed');
}

async function probeFeed(feed) {
  const startedAt = Date.now();
  const master = await fetchPlaylist(feed.url, 'master playlist');
  let mediaUrl = feed.url;
  let mediaText = master.text;
  let variantStatus = master.response.status;

  const variantUri = firstVariantUri(master.text);
  if (variantUri) {
    mediaUrl = new URL(variantUri, feed.url).toString();
    const variant = await fetchPlaylist(mediaUrl, 'variant playlist');
    mediaText = variant.text;
    variantStatus = variant.response.status;
  } else if (!/#EXTINF|#EXT-X-TARGETDURATION/.test(mediaText)) {
    throw new Error(
      'master playlist has neither a variant stream nor media segments'
    );
  }

  const segmentUri = firstSegmentUri(mediaText);
  if (!segmentUri) {
    throw new Error('media playlist has no segment');
  }

  const segmentUrl = new URL(segmentUri, mediaUrl).toString();
  const segment = await probeSegment(segmentUrl);

  return {
    masterStatus: master.response.status,
    variantStatus,
    segmentStatus: segment.status,
    bytes: segment.bytes,
    elapsedMs: Date.now() - startedAt,
  };
}

async function main() {
  const feeds = extractFeeds();

  if (listOnly) {
    for (const feed of feeds) {
      console.log(`${feed.id}\t${feed.genre}\t${feed.url}`);
    }
    console.log(`\n${feeds.length} feeds parsed from ${FEED_SOURCE}`);
    return;
  }

  console.log(
    `Probing ${feeds.length} S.M.U.V.E TV feeds ` +
      `(concurrency ${concurrency}, timeout ${timeoutMs}ms, retries ${retries})`
  );

  const results = new Array(feeds.length);
  let cursor = 0;
  let completed = 0;

  const worker = async () => {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= feeds.length) return;

      const feed = feeds[index];
      const label = `[${String(++completed).padStart(3)}/${feeds.length}]`;
      try {
        const details = await probeFeed(feed);
        results[index] = { feed, ok: true, details };
        console.log(
          `${label} OK   ${feed.id} | ${feed.name} | ` +
            `${details.masterStatus}/${details.variantStatus}/${details.segmentStatus} | ` +
            `${details.bytes} bytes | ${details.elapsedMs}ms`
        );
      } catch (error) {
        results[index] = { feed, ok: false, error: error.message };
        console.log(
          `${label} FAIL ${feed.id} | ${feed.name} | ${error.message} | ${feed.url}`
        );
      }
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(concurrency, feeds.length) }, () => worker())
  );

  const failures = results.filter((result) => !result.ok);
  console.log(
    `\nS.M.U.V.E TV feed health: ${feeds.length - failures.length}/${feeds.length} playable`
  );

  if (failures.length) {
    console.error('\nDead feeds:');
    for (const failure of failures) {
      console.error(
        `  ${failure.feed.id} | ${failure.feed.name} | ${failure.error} | ${failure.feed.url}`
      );
    }
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(`S.M.U.V.E TV feed health check failed: ${error.message}`);
  process.exitCode = 1;
});
