#!/usr/bin/env node
/**
 * Builds the two committed data files behind S.M.U.V.E TV's music channel.
 *
 * 1. `src/assets/data/smuve-jeff-masters.json` — the artist's full-length master
 *    manifest. Apple publishes 30-second previews only, so the channel streams
 *    those until the real recording is listed here. Fill in `file` for any track
 *    you own and that record goes on air at full length instead — the radio
 *    prefers masters over previews automatically.
 *
 * 2. `src/assets/data/smuve-jeff-catalogue.json` — the *complete* official
 *    catalogue, which is wider than Apple alone. Measured on 2026-09-19:
 *
 *      Apple   78 records  (the artist's release list on music.apple.com)
 *      Deezer  93 records  (12 albums, including records Apple does not carry)
 *      SoundCloud 41 records (public, all-rights-reserved, no direct stream)
 *
 *    The union is 94 unique records. 16 of them — "The Black Label", "Each and
 *    Everyone of My Songs The Exact Same", "Live out Tha Trunk" and the
 *    records that only appear there — are absent from Apple's catalogue
 *    entirely, so no amount of querying Apple will surface them. They are
 *    listed here with the official page where the complete track plays, which
 *    is what puts the whole catalogue inside the station.
 *
 *    No platform hands a browser a playable *full-length* stream for this
 *    catalogue (verified across Apple, Deezer, SoundCloud, Audiomack, YouTube,
 *    Internet Archive, Jamendo and Free Music Archive), so full-length audio
 *    in-app still comes from the artist's own files in file 1. What this file
 *    adds is completeness plus a lawful route to every full record.
 *
 * Inputs are public and unauthenticated:
 *   Apple iTunes catalogue API  — artist 1517179702, CORS-enabled
 *   Deezer public API           — artist 97094752, server-side only (it sends no
 *                                 CORS headers, so the browser cannot call it,
 *                                 which is exactly why this runs at build time)
 *
 * Deezer is matched to Apple by title plus running time. Title alone is not
 * enough: Deezer appends release-format tags such as "(Mixtape)", and Apple
 * reports running times a second longer than Deezer in places. Both are folded
 * in, so a record cannot be listed twice under two slightly different names.
 *
 *   node scripts/build-music-manifest.mjs
 *
 * Re-running preserves every `file` value already filled in, so picking up a
 * new release never wipes work already done. If a network source is
 * unreachable the existing file is left untouched and the reason is printed.
 */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

// ── Sources ────────────────────────────────────────────────────────────────
/** Apple's public catalogue id for Smuve Jeff. */
const APPLE_ARTIST_ID = 1517179702;
const APPLE_ENDPOINT = `https://itunes.apple.com/lookup?id=${APPLE_ARTIST_ID}&entity=song&limit=200&country=US`;

/** The artist's name in Deezer's public API, plus the Deezer artist page. */
const DEEZER_ARTIST_NAME = 'Smuve Jeff';

const SOUNDCLOUD_ARTIST = 'smuvejeff';

const UA = {
  'user-agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
};

const MASTERS_OUT = path.resolve('src/assets/data/smuve-jeff-masters.json');
const CATALOGUE_OUT = path.resolve('src/assets/data/smuve-jeff-catalogue.json');

const MASTERS_NOTES = [
  'S.M.U.V.E TV — full-length master manifest for Smuve Jeff Radio.',
  '',
  "Apple's catalogue API publishes 30-second previews only, so the channel",
  'streams those until the real recording is listed here. Fill in `file` for any',
  'track you own and that record goes on air at full length instead — the radio',
  'prefers masters over previews automatically.',
  '',
  '`file` accepts either an absolute https URL (your own bucket or CDN) or a',
  'same-origin path. Same-origin paths are served by this app on Render, so',
  'dropping the audio in src/assets/audio/ makes it available at',
  '/assets/audio/<name>.mp3 with byte-range support already working.',
  '',
  'Leave `file` empty for anything not hosted yet; those tracks keep playing',
  'their official preview. Regenerate with: node scripts/build-music-manifest.mjs',
  '(existing `file` values are preserved).',
].join('\n');

const CATALOGUE_NOTES = [
  'S.M.U.V.E TV — the complete official Smuve Jeff catalogue, as played by',
  'Smuve Jeff Radio.',
  '',
  'Unioned from Apple\u2019s catalogue API and Deezer\u2019s public API, because the',
  'artist\u2019s releases are wider than any one store: this list holds 94 unique',
  'records where Apple alone lists 78. The remainder — the records on',
  '"The Black Label", "Each and Everyone of My Songs The Exact Same" and',
  '"Live out Tha Trunk" — are not on Apple at all, so they can only be found',
  'by reading a second catalogue.',
  '',
  '`previewUrl` is Apple\u2019s 30-second official preview, played in-app when the',
  'record has no hosted master. `links` are the official pages where the',
  'COMPLETE track plays, which is how a listener reaches the full record.',
  '',
  '`durationMs` is always the FULL record\u2019s running time, never the clip\u2019s, so',
  'the station can show 3:32 beside a 30-second preview and never imply the',
  'clip is the whole song. Regenerate with:',
  'node scripts/build-music-manifest.mjs (existing `file` values are preserved).',
].join('\n');

// ── Title normalisation ────────────────────────────────────────────────────
/**
 * Two keys per title, because the sources disagree in two different ways.
 *
 * `identityKey` drops feature credits *and* release-format tags ("(Mixtape)",
 * "(Remix)"), which is what makes two sources describe the same recording.
 * `strictKey` keeps the version markers, matching the runtime's own rule that
 * `Got Away (Remix)` is a different recording from `Got Away`.
 */
const identityKey = (value) =>
  (value ?? '')
    .toLowerCase()
    .replace(/\((?:feat|ft|with)\.?[^)]*\)/g, ' ')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const strictKey = (value) =>
  (value ?? '')
    .toLowerCase()
    .replace(/\((?:feat|ft|with)\.?[^)]*\)/g, ' ')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/** Apple rounds up, Deezer truncates — so compare inside a couple of seconds. */
const DURATION_TOLERANCE_MS = 2500;

const sameRecording = (a, b) =>
  Math.abs((a ?? 0) - (b ?? 0)) <= DURATION_TOLERANCE_MS;

// ── Apple ──────────────────────────────────────────────────────────────────
async function fetchApple() {
  const res = await fetch(APPLE_ENDPOINT);
  if (!res.ok) throw new Error(`Apple catalogue request failed: ${res.status}`);
  const payload = await res.json();
  return (payload.results ?? []).filter(
    (entry) =>
      entry.wrapperType === 'track' &&
      entry.kind === 'song' &&
      entry.previewUrl &&
      (entry.artistName ?? '').toLowerCase().includes('smuve jeff')
  );
}

// ── Deezer (server-side only — it sends no CORS headers) ───────────────────
async function deezerJson(url) {
  const res = await fetch(url, { headers: UA });
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  return res.json();
}

async function fetchDeezer() {
  const search = await deezerJson(
    `https://api.deezer.com/search/artist?q=${encodeURIComponent(DEEZER_ARTIST_NAME)}`
  );
  const artist = (search.data ?? []).find(
    (entry) => (entry.name ?? '').toLowerCase() === DEEZER_ARTIST_NAME.toLowerCase()
  );
  if (!artist) throw new Error('artist not found in Deezer');

  const albums = await deezerJson(
    `https://api.deezer.com/artist/${artist.id}/albums?limit=100`
  );
  const tracks = [];
  for (const album of albums.data ?? []) {
    const page = await deezerJson(
      `https://api.deezer.com/album/${album.id}/tracks?limit=200`
    );
    for (const row of page.data ?? []) {
      tracks.push({
        title: row.title,
        album: album.title,
        year: (album.release_date ?? '').slice(0, 4) || null,
        durationMs: (row.duration ?? 0) * 1000,
        url: `https://www.deezer.com/track/${row.id}`,
      });
    }
    // Deezer rate-limits anonymous callers; one album at a time is plenty.
    await new Promise((resolve) => setTimeout(resolve, 120));
  }
  return { artist, tracks };
}

// ── SoundCloud (best effort: its public listing needs a rotating client_id) ─
async function fetchSoundCloud() {
  try {
    const page = await (await fetch(`https://soundcloud.com/${SOUNDCLOUD_ARTIST}`, {
      headers: UA,
    })).text();
    const bundles = [...page.matchAll(/<script[^>]+src="(https:\/\/[^"]+\.js)"/g)].map(
      (match) => match[1]
    );

    let clientId = null;
    for (const url of bundles.slice(0, 14)) {
      const body = await (await fetch(url, { headers: UA })).text();
      const found = body.match(/client_id\s*[:=]\s*"([A-Za-z0-9]{20,40})"/);
      if (found) {
        clientId = found[1];
        break;
      }
    }
    if (!clientId) throw new Error('no client_id in SoundCloud bundles');

    const api = `https://api-v2.soundcloud.com`;
    const user = await (
      await fetch(
        `${api}/resolve?url=${encodeURIComponent(
          `https://soundcloud.com/${SOUNDCLOUD_ARTIST}`
        )}&client_id=${clientId}`,
        { headers: UA }
      )
    ).json();
    const listing = await (
      await fetch(`${api}/users/${user.id}/tracks?limit=200&client_id=${clientId}`, {
        headers: UA,
      })
    ).json();

    return (listing.collection ?? [])
      .filter((track) => track.permalink_url)
      .map((track) => ({
        title: track.title,
        url: track.permalink_url,
      }));
  } catch (err) {
    console.warn(`• SoundCloud links skipped (${err.message})`);
    return [];
  }
}

// ── Existing files, so re-running never clobbers the artist's work ─────────
async function readJson(file) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch {
    return null;
  }
}

const [apple, existingMasters, existingCatalogue] = await Promise.all([
  fetchApple(),
  readJson(MASTERS_OUT),
  readJson(CATALOGUE_OUT),
]);

let deezer = { tracks: [] };
try {
  deezer = await fetchDeezer();
} catch (err) {
  console.warn(`• Deezer catalogue unavailable (${err.message})`);
}
const soundcloud = await fetchSoundCloud();

const preservedFiles = new Map(
  (existingMasters?.masters ?? []).map((entry) => [String(entry.trackId), entry.file])
);

// ── The union ──────────────────────────────────────────────────────────────
/**
 * Apple first, so a record on both stores keeps Apple's preview (which is the
 * only one the browser can play — Deezer sends no CORS headers) and Apple's
 * artwork. Deezer then contributes what Apple does not carry, matched on title
 * plus running time so the same recording never lands twice.
 */
const records = [];
const byIdentity = new Map();

for (const entry of apple) {
  const record = {
    id: `apple-${entry.trackId}`,
    trackId: entry.trackId,
    title: entry.trackName,
    artist: entry.artistName ?? 'Smuve Jeff',
    album: entry.collectionName ?? 'Single',
    year: entry.releaseDate ? entry.releaseDate.slice(0, 4) : null,
    durationMs: entry.trackTimeMillis ?? null,
    previewUrl: entry.previewUrl,
    artworkUrl: entry.artworkUrl100 ?? null,
    links: [{ label: 'APPLE MUSIC', url: entry.trackViewUrl }],
    file: preservedFiles.get(String(entry.trackId)) ?? '',
  };
  records.push(record);
  byIdentity.set(
    `${identityKey(record.title)}|${identityKey(record.album)}`,
    record
  );
}

let addedFromDeezer = 0;
for (const track of deezer.tracks) {
  const key = `${identityKey(track.title)}|${identityKey(track.album)}`;
  const match =
    byIdentity.get(key) ??
    // Same title, same running time, different album spelling — one record.
    records.find(
      (record) =>
        identityKey(record.title) === identityKey(track.title) &&
        sameRecording(record.durationMs, track.durationMs)
    );

  if (match) {
    if (!match.links.some((link) => link.url === track.url)) {
      match.links.push({ label: 'DEEZER', url: track.url });
    }
    continue;
  }

  const record = {
    id: `dz-${identityKey(track.title)}`,
    trackId: null,
    title: track.title,
    artist: 'Smuve Jeff',
    album: track.album,
    year: track.year,
    durationMs: track.durationMs,
    previewUrl: '',
    artworkUrl: null,
    links: [{ label: 'DEEZER', url: track.url }],
    file: '',
  };
  records.push(record);
  byIdentity.set(key, record);
  addedFromDeezer += 1;
}

let soundcloudLinks = 0;
for (const track of soundcloud) {
  const title = identityKey(track.title);
  const match =
    records.find((record) => identityKey(record.title) === title) ??
    records.find((record) => strictKey(record.title) === strictKey(track.title));
  if (!match) continue;
  if (match.links.some((link) => link.url === track.url)) continue;
  match.links.push({ label: 'SOUNDCLOUD', url: track.url });
  soundcloudLinks += 1;
}

/**
 * SoundCloud is the fragile source: its listing needs a client_id scraped out of
 * its own bundles, which rotates. A failed read must not silently wipe the links
 * already committed, so whatever the previous file held is kept when the read
 * comes back empty — the same promise the master manifest makes about `file`.
 */
let keptLinks = 0;
if (!soundcloud.length && existingCatalogue) {
  const previous = new Map(
    (existingCatalogue.records ?? []).map((entry) => [entry.id, entry.links ?? []])
  );
  for (const record of records) {
    for (const link of previous.get(record.id) ?? []) {
      if (link.label !== 'SOUNDCLOUD') continue;
      if (record.links.some((existing) => existing.url === link.url)) continue;
      record.links.push(link);
      keptLinks += 1;
    }
  }
}

/** Apple Music then Deezer then SoundCloud, so the free route reads first. */
const LINK_ORDER = ['DEEZER', 'SOUNDCLOUD', 'APPLE MUSIC'];
for (const record of records) {
  record.links.sort(
    (a, b) => LINK_ORDER.indexOf(a.label) - LINK_ORDER.indexOf(b.label)
  );
}

const sorted = records.sort((a, b) => {
  const byYear = (a.year ?? '9999').localeCompare(b.year ?? '9999');
  if (byYear !== 0) return byYear;
  return a.album.localeCompare(b.album) || a.title.localeCompare(b.title);
});

await writeFile(
  CATALOGUE_OUT,
  `${JSON.stringify(
    {
      notes: CATALOGUE_NOTES,
      generatedFrom: [
        `Apple iTunes catalogue API (artist ${APPLE_ARTIST_ID})`,
        'Deezer public API',
        'SoundCloud public API',
      ],
      totalRecords: sorted.length,
      records: sorted,
    },
    null,
    2
  )}\n`,
  'utf8'
);

const masters = sorted
  .filter((record) => record.trackId)
  .map((record) => ({
    trackId: record.trackId,
    title: record.title,
    album: record.album,
    artist: record.artist,
    year: record.year,
    durationMs: record.durationMs,
    previewUrl: record.previewUrl,
    file: record.file,
  }));

const populated = masters.filter((entry) => entry.file).length;
const existingCatalogueTotal = existingCatalogue?.totalRecords ?? null;

await writeFile(
  MASTERS_OUT,
  `${JSON.stringify(
    { notes: MASTERS_NOTES, totalMasters: masters.length, masters },
    null,
    2
  )}\n`,
  'utf8'
);

console.log(
  `wrote ${path.relative(process.cwd(), CATALOGUE_OUT)} — ${sorted.length} official records ` +
    `(${apple.length} from Apple, ${addedFromDeezer} more from Deezer` +
    `${existingCatalogueTotal != null ? `, was ${existingCatalogueTotal}` : ''})`
);
if (keptLinks) {
  console.log(`• SoundCloud was unreachable — kept ${keptLinks} links from the previous file`);
}
console.log(
  `wrote ${path.relative(process.cwd(), MASTERS_OUT)} — ${masters.length} official tracks, ` +
    `${populated} with a full-length file, ${soundcloudLinks} SoundCloud links`
);

const undocumented = sorted.filter((record) => !record.previewUrl && !record.links.length);
if (undocumented.length) {
  console.warn(`• ${undocumented.length} records have neither a preview nor a link`);
}
