#!/usr/bin/env node
/**
 * Probe candidate cabinet embed URLs for live playability.
 *
 * A cabinet is "playable" only if its embed URL:
 *   - resolves 200..399, AND
 *   - serves without X-Frame-Options / frame-ancestors CSP blocking,
 *     or already appears in the catalog (already-proven playable).
 *
 * Usage: node scripts/probe-candidates.cjs
 */
'use strict';
const fs = require('fs');

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const JSON_FEED = 'src/assets/data/tha-spot-feed.json';

/** Candidate cabinet: id, name, embed URL path (retrogames.cc). */
const CANDIDATES = [
  // Madden NFL — newer-generation N64 era (completes the series arc)
  { id: 'madden-nfl-99-n64', name: 'Madden NFL 99 (N64)', path: '32136-madden-nfl-99-usa.html' },
  { id: 'madden-nfl-2000-n64', name: 'Madden NFL 2000 (N64)', path: '32551-madden-nfl-2000-usa.html' },
  { id: 'madden-nfl-2001-n64', name: 'Madden NFL 2001 (N64)', path: '32595-madden-nfl-2001-usa.html' },
  { id: 'madden-nfl-2002-n64', name: 'Madden NFL 2002 (N64)', path: '32297-madden-nfl-2002-usa.html' },
  // NBA — 2K-era-adjacent authentic simulations
  { id: 'nba-live-2000-n64', name: 'NBA Live 2000 (N64)', path: '32503-nba-live-2000-usa-en-fr-de-es.html' },
  { id: 'nba-showtime-n64', name: 'NBA Showtime: NBA on NBC (N64)', path: '32695-nba-showtime-nba-on-nbc-usa.html' },
  { id: 'nba-jam-2000-n64', name: 'NBA Jam 2000 (N64)', path: '32238-nba-jam-2000-usa.html' },
  // X-Men — PS1 era
  { id: 'xmen-children-atom-ps1', name: 'X-Men: Children of the Atom (PS1)', path: '42409-x-men-children-of-the-atom.html' },
  { id: 'xmen-mutant-academy-ps1', name: "X-Men: Mutant Academy (PS1)", path: '46403-x-men-mutant-academy-usa.html' },
  // Spider-Man — PS1 era
  { id: 'spider-man-ps1', name: 'Spider-Man (PS1)', path: '41980-spider-man.html' },
  { id: 'spider-man-2-electro-ps1', name: 'Spider-Man 2: Enter Electro (PS1)', path: '41981-spider-man-2-enter-electro.html' },
];

const feed = JSON.parse(fs.readFileSync(JSON_FEED, 'utf8'));
const known = new Set(feed.games.map((g) => g.url));

async function probe(path) {
  const url = `https://www.retrogames.cc/embed/${path}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'user-agent': UA, accept: 'text/html,*/*' },
    });
    clearTimeout(timer);
    const status = res.status;
    const xfo = (res.headers.get('x-frame-options') || '').toLowerCase();
    const csp = (res.headers.get('content-security-policy') || '').toLowerCase();
    const blocked = /frame-ancestors/.test(csp) && !/frame-ancestors[^;]*\*/.test(csp);
    const frameBlocked = xfo.includes('deny') || xfo.includes('sameorigin') || blocked;
    const alreadyListed = known.has(url);
    return { url, status, frameBlocked, alreadyListed };
  } catch {
    clearTimeout(timer);
    return { url, status: 0, frameBlocked: false, alreadyListed: known.has(url) };
  }
}

(async () => {
  console.log(`Probing ${CANDIDATES.length} candidate embed URL(s)...`);
  const results = [];
  for (const c of CANDIDATES) {
    const r = await probe(c.path);
    const playable = r.status >= 200 && r.status < 400 && (!r.frameBlocked || r.alreadyListed);
    results.push({ ...c, ...r, playable });
    console.log(
      `${playable ? 'PLAY ' : 'FAIL '} ${c.id} status=${r.status} frameBlocked=${r.frameBlocked}${r.alreadyListed ? ' (already listed)' : ''}`
    );
  }
  fs.writeFileSync(
    '/tmp/probe-results.json',
    JSON.stringify(results, null, 2)
  );
  const ok = results.filter((r) => r.playable);
  console.log(`\n${ok.length}/${results.length} verified playable -> /tmp/probe-results.json`);
})();
