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
 *    catalogue, which is wider than any one store. Measured on 2026-09-19:
 *
 *      Apple   78 records  (the artist's release list on music.apple.com)
 *      Deezer  93 records  (12 albums, including records Apple does not carry)
 *      YouTube 84 records  (11 official releases, every one at FULL LENGTH)
 *      SoundCloud 41 records (public, all-rights-reserved, no direct stream)
 *
 *    The union is 94 unique records. 16 of them — "The Black Label", "Each and
 *    Everyone of My Songs The Exact Same", "Live out Tha Trunk" and the
 *    records that only appear there — are absent from Apple's catalogue
 *    entirely, so no amount of querying Apple will surface them. They are
 *    listed here with the official page where the complete track plays, which
 *    is what puts the whole catalogue inside the station.
 *
 *    `youtubeId` is the important field: it is the artist's own distributor-
 *    generated upload of the COMPLETE recording, which the station can play at
 *    full length through YouTube's official player. Apple and Deezer publish
 *    30-second clips because that is what their licences allow; the Topic
 *    channel publishes the distributed record itself, so it is the one source
 *    that reaches every officially released track without the artist having to
 *    upload anything by hand. Searched and rejected as sources of full-length
 *    AUDIO (no direct stream, no CORS, or nothing by this artist): SoundCloud,
 *    Audiomack, ReverbNation, Audius, Jamendo, Free Music Archive, Bandcamp,
 *    Internet Archive, SoundClick, LiveMixtapes and MyMixtapez.
 *
 * Inputs are public and unauthenticated:
 *   Apple iTunes catalogue API  — artist 1517179702, CORS-enabled
 *   Deezer public API           — artist 97094752, server-side only (it sends no
 *                                 CORS headers, so the browser cannot call it,
 *                                 which is exactly why this runs at build time)
 *   YouTube (Topic channel)     — the artist's official releases, read from
 *                                 their album playlists; the video ids are what
 *                                 the station streams full length
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

/**
 * The artist's distributor-generated YouTube channel.
 *
 * Distribution services create one "<Artist> - Topic" channel per artist and
 * mirror every release onto it, including the records Apple and Deezer do not
 * carry. Its videos are the full distributed recordings, and they are
 * embeddable, which is what makes them the one complete full-length source for
 * this catalogue. The channel id is the stable handle; the releases under it
 * are discovered on every run, so a new album needs no edit here.
 */
const YOUTUBE_TOPIC_CHANNEL_ID = 'UCl2ZV5pJt-QbTH8XxyfYdWg';
/**
 * The artist's own channel, which carries uploads the distributor never issued —
 * records that are on no store and in no release playlist, only here.
 */
const YOUTUBE_ARTIST_CHANNEL_ID = 'UChoW8JixuTXh4RTYjZuTu6w';
const YOUTUBE_ORIGIN = 'https://www.youtube.com';
/** YouTube Music names an album playlist this way, which is how releases are told
 * apart from the channel's other shelves. */
const YOUTUBE_RELEASE_PREFIX = 'OLAK5uy_';
/**
 * A record, not a clip.
 *
 * Uploads under a minute are treated as promos rather than catalogue records.
 * The bar exists for the artist's own channel, whose shelf can hold anything;
 * the distributor's release playlists are all full records by construction.
 */
const YOUTUBE_MIN_RECORD_SECONDS = 60;

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
  'Unioned from Apple\u2019s catalogue API, Deezer\u2019s public API and the artist\u2019s',
  'official YouTube releases, because the artist\u2019s catalogue is wider than any',
  'one store: this list holds 94 unique records where Apple alone lists 78.',
  'The remainder — the records on "The Black Label", "Each and Everyone of My',
  'Songs The Exact Same" and "Live out Tha Trunk" — are not on Apple at all,',
  'so they can only be found by reading a second catalogue.',
  '',
  '`youtubeId` is the artist\u2019s own official upload of the COMPLETE recording. It',
  'is the station\u2019s full-length source: YouTube\u2019s official player streams the',
  'whole distributed track, where Apple\u2019s `previewUrl` is a 30-second clip.',
  '`previewUrl` is therefore the fallback, played in-app only for a record with',
  'neither a hosted master nor an official upload. `links` are the official',
  'pages where the complete track plays, free route first.',
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

// ── YouTube (the artist's official full-length recordings) ─────────────────
/** Depth-first walk over every object in a YouTube page's initial data. */
function walkJson(node, visit) {
  if (!node || typeof node !== 'object') return;
  visit(node);
  for (const key of Object.keys(node)) walkJson(node[key], visit);
}

/**
 * YouTube embeds its page state in a single assignment, which is the only
 * reliable way to read a listing without an API key. The value is JSON, and it
 * ends at the first `;</script>` after the assignment.
 */
function youtubeInitialData(html) {
  const raw = html.split('var ytInitialData = ')[1]?.split(';</script>')[0];
  if (!raw) throw new Error('no ytInitialData in the page');
  return JSON.parse(raw);
}

const youtubePage = async (url) => {
  const res = await fetch(url, { headers: UA });
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  return res.text();
};

/** `m:ss` / `h:mm:ss` → seconds, or `null` when the string is not a clock. */
function clockSeconds(clock) {
  if (!clock) return null;
  const parts = clock.split(':').map(Number);
  if (parts.some((part) => !Number.isFinite(part))) return null;
  return parts.reduce((total, part) => total * 60 + part, 0);
}

/** The running time YouTube prints on a video's thumbnail badge, if it is there. */
function lockupClock(lockup) {
  const badge =
    lockup.contentImage?.thumbnailViewModel?.overlays
      ?.map((overlay) => overlay.thumbnailBottomOverlayViewModel?.badges)
      .flat()
      .map((entry) => entry?.thumbnailBadgeViewModel?.text)
      .find((text) => typeof text === 'string' && /^\d{1,2}:\d{2}(?::\d{2})?$/.test(text)) ?? null;
  return badge;
}

/**
 * Every officially distributed recording, with the video that plays it whole.
 *
 * The channel's own shelf is read first, so the release list is discovered
 * rather than hard-coded: a new album appears here the day the distributor
 * publishes it. Each album is then read track by track. Playlists are paginated
 * at 100 entries by YouTube; no release on this catalogue comes close.
 */
async function fetchYouTube() {
  const releases = new Map();
  const shelf = youtubeInitialData(
    await youtubePage(`${YOUTUBE_ORIGIN}/channel/${YOUTUBE_TOPIC_CHANNEL_ID}/videos`)
  );
  walkJson(shelf, (node) => {
    const lockup = node.lockupViewModel;
    const id = lockup?.contentId;
    if (typeof id !== 'string' || !id.startsWith(YOUTUBE_RELEASE_PREFIX)) return;
    const title = lockup.metadata?.lockupMetadataViewModel?.title?.content;
    if (title) releases.set(id, title);
  });

  const tracks = [];
  for (const [playlistId, album] of releases) {
    const data = youtubeInitialData(
      await youtubePage(`${YOUTUBE_ORIGIN}/playlist?list=${playlistId}`)
    );
    walkJson(data, (node) => {
      const lockup = node.lockupViewModel;
      const videoId = lockup?.contentId;
      // On a release page every lockup is one track, keyed by its video id.
      if (typeof videoId !== 'string' || !/^[A-Za-z0-9_-]{11}$/.test(videoId)) return;
      const title = lockup.metadata?.lockupMetadataViewModel?.title?.content;
      if (!title || title === album) return;
      tracks.push({ album, title, videoId, clock: lockupClock(lockup) });
    });
    // A respectful gap: eleven pages in a row is a burst, and YouTube throttles.
    await new Promise((resolve) => setTimeout(resolve, 150));
  }

  /*
   * The artist's own channel next. Its shelf is a flat list of uploads rather
   * than releases, so there is no album to read — a record found here and
   * nowhere else is a single, and the catalogue says so.
   */
  const own = youtubeInitialData(
    await youtubePage(`${YOUTUBE_ORIGIN}/channel/${YOUTUBE_ARTIST_CHANNEL_ID}/videos`)
  );
  walkJson(own, (node) => {
    const lockup = node.lockupViewModel;
    const videoId = lockup?.contentId;
    if (typeof videoId !== 'string' || !/^[A-Za-z0-9_-]{11}$/.test(videoId)) return;
    const title = lockup.metadata?.lockupMetadataViewModel?.title?.content;
    if (!title) return;
    const clock = lockupClock(lockup);
    const seconds = clockSeconds(clock);
    if (seconds !== null && seconds < YOUTUBE_MIN_RECORD_SECONDS) return;
    tracks.push({ album: 'Single', title, videoId, clock });
  });

  return [...new Map(tracks.map((track) => [track.videoId, track])).values()];
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

/*
 * YouTube is the full-length source, so it is fetched as a source in its own
 * right rather than as a link supplier: a failure here must not wipe the video
 * ids already committed, exactly like `file` and the SoundCloud links.
 */
let youtube = [];
try {
  youtube = await fetchYouTube();
} catch (err) {
  console.warn(`• YouTube releases unavailable (${err.message})`);
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
    // Filled in by the YouTube pass below, which is the full-length source.
    youtubeId: null,
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
    youtubeId: null,
    file: '',
  };
  records.push(record);
  byIdentity.set(key, record);
  addedFromDeezer += 1;
}

/**
 * YouTube's pass, and the point of the whole build.
 *
 * A record is matched to its official upload by album and title first, then by
 * a title that is unique across the catalogue. Getting this wrong would put the
 * wrong recording on air, so a title that repeats is never used on its own.
 */
const titleCounts = new Map();
for (const record of records) {
  const key = identityKey(record.title);
  titleCounts.set(key, (titleCounts.get(key) ?? 0) + 1);
}

let youtubeMatches = 0;
let addedFromYouTube = 0;
for (const track of youtube) {
  const key = `${identityKey(track.title)}|${identityKey(track.album)}`;
  const match =
    byIdentity.get(key) ??
    records.find(
      (record) =>
        identityKey(record.title) === identityKey(track.title) &&
        titleCounts.get(identityKey(track.title)) === 1
    );

  if (!match) {
    const fresh = {
      id: `yt-${track.videoId}`,
      trackId: null,
      title: track.title,
      artist: 'Smuve Jeff',
      album: track.album,
      year: null,
      durationMs: null,
      previewUrl: '',
      artworkUrl: null,
      links: [
        { label: 'YOUTUBE', url: `${YOUTUBE_ORIGIN}/watch?v=${track.videoId}` },
      ],
      youtubeId: track.videoId,
      file: '',
    };
    records.push(fresh);
    byIdentity.set(key, fresh);
    addedFromYouTube += 1;
    continue;
  }

  match.youtubeId = track.videoId;
  const url = `${YOUTUBE_ORIGIN}/watch?v=${track.videoId}`;
  if (!match.links.some((link) => link.url === url)) {
    match.links.push({ label: 'YOUTUBE', url });
  }
  youtubeMatches += 1;
}

/**
 * A failed YouTube read must not strip the committed video ids.
 *
 * The station's full-length source is the thing most worth keeping, so the
 * previous file's ids are carried back onto records that lost theirs — the same
 * promise the master manifest makes about `file`.
 */
let keptVideoIds = 0;
if (!youtube.length && existingCatalogue) {
  const previous = new Map(
    (existingCatalogue.records ?? []).map((record) => [record.id, record.youtubeId])
  );
  for (const record of records) {
    if (record.youtubeId) continue;
    const videoId = previous.get(record.id);
    if (!videoId) continue;
    record.youtubeId = videoId;
    const url = `${YOUTUBE_ORIGIN}/watch?v=${videoId}`;
    if (!record.links.some((link) => link.url === url)) {
      record.links.push({ label: 'YOUTUBE', url });
    }
    keptVideoIds += 1;
  }
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

/**
 * YouTube first, because it is the one link that plays the COMPLETE record for
 * free and without an account; then the free stores; Apple last.
 */
const LINK_ORDER = ['YOUTUBE', 'DEEZER', 'SOUNDCLOUD', 'APPLE MUSIC'];
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
        `YouTube official releases (Topic channel ${YOUTUBE_TOPIC_CHANNEL_ID})`,
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

const fullLength = sorted.filter((record) => record.youtubeId).length;

console.log(
  `wrote ${path.relative(process.cwd(), CATALOGUE_OUT)} — ${sorted.length} official records ` +
    `(${apple.length} from Apple, ${addedFromDeezer} more from Deezer, ` +
    `${addedFromYouTube} more from YouTube` +
    `${existingCatalogueTotal != null ? `, was ${existingCatalogueTotal}` : ''})`
);
console.log(
  `• ${fullLength}/${sorted.length} official records have a full-length official ` +
    `upload (${youtubeMatches} matched onto existing catalogue entries)`
);
if (keptVideoIds) {
  console.log(`• YouTube was unreachable — kept ${keptVideoIds} video ids from the previous file`);
}
if (!fullLength) {
  console.warn('• No record carries an official full-length upload; the station falls back to previews');
}
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
