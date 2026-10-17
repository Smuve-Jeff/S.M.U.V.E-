#!/usr/bin/env node
/**
 * Resolve + probe genre candidates for catalog addition (curl transport).
 *
 * retrogames.cc throttles bursts with soft-404s; this pipeline runs in
 * checkpointed phases so long sweeps survive:
 *   --phase=resolve  game pages -> /embed/ URLs (skips catalog DUPs)
 *                    -> /tmp/resolved.json
 *   --phase=probe    embeds -> 200..399 + no frame-blocking headers
 *                    -> /tmp/verified-additions.json  (resumable)
 */
'use strict';
const fs = require('fs');
const { execFileSync } = require('child_process');

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const FEED = 'src/assets/data/tha-spot-feed.json';
const RESOLVED_FILE = '/tmp/resolved.json';
const VERIFIED_FILE = '/tmp/verified-additions.json';
const DELAY_MS = Number(process.env.DELAY_MS || 400);
const PROBE_DELAY_MS = Number(process.env.PROBE_DELAY_MS || 1300);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function curl(url, { headers = false, timeoutS = 15 } = {}) {
  const args = ['-s', '-L', '-A', UA, '--max-time', String(timeoutS), '-w', '\n__STATUS__%{http_code}'];
  if (headers) args.push('-D', '-');
  args.push(url);
  try {
    const out = execFileSync('curl', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    const m = out.match(/\n__STATUS__(\d+)\s*$/);
    const status = m ? Number(m[1]) : 0;
    const body = headers ? out : out.replace(/\n__STATUS__\d+\s*$/, '');
    return { status, body };
  } catch {
    return { status: 0, body: '' };
  }
}

/** Looser-match recoveries for high-value titles: [cat, slug, name]. */
const RECOVERED = [
  ['psx-games', 'dino-crisis-ii', 'Dino Crisis 2'],
  ['psx-games', 'tomb-raider-2', 'Tomb Raider II'],
  ['snes-games', 'demon-s-crest-usa', "Demon's Crest"],
  ['n64-games', 'castlevania-usa', 'Castlevania (N64)'],
  ['n64-games', 'spacestation-silicon-valley-usa', 'Space Station Silicon Valley'],
  ['n64-games', 'command-amp-conquer-usa', 'Command & Conquer (N64)'],
  ['n64-games', 'starcraft-64-australia', 'StarCraft 64'],
  ['gameboyadvance-games', 'doom-ii-u-mode7', 'Doom II (GBA)'],
  ['gameboyadvance-games', 'breath-of-fire-u-mode7', 'Breath of Fire (GBA)'],
  ['gameboyadvance-games', 'tactics-ogre-the-knight-of-lodis-u-mode7', 'Tactics Ogre: The Knight of Lodis'],
  ['gameboycolor-games', 'fushigi-no-dungeon-fuurai-no-shiren-gb2-sabaku-no-majou-japan', 'Mystery Dungeon: Shiren the Wanderer GB2'],
  ['gameboy-games', 'gargoyle-s-quest-ghosts-n-goblins-usa-europe', "Gargoyle's Quest"],
  ['nes-games', 'magic-of-scheherazade-the-usa', 'The Magic of Scheherazade'],
  ['arcade-games', 'gauntlet-2-players-japanese-rev-2', 'Gauntlet (Arcade)'],
  ['genesis-games', 'pirates-of-dark-water-the-usa-may-1994', 'The Pirates of Dark Water'],
];

function isFrameBlocked(headersText) {
  const t = (headersText || '').toLowerCase();
  const xfo = t.match(/x-frame-options:\s*([^\r\n]+)/)?.[1] || '';
  const csp = t.match(/content-security-policy:\s*([^\r\n]+)/)?.[1] || '';
  return (
    xfo.includes('deny') ||
    xfo.includes('sameorigin') ||
    (/frame-ancestors/.test(csp) && !/frame-ancestors[^;]*\*/.test(csp))
  );
}

async function phaseResolve() {
  const feed = JSON.parse(fs.readFileSync(FEED, 'utf8'));
  const existingRetroIds = new Set();
  for (const g of feed.games) {
    for (const u of [g.url, g.launchConfig?.approvedEmbedUrl, g.launchConfig?.approvedExternalUrl]) {
      const m = (u || '').match(/retrogames\.cc\/embed\/(\d+)-/);
      if (m) existingRetroIds.add(m[1]);
    }
  }

  const candidates = JSON.parse(fs.readFileSync('/tmp/genre-candidates.json', 'utf8')).map((c) => ({
    platform: c.platform,
    slug: c.slug,
    name: c.name,
  }));
  for (const [cat, slug, name] of RECOVERED) candidates.push({ platform: cat, slug, name });
  const seen = new Set();
  const unique = candidates.filter((c) => {
    const k = `${c.platform}/${c.slug}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  console.log(`${unique.length} unique candidates to resolve...`);

  const resolved = [];
  let dup = 0;
  let miss = 0;
  for (let i = 0; i < unique.length; i++) {
    const c = unique[i];
    const pageUrl = `https://www.retrogames.cc/${c.platform}/${c.slug}.html`;
    let { status, body } = await curl(pageUrl);
    if (status !== 200) {
      await sleep(900);
      const retry = await curl(pageUrl);
      status = retry.status;
      body = retry.body;
    }
    const m = body && body.match(/\/embed\/(\d+)-([a-z0-9-]+)\.html/);
    if (status !== 200 || !m) {
      miss++;
      console.log(`  ${i + 1}/${unique.length} MISS ${c.name} (${status})`);
    } else if (existingRetroIds.has(m[1])) {
      dup++;
      console.log(`  ${i + 1}/${unique.length} DUP ${c.name} (${m[1]})`);
    } else {
      resolved.push({ ...c, embedId: m[1], embedPath: m[0].replace(/^\//, '') });
    }
    if ((i + 1) % 40 === 0) console.log(`  …${i + 1}/${unique.length} (new: ${resolved.length}, dup: ${dup}, miss: ${miss})`);
    await sleep(DELAY_MS);
  }
  fs.writeFileSync(RESOLVED_FILE, JSON.stringify(resolved, null, 2));
  console.log(`resolved: ${resolved.length} NEW | ${dup} dup | ${miss} miss -> ${RESOLVED_FILE}`);
}

async function phaseProbe() {
  const feed = JSON.parse(fs.readFileSync(FEED, 'utf8'));
  const existingNames = new Set(feed.games.map((g) => g.name));
  const resolved = JSON.parse(fs.readFileSync(RESOLVED_FILE, 'utf8'));
  const done = new Set(fs.existsSync(VERIFIED_FILE) ? JSON.parse(fs.readFileSync(VERIFIED_FILE, 'utf8')).map((v) => v.embedPath) : []);
  const todo = resolved.filter((r) => !done.has(r.embedPath));
  console.log(`${todo.length} embed(s) to probe (resumable; ${done.size} already verified)`);

  const verified = JSON.parse(fs.existsSync(VERIFIED_FILE) ? fs.readFileSync(VERIFIED_FILE, 'utf8') : '[]');
  let consecutiveFails = 0;
  for (let j = 0; j < todo.length; j++) {
    const r = todo[j];
    const url = `https://www.retrogames.cc/embed/${r.embedPath}`;
    const { status, body: headers } = await curl(url, { headers: true, timeoutS: 8 });
    const blocked = isFrameBlocked(headers);
    const playable = status >= 200 && status < 400 && !blocked;
    if (playable) {
      consecutiveFails = 0;
      verified.push({ ...r, url, status });
      fs.writeFileSync(VERIFIED_FILE, JSON.stringify(verified, null, 2));
    } else {
      consecutiveFails++;
      if (consecutiveFails >= 3) {
        console.log(`  (throttled — cooling down 90s)`);
        await sleep(90000);
        consecutiveFails = 0;
      }
    }
    console.log(`  ${j + 1}/${todo.length} ${playable ? 'PLAY' : 'FAIL'} ${r.name} (${status}${blocked ? ' frameblocked' : ''})`);
    await sleep(PROBE_DELAY_MS);
  }

  const nameSeen = new Set();
  const final = verified.filter((v) => {
    if (existingNames.has(v.name) || nameSeen.has(v.name)) {
      console.log(`  NAME-COLLISION skipped: ${v.name}`);
      return false;
    }
    nameSeen.add(v.name);
    return true;
  });
  fs.writeFileSync(VERIFIED_FILE, JSON.stringify(final, null, 2));
  console.log(`\n${final.length} verified playable NEW cabinets -> ${VERIFIED_FILE}`);
  console.log(`projected catalog: ${feed.games.length} -> ${feed.games.length + final.length}`);
}

(async () => {
  const phase = (process.argv.find((a) => a.startsWith('--phase=')) || '--phase=resolve').split('=')[1];
  if (phase === 'resolve') await phaseResolve();
  else if (phase === 'probe') await phaseProbe();
  else throw new Error(`unknown phase: ${phase}`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
