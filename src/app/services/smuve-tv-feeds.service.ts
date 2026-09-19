import { Injectable } from '@angular/core';

/**
 * Live feeds and the first-party radio catalogue for S.M.U.V.E. TV.
 *
 * Two kinds of real content sit behind S.M.U.V.E. TV's stations:
 *
 * 1. `SMUVE_TV_LIVE_FEEDS` — free, publicly distributed live channels (public
 *    broadcasters and ad-supported FAST services). Every URL in this list was
 *    played in real Chromium before being added: hls.js reached `FRAG_LOADED`
 *    and buffered actual media. Channels that only parsed their manifest but
 *    404'd on fragments were removed, so nothing here is aspirational.
 *
 * 2. The official Smuve Jeff catalogue, read from Apple's public, CORS-enabled
 *    iTunes catalogue API. It returns the artist's real releases with the
 *    official preview audio Apple hosts. The previews are ~30 seconds — that is
 *    the licence those URLs carry, so the UI labels them as previews rather than
 *    pretending they are full tracks. Full-length audio comes from the artist's
 *    own authorized files, imported in the module.
 */

export type SmuveTvFeedGenre = 'news' | 'entertainment' | 'music';

export interface SmuveTvLiveFeed {
  id: string;
  name: string;
  /** HLS manifest. Verified to buffer and play in Chromium before inclusion. */
  url: string;
  genre: SmuveTvFeedGenre;
  /** Who actually operates the stream — surfaced so provenance is never implied. */
  operator: string;
  /** Where the stream is published free of charge. */
  source: string;
}

/**
 * Every entry below plays. The list is deliberately larger than the station
 * line-up so a station can be re-fed without anything being invented.
 */
export const SMUVE_TV_LIVE_FEEDS: readonly SmuveTvLiveFeed[] = [
  // ── Public broadcasters ────────────────────────────────
  {
    id: 'france24-en',
    name: 'FRANCE 24 ENGLISH',
    url: 'https://live.france24.com/hls/live/2037218/F24_EN_HI_HLS/master_5000.m3u8',
    genre: 'news',
    operator: 'France Médias Monde',
    source: 'Public broadcaster',
  },
  {
    id: 'dw-en',
    name: 'DW ENGLISH',
    url: 'https://dwamdstream102.akamaized.net/hls/live/2015525/dwstream102/master.m3u8',
    genre: 'news',
    operator: 'Deutsche Welle',
    source: 'Public broadcaster',
  },
  {
    id: 'euronews-en',
    name: 'EURONEWS ENGLISH',
    url: 'https://cdn-euronews.akamaized.net/live/eds/euronews-en/25002/index.m3u8',
    genre: 'news',
    operator: 'Euronews',
    source: 'Public broadcaster',
  },
  {
    id: 'aljazeera-en',
    name: 'AL JAZEERA ENGLISH',
    url: 'https://live-hls-apps-aje-fa.getaj.net/AJE/index.m3u8',
    genre: 'news',
    operator: 'Al Jazeera Media Network',
    source: 'Public broadcaster',
  },
  // ── Ad-supported free channels ─────────────────────────
  {
    id: 'abc-news-live',
    name: 'ABC NEWS LIVE',
    url: 'https://pb-0n3n2ej0w9pl9.akamaized.net/ABCNewsLive_Disney.m3u8',
    genre: 'news',
    operator: 'ABC News',
    source: 'Free ad-supported (FAST)',
  },
  {
    id: 'nbc-news-now',
    name: 'NBC NEWS NOW',
    url: 'https://xumo-drct-nbcnn-ir8ze.fast.nbcuni.com/live/master.m3u8',
    genre: 'news',
    operator: 'NBCUniversal',
    source: 'Free ad-supported (FAST)',
  },
  {
    id: 'red-bull-tv',
    name: 'RED BULL TV',
    url: 'https://rbmn-live.akamaized.net/hls/live/590964/BoRB-AT/master.m3u8',
    genre: 'entertainment',
    operator: 'Red Bull Media House',
    source: 'Free ad-supported (FAST)',
  },
  {
    id: 'tastemade',
    name: 'TASTEMADE',
    url: 'https://tastemade-tdint-rakuten.amagi.tv/playlist.m3u8',
    genre: 'entertainment',
    operator: 'Tastemade',
    source: 'Free ad-supported (FAST)',
  },
  // ── Stingray music channels (free ad-supported) ────────
  {
    id: 'stingray-greatest-hits',
    name: 'STINGRAY GREATEST HITS',
    url: 'https://lotus.stingray.com/manifest/ose-455ads-montreal/samsungtvplus/master.m3u8',
    genre: 'music',
    operator: 'Stingray',
    source: 'Free ad-supported (FAST)',
  },
  {
    id: 'stingray-hip-hop',
    name: 'STINGRAY HIP HOP',
    url: 'https://lotus.stingray.com/manifest/ose-107ads-montreal/samsungtvplus/master.m3u8',
    genre: 'music',
    operator: 'Stingray',
    source: 'Free ad-supported (FAST)',
  },
  {
    id: 'stingray-hip-hop-rnb',
    name: 'STINGRAY HIP HOP & R&B',
    url: 'https://lotus.stingray.com/manifest/ose-133ads-montreal/samsungtvplus/master.m3u8',
    genre: 'music',
    operator: 'Stingray',
    source: 'Free ad-supported (FAST)',
  },
  {
    id: 'stingray-soul-storm',
    name: 'STINGRAY SOUL STORM',
    url: 'https://lotus.stingray.com/manifest/ose-134ads-montreal/samsungtvplus/master.m3u8',
    genre: 'music',
    operator: 'Stingray',
    source: 'Free ad-supported (FAST)',
  },
  {
    id: 'stingray-classic-rock',
    name: 'STINGRAY CLASSIC ROCK',
    url: 'https://lotus.stingray.com/manifest/ose-101ads-montreal/samsungtvplus/master.m3u8',
    genre: 'music',
    operator: 'Stingray',
    source: 'Free ad-supported (FAST)',
  },
  {
    id: 'stingray-rock-alternative',
    name: 'STINGRAY ROCK ALTERNATIVE',
    url: 'https://lotus.stingray.com/manifest/ose-102ads-montreal/samsungtvplus/master.m3u8',
    genre: 'music',
    operator: 'Stingray',
    source: 'Free ad-supported (FAST)',
  },
  {
    id: 'stingray-smooth-jazz',
    name: 'STINGRAY SMOOTH JAZZ',
    url: 'https://lotus.stingray.com/manifest/ose-140ads-montreal/samsungtvplus/master.m3u8',
    genre: 'music',
    operator: 'Stingray',
    source: 'Free ad-supported (FAST)',
  },
  {
    id: 'stingray-classica',
    name: 'STINGRAY CLASSICA',
    url: 'https://lotus.stingray.com/manifest/classica-cla008-montreal/samsungtvplus/master.m3u8',
    genre: 'music',
    operator: 'Stingray',
    source: 'Free ad-supported (FAST)',
  },
  {
    id: 'stingray-movie-music',
    name: 'STINGRAY MOVIE MUSIC',
    url: 'https://lotus.stingray.com/manifest/cmusic-cme004-montreal/samsungtvplus/master.m3u8',
    genre: 'music',
    operator: 'Stingray',
    source: 'Free ad-supported (FAST)',
  },
  {
    id: 'stingray-peaceful-piano',
    name: 'STINGRAY PEACEFUL PIANO',
    url: 'https://lotus.stingray.com/manifest/ose-807ads-montreal/samsungtvplus/master.m3u8',
    genre: 'music',
    operator: 'Stingray',
    source: 'Free ad-supported (FAST)',
  },
  {
    id: 'stingray-focus',
    name: 'STINGRAY MUSIC FOR FOCUS',
    url: 'https://lotus.stingray.com/manifest/ose-814ads-montreal/samsungtvplus/master.m3u8',
    genre: 'music',
    operator: 'Stingray',
    source: 'Free ad-supported (FAST)',
  },
  {
    id: 'stingray-spa',
    name: 'STINGRAY THE SPA',
    url: 'https://lotus.stingray.com/manifest/ose-122ads-montreal/samsungtvplus/master.m3u8',
    genre: 'music',
    operator: 'Stingray',
    source: 'Free ad-supported (FAST)',
  },
  {
    id: 'stingray-easy-listening',
    name: 'STINGRAY EASY LISTENING',
    url: 'https://lotus.stingray.com/manifest/ose-137ads-montreal/samsungtvplus/master.m3u8',
    genre: 'music',
    operator: 'Stingray',
    source: 'Free ad-supported (FAST)',
  },
  {
    id: 'stingray-italo-disco',
    name: 'STINGRAY ITALO DISCO',
    url: 'https://lotus.stingray.com/manifest/ose-311ads-montreal/samsungtvplus/master.m3u8',
    genre: 'music',
    operator: 'Stingray',
    source: 'Free ad-supported (FAST)',
  },
  {
    id: 'stingray-90s',
    name: 'STINGRAY NOTHIN BUT 90s',
    url: 'https://lotus.stingray.com/manifest/ose-142ads-montreal/samsungtvplus/master.m3u8',
    genre: 'music',
    operator: 'Stingray',
    source: 'Free ad-supported (FAST)',
  },
  {
    id: 'stingray-y2k',
    name: 'STINGRAY Y2K',
    url: 'https://lotus.stingray.com/manifest/ose-232ads-montreal/samsungtvplus/master.m3u8',
    genre: 'music',
    operator: 'Stingray',
    source: 'Free ad-supported (FAST)',
  },
  {
    id: 'stingray-remember-80s',
    name: 'STINGRAY REMEMBER 80s',
    url: 'https://lotus.stingray.com/manifest/ose-128ads-montreal/samsungtvplus/master.m3u8',
    genre: 'music',
    operator: 'Stingray',
    source: 'Free ad-supported (FAST)',
  },
  {
    id: 'stingray-souvenirs',
    name: 'STINGRAY SOUVENIRS',
    url: 'https://lotus.stingray.com/manifest/ose-012ads-montreal/samsungtvplus/master.m3u8',
    genre: 'music',
    operator: 'Stingray',
    source: 'Free ad-supported (FAST)',
  },
  {
    id: 'stingray-pop-adult',
    name: 'STINGRAY POP ADULT',
    url: 'https://lotus.stingray.com/manifest/ose-104ads-montreal/samsungtvplus/master.m3u8',
    genre: 'music',
    operator: 'Stingray',
    source: 'Free ad-supported (FAST)',
  },
  {
    id: 'stingray-hot-country',
    name: 'STINGRAY HOT COUNTRY',
    url: 'https://lotus.stingray.com/manifest/ose-108ads-montreal/samsungtvplus/master.m3u8',
    genre: 'music',
    operator: 'Stingray',
    source: 'Free ad-supported (FAST)',
  },
  {
    id: 'stingray-tiktok-radio',
    name: 'STINGRAY TIKTOK RADIO',
    url: 'https://lotus.stingray.com/manifest/ose-185ads-montreal/samsungtvplus/master.m3u8',
    genre: 'music',
    operator: 'Stingray',
    source: 'Free ad-supported (FAST)',
  },
  {
    id: 'stingray-qello-concerts',
    name: 'STINGRAY QELLO CONCERTS',
    url: 'https://lotus.stingray.com/manifest/qello-qello001-montreal/samsungtvplus/master.m3u8',
    genre: 'music',
    operator: 'Stingray',
    source: 'Free ad-supported (FAST)',
  },
];

/**
 * Each station's default feed, chosen so the live channel matches the
 * station's own programming. Stations without an entry keep the native canvas
 * scene, which is why every station still works with the network offline.
 */
const STATION_FEEDS: Readonly<Record<string, string>> = {
  'smuve-one': 'stingray-greatest-hits',
  'producers-desk': 'stingray-focus',
  'neural-uplink': 'stingray-smooth-jazz',
  'midnight-vinyl': 'stingray-souvenirs',
  'sample-vault': 'stingray-hip-hop',
  'beat-battle-arena': 'stingray-hip-hop-rnb',
  'arcade-after-dark': 'stingray-tiktok-radio',
  'tha-spot-live': 'red-bull-tv',
  'cinema-engine-one': 'stingray-movie-music',
  'noir-channel': 'stingray-classic-rock',
  'deep-focus': 'stingray-spa',
  'smuve-classics': 'stingray-remember-80s',
  'mastering-suite': 'stingray-peaceful-piano',
  'bass-cathedral': 'stingray-soul-storm',
  'synth-city': 'stingray-italo-disco',
  'lofi-lounge': 'stingray-easy-listening',
  'live-stage-88': 'stingray-qello-concerts',
  'news-desk': 'france24-en',
  'story-mode': 'tastemade',
  'the-making-of': 'red-bull-tv',
};

/**
 * One official destination for a record's complete version.
 *
 * No platform hands a browser a playable full-length stream for this catalogue,
 * so the record's full version is reached on the platform that publishes it.
 * The label is carried rather than assumed, so the station never implies it is
 * sending a listener somewhere it is not.
 */
export interface SmuveTvRadioLink {
  label: string;
  url: string;
}

/**
 * One track on Smuve Jeff Radio. Imported did-you-buy-it files and the official
 * previews share a shape so the radio queue can rotate through both without
 * caring where a track came from.
 */
export interface SmuveTvRadioTrack {
  id: string;
  title: string;
  artist: string;
  album: string;
  /** Playable audio URL, when the track has a hosted stream (Apple's previews). */
  url?: string;
  /**
   * Audio the artist supplied directly. Held as a Blob and turned into an
   * object URL at play time, so the queue never leaks a revoked URL.
   */
  blob?: Blob;
  /**
   * True when this is not a full-length master the station streams.
   *
   * That covers both the ~30-second official preview Apple licenses for public
   * playback and a catalogue record nothing here can stream at all. Those two
   * are told apart by whether the track has any playable source: a record with
   * neither a hosted master nor a preview is listed and linked, never rotated.
   */
  preview: boolean;
  /**
   * The record's true running time, even when only a preview streams. Apple's
   * catalogue reports it, so the channel can show `3:32` next to a 30-second
   * clip and never imply the clip is the whole record.
   */
  durationMs?: number;
  /** Release year, when the catalogue knows it. */
  year?: string;
  genre?: string;
  artworkUrl?: string;
  /** Public catalogue page, so a listener can go and hear the whole record. */
  linkUrl?: string;
  /**
   * Every official page where the COMPLETE record plays, free route first.
   *
   * `linkUrl` stays the single "open this record" destination; this is the
   * fuller set, and it is what carries the catalogue's reach: the records Apple
   * does not list have no other route to their full version at all.
   */
  links?: readonly SmuveTvRadioLink[];
  /**
   * Apple's track id, when this track came from the official catalogue. It is
   * the join key between a catalogue entry and a hosted full-length master, so
   * the two never appear as separate rows for the same record.
   */
  catalogId?: string;
}

/** One line of `assets/data/smuve-jeff-masters.json`. */
export interface SmuveJeffMasterEntry {
  trackId?: number;
  title?: string;
  album?: string;
  /** The artist's own full-length audio. Empty until they host it. */
  file?: string;
}

/**
 * One record of `assets/data/smuve-jeff-catalogue.json`.
 *
 * That file is the artist's complete official catalogue — 94 records, built by
 * `scripts/build-music-manifest.mjs` from Apple's catalogue API unioned with
 * Deezer's, because Apple alone lists 78 of them. The rest are on no Apple
 * store, so nothing that only queries Apple can ever surface them.
 */
export interface SmuveJeffCatalogueRecord {
  /** Stable id, namespaced by the source that first supplied the record. */
  id?: string;
  /** Apple's track id, when Apple carries this record. The master join key. */
  trackId?: number | null;
  title?: string;
  artist?: string;
  album?: string;
  year?: string | null;
  durationMs?: number | null;
  /** Apple's official 30-second preview, when Apple carries this record. */
  previewUrl?: string;
  artworkUrl?: string | null;
  /** Official pages where the complete record plays. */
  links?: readonly { label?: string; url?: string }[];
}

/**
 * Oldest release first, so the channel reads like a catalogue rather than a
 * jumble.
 *
 * A record with no known release date is not "the oldest record": an empty
 * string sorts ahead of every year, which would put an undated track at the
 * front of the rotation. It sinks to the end instead.
 */
function byReleaseOrder(a: SmuveTvRadioTrack, b: SmuveTvRadioTrack): number {
  const byYear = (a.year ?? '9999').localeCompare(b.year ?? '9999');
  if (byYear !== 0) return byYear;
  return a.album.localeCompare(b.album) || a.title.localeCompare(b.title);
}

/**
 * A small deterministic generator (mulberry32).
 *
 * Used to pin the rotation in tests. At runtime the component uses
 * `Math.random`, so the channel's order is genuinely unpredictable session to
 * session — this exists so the *rules* around that randomness can be proved.
 */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * One full pass through `items` in a random order.
 *
 * Fisher–Yates, not `sort(() => random() - 0.5)`: the comparator trick is
 * measurably biased toward the original order, which on a radio rotation means
 * the same records keep coming up early.
 */
export function shuffleBag<T>(items: readonly T[], random: () => number): T[] {
  const bag = [...items];
  for (let i = bag.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [bag[i], bag[j]] = [bag[j], bag[i]];
  }
  return bag;
}

/** `m:ss` for a record's running time, or null when it is not known. */
export function trackLength(durationMs?: number): string | null {
  if (!durationMs || durationMs <= 0) return null;
  const totalSeconds = Math.round(durationMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  return `${minutes}:${String(totalSeconds % 60).padStart(2, '0')}`;
}

/** Apple's public catalogue id for Smuve Jeff. */
const SMUVE_JEFF_ARTIST_ID = 1517179702;

const CATALOGUE_ENDPOINT = 'https://itunes.apple.com/lookup';
const CATALOGUE_TIMEOUT_MS = 12000;

/** Where the artist's full-length master manifest lives in the built app. */
export const MASTER_MANIFEST_PATH = 'assets/data/smuve-jeff-masters.json';

/** Where the complete official catalogue lives in the built app. */
export const CATALOGUE_PATH = 'assets/data/smuve-jeff-catalogue.json';

/**
 * Folds the differences between a hand-written manifest and Apple's naming.
 *
 * Case and punctuation are dropped, and feature credits are removed, so
 * `Lost My Mind (feat. ChrisO)` and a typed `lost my mind` still find each
 * other. Remix and version markers are deliberately kept: `Got Away (Remix)` is
 * a different recording from `Got Away`, and quietly playing the wrong one
 * would be worse than leaving the record on its preview.
 */
export function normalizeMatchKey(value: string | undefined): string {
  return (value ?? '')
    .toLowerCase()
    .replace(/\((?:feat|ft|with)\.?[^)]*\)/g, ' ')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** The subset of Apple's track payload this service reads. */
interface AppleTrack {
  wrapperType?: string;
  kind?: string;
  trackId?: number;
  trackName?: string;
  artistName?: string;
  collectionName?: string;
  previewUrl?: string;
  trackTimeMillis?: number;
  releaseDate?: string;
  primaryGenreName?: string;
  artworkUrl100?: string;
  trackViewUrl?: string;
}

@Injectable({ providedIn: 'root' })
export class SmuveTvFeedsService {
  readonly feeds = SMUVE_TV_LIVE_FEEDS;

  /** The station's default live feed, or null when it renders its own scene. */
  feedForStation(stationId: string): SmuveTvLiveFeed | null {
    return this.feedById(STATION_FEEDS[stationId] ?? '');
  }

  feedById(id: string): SmuveTvLiveFeed | null {
    if (!id) return null;
    return this.feeds.find((feed) => feed.id === id) ?? null;
  }

  feedsIn(genre: SmuveTvFeedGenre): SmuveTvLiveFeed[] {
    return this.feeds.filter((feed) => feed.genre === genre);
  }

  /**
   * The artist's official releases, straight from Apple's public catalogue.
   *
   * Text search on Apple's API only surfaces a handful of the artist's records,
   * so this reads the artist's catalogue by id, which is the complete release
   * list. The endpoint sends `Access-Control-Allow-Origin: *`, so the browser
   * can call it directly — no proxy and no key.
   *
   * Never throws: a blocked network or a changed payload resolves to an empty
   * list so the module keeps working and the UI states why.
   */
  async loadOfficialCatalogue(): Promise<SmuveTvRadioTrack[]> {
    if (typeof fetch !== 'function') return [];

    const controller =
      typeof AbortController === 'function' ? new AbortController() : null;
    const timer = controller
      ? setTimeout(() => controller.abort(), CATALOGUE_TIMEOUT_MS)
      : null;

    try {
      const url =
        `${CATALOGUE_ENDPOINT}?id=${SMUVE_JEFF_ARTIST_ID}` +
        '&entity=song&limit=200&country=US';
      const response = await fetch(url, controller ? { signal: controller.signal } : {});
      if (!response.ok) return [];
      const payload = (await response.json()) as { results?: AppleTrack[] };
      return this.normalizeCatalogue(payload?.results ?? []);
    } catch {
      return [];
    } finally {
      if (timer !== null) clearTimeout(timer);
    }
  }

  /**
   * Reads the artist's full-length master manifest.
   *
   * Never throws: a missing or malformed manifest simply means nothing is
   * hosted yet, and the channel keeps playing the official previews.
   */
  async loadMasterManifest(): Promise<SmuveJeffMasterEntry[]> {
    if (typeof fetch !== 'function') return [];
    try {
      const response = await fetch(MASTER_MANIFEST_PATH);
      if (!response.ok) return [];
      const payload = (await response.json()) as { masters?: SmuveJeffMasterEntry[] };
      return Array.isArray(payload?.masters) ? payload.masters : [];
    } catch {
      return [];
    }
  }

  /**
   * Reads the committed catalogue of every official record.
   *
   * Never throws: a missing file degrades to the live Apple catalogue, which is
   * how the station worked before this file existed.
   */
  async loadCatalogueRecords(): Promise<SmuveJeffCatalogueRecord[]> {
    if (typeof fetch !== 'function') return [];
    try {
      const response = await fetch(CATALOGUE_PATH);
      if (!response.ok) return [];
      const payload = (await response.json()) as {
        records?: SmuveJeffCatalogueRecord[];
      };
      return Array.isArray(payload?.records) ? payload.records : [];
    } catch {
      return [];
    }
  }

  /**
   * The committed catalogue, refreshed with whatever Apple knows right now.
   *
   * The committed file is the base rather than a supplement, on purpose. It is
   * the only source holding the records Apple does not list at all — 16 of the
   * artist's 94 — and the Apple preview URLs it carries are the same long-lived
   * ones the API returns, so a blocked or reshaped Apple response costs
   * freshness instead of the catalogue. Live records are then laid over their
   * catalogue entry, and a record Apple has that the file has never seen (a
   * release newer than this build) is appended as-is, so a new single still
   * reaches the channel without regenerating anything.
   *
   * Pure, so the catalogue rules stay directly testable.
   */
  mergeCatalogue(
    records: readonly SmuveJeffCatalogueRecord[],
    live: readonly SmuveTvRadioTrack[]
  ): SmuveTvRadioTrack[] {
    const merged = new Map<string, SmuveTvRadioTrack>();
    const byCatalogId = new Map<string, SmuveTvRadioTrack>();
    const byTitleAlbum = new Map<string, SmuveTvRadioTrack>();
    const byUniqueTitle = new Map<string, SmuveTvRadioTrack | null>();

    records.forEach((record, index) => {
      const title = record.title?.trim();
      if (!title) return;
      const track = this.catalogueTrack(record, index);
      merged.set(track.id, track);
      if (track.catalogId) byCatalogId.set(track.catalogId, track);
      byTitleAlbum.set(
        `${normalizeMatchKey(title)}|${normalizeMatchKey(record.album)}`,
        track
      );
      // A title that repeats in the catalogue is remembered as ambiguous, so it
      // is never used on its own to join two records that merely share a name.
      const titleKey = normalizeMatchKey(title);
      byUniqueTitle.set(titleKey, byUniqueTitle.has(titleKey) ? null : track);
    });

    for (const track of live) {
      const match =
        (track.catalogId ? byCatalogId.get(track.catalogId) : undefined) ??
        byTitleAlbum.get(
          `${normalizeMatchKey(track.title)}|${normalizeMatchKey(track.album)}`
        ) ??
        byUniqueTitle.get(normalizeMatchKey(track.title)) ??
        undefined;

      if (!match) {
        merged.set(track.id, track);
        continue;
      }

      match.url = track.url;
      match.durationMs = track.durationMs ?? match.durationMs;
      match.artworkUrl = track.artworkUrl ?? match.artworkUrl;
      match.linkUrl = track.linkUrl ?? match.linkUrl;
      match.year = track.year ?? match.year;
      match.genre = track.genre ?? match.genre;
      match.album = track.album || match.album;
    }

    return [...merged.values()].sort(byReleaseOrder);
  }

  /** One catalogue record as a station track: listed always, playable if it can be. */
  private catalogueTrack(
    record: SmuveJeffCatalogueRecord,
    index: number
  ): SmuveTvRadioTrack {
    const links = (record.links ?? [])
      .filter((link): link is { label?: string; url: string } => !!link.url)
      .map((link) => ({ label: link.label ?? 'OFFICIAL', url: link.url }));

    return {
      id:
        record.id?.trim() ||
        `catalogue-${normalizeMatchKey(record.title) || index}`,
      catalogId: record.trackId != null ? String(record.trackId) : undefined,
      title: record.title?.trim() || 'Untitled',
      artist: record.artist?.trim() || 'Smuve Jeff',
      album: record.album?.trim() || 'Single',
      // Absent when Apple does not carry the record. That absence is the whole
      // distinction between a record the channel streams and one it only lists.
      url: record.previewUrl?.trim() || undefined,
      preview: true,
      durationMs: record.durationMs ?? undefined,
      year: record.year ?? undefined,
      artworkUrl: record.artworkUrl ?? undefined,
      linkUrl: links[0]?.url,
      links,
    };
  }

  /**
   * Attaches the artist's hosted recordings to the official catalogue.
   *
   * Matching is strict and ordered — track id, then title and album, then a
   * title that is unique in the catalogue — because attaching the wrong audio to
   * a record is worse than leaving that record on its preview. An entry that
   * matches nothing is still returned, so an unreleased recording the artist
   * hosts themselves is playable too.
   */
  matchMasters(
    catalogue: readonly SmuveTvRadioTrack[],
    entries: readonly SmuveJeffMasterEntry[],
    baseUrl = ''
  ): SmuveTvRadioTrack[] {
    const byCatalogId = new Map<string, SmuveTvRadioTrack>();
    const byTitleAlbum = new Map<string, SmuveTvRadioTrack>();
    const byUniqueTitle = new Map<string, SmuveTvRadioTrack>();
    const ambiguousTitles = new Set<string>();

    for (const track of catalogue) {
      if (track.catalogId) byCatalogId.set(track.catalogId, track);
      byTitleAlbum.set(
        `${normalizeMatchKey(track.title)}|${normalizeMatchKey(track.album)}`,
        track
      );
      const titleKey = normalizeMatchKey(track.title);
      if (byUniqueTitle.has(titleKey)) {
        ambiguousTitles.add(titleKey);
      } else {
        byUniqueTitle.set(titleKey, track);
      }
    }

    const resolved: SmuveTvRadioTrack[] = [];
    for (const entry of entries) {
      const file = entry.file?.trim();
      if (!file) continue;

      const match =
        (entry.trackId != null
          ? byCatalogId.get(String(entry.trackId))
          : undefined) ??
        byTitleAlbum.get(
          `${normalizeMatchKey(entry.title)}|${normalizeMatchKey(entry.album)}`
        ) ??
        // Title-only matching is allowed only when the manifest gives no album
        // and the catalogue holds exactly one record by that name.
        (!entry.album
          ? (() => {
              const key = normalizeMatchKey(entry.title);
              return ambiguousTitles.has(key) ? undefined : byUniqueTitle.get(key);
            })()
          : undefined);

      resolved.push({
        id: match?.id ?? `master-${normalizeMatchKey(entry.title) || resolved.length}`,
        catalogId: match?.catalogId,
        title: match?.title ?? entry.title?.trim() ?? 'Untitled',
        artist: match?.artist ?? 'Smuve Jeff',
        album: match?.album ?? entry.album?.trim() ?? 'Authorized master files',
        url: this.resolveFileUrl(file, baseUrl),
        preview: false,
        durationMs: match?.durationMs,
        year: match?.year,
        genre: match?.genre,
        artworkUrl: match?.artworkUrl,
        linkUrl: match?.linkUrl,
      });
    }
    return resolved;
  }

  /**
   * Absolute URLs are used exactly as written; anything else is resolved
   * against the app, so a same-origin `/assets/audio/…` path works on Render
   * without the artist having to know the deployment's hostname.
   */
  private resolveFileUrl(file: string, baseUrl: string): string {
    if (/^https?:\/\//i.test(file)) return file;
    const base =
      baseUrl || (typeof document !== 'undefined' ? document.baseURI : undefined);
    if (!base) return file;
    try {
      return new URL(file, base).toString();
    } catch {
      return file;
    }
  }

  /**
   * Reduces Apple's payload to the radio queue's shape.
   *
   * Pure, so the catalogue rules are directly testable: only real songs, only
   * those with playable audio, attributed to this artist alone, deduplicated by
   * track id, and ordered oldest-first so the station reads like a catalogue
   * rather than a jumble.
   */
  normalizeCatalogue(results: AppleTrack[]): SmuveTvRadioTrack[] {
    const byId = new Map<string, SmuveTvRadioTrack>();

    for (const entry of results) {
      if (entry.wrapperType !== 'track' || entry.kind !== 'song') continue;
      const audioUrl = entry.previewUrl;
      const title = entry.trackName?.trim();
      const artist = entry.artistName?.trim();
      if (!audioUrl || !title || !artist) continue;
      // A feature credit still contains the artist's name; a compilation
      // appearance that does not is somebody else's record.
      if (!artist.toLowerCase().includes('smuve jeff')) continue;

      const id = String(entry.trackId ?? `${artist}-${title}`);
      if (byId.has(id)) continue;

      byId.set(id, {
        id: `apple-${id}`,
        catalogId: String(entry.trackId),
        title,
        artist,
        album: entry.collectionName?.trim() || 'Single',
        url: audioUrl,
        preview: true,
        durationMs: entry.trackTimeMillis,
        year: entry.releaseDate?.slice(0, 4),
        genre: entry.primaryGenreName,
        artworkUrl: entry.artworkUrl100,
        linkUrl: entry.trackViewUrl,
      });
    }

    return [...byId.values()].sort(byReleaseOrder);
  }
}
