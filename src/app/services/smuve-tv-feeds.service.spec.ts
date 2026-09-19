import { readFileSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';
import { TestBed } from '@angular/core/testing';
import {
  CATALOGUE_PATH,
  MASTER_MANIFEST_PATH,
  SMUVE_TV_LIVE_FEEDS,
  SmuveJeffCatalogueRecord,
  SmuveTvFeedsService,
  SmuveTvRadioTrack,
  normalizeMatchKey,
  seededRandom,
  shuffleBag,
  trackLength,
} from './smuve-tv-feeds.service';
import { SMUVE_TV_CHANNELS } from './smuve-tv.service';

/** One canned entry in Apple's catalogue payload shape. */
const appleSong = (overrides: Record<string, unknown> = {}) => ({
  wrapperType: 'track',
  kind: 'song',
  trackId: 1,
  trackName: 'Official Record',
  artistName: 'Smuve Jeff',
  collectionName: 'Official Album',
  previewUrl: 'https://example.test/preview.m4a',
  releaseDate: '2024-05-02T12:00:00Z',
  primaryGenreName: 'Hip-Hop/Rap',
  artworkUrl100: 'https://example.test/art.jpg',
  trackViewUrl: 'https://example.test/album',
  ...overrides,
});

describe('SmuveTvFeedsService', () => {
  let service: SmuveTvFeedsService;
  let fetchMock: jest.Mock;
  let originalFetch: typeof fetch | undefined;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(SmuveTvFeedsService);

    originalFetch = global.fetch;
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    if (originalFetch) global.fetch = originalFetch;
    else delete (global as { fetch?: unknown }).fetch;
  });

  describe('live feed catalogue', () => {
    it('exposes only https manifests, each with named provenance', () => {
      expect(SMUVE_TV_LIVE_FEEDS.length).toBeGreaterThan(0);
      for (const feed of SMUVE_TV_LIVE_FEEDS) {
        expect(feed.url).toMatch(/^https:\/\/\S+\.m3u8$/);
        expect(feed.operator.trim().length).toBeGreaterThan(0);
        expect(feed.source.trim().length).toBeGreaterThan(0);
        expect(['news', 'entertainment', 'music']).toContain(feed.genre);
      }
    });

    it('never lists the same feed id twice', () => {
      const ids = SMUVE_TV_LIVE_FEEDS.map((feed) => feed.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('tunes every station in the line-up to a listed feed', () => {
      for (const channel of SMUVE_TV_CHANNELS) {
        const feed = service.feedForStation(channel.id);
        expect(feed).not.toBeNull();
        // The mapping must point at something actually in the catalogue.
        expect(SMUVE_TV_LIVE_FEEDS).toContainEqual(feed);
      }
    });

    it('returns null rather than throwing for unknown ids', () => {
      expect(service.feedById('')).toBeNull();
      expect(service.feedById('does-not-exist')).toBeNull();
      expect(service.feedForStation('does-not-exist')).toBeNull();
    });

    it('filters the catalogue by genre', () => {
      const music = service.feedsIn('music');
      expect(music.length).toBeGreaterThan(0);
      expect(music.every((feed) => feed.genre === 'music')).toBe(true);
    });
  });

  describe('official catalogue', () => {
    it('reads the artist by id, which the public text search does not', async () => {
      fetchMock.mockResolvedValue({ ok: true, json: async () => ({ results: [] }) });

      await service.loadOfficialCatalogue();

      const [url] = fetchMock.mock.calls[0] as [string];
      expect(url).toContain('itunes.apple.com/lookup');
      expect(url).toContain('entity=song');
    });

    it('maps Apple payloads onto the radio track shape', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ results: [appleSong()] }),
      });

      const tracks = await service.loadOfficialCatalogue();

      expect(tracks).toEqual([
        {
          id: 'apple-1',
          catalogId: '1',
          title: 'Official Record',
          artist: 'Smuve Jeff',
          album: 'Official Album',
          url: 'https://example.test/preview.m4a',
          preview: true,
          durationMs: undefined,
          year: '2024',
          genre: 'Hip-Hop/Rap',
          artworkUrl: 'https://example.test/art.jpg',
          linkUrl: 'https://example.test/album',
        },
      ]);
    });

    it('keeps Apple\'s real running time, which the 30s preview does not show', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({
          results: [appleSong({ trackTimeMillis: 212_000 })],
        }),
      });

      const [catalogueTrack] = await service.loadOfficialCatalogue();

      expect(catalogueTrack.durationMs).toBe(212_000);
      expect(trackLength(catalogueTrack.durationMs)).toBe('3:32');
    });

    it('resolves to an empty list when the network is unavailable', async () => {
      fetchMock.mockRejectedValue(new Error('offline'));

      await expect(service.loadOfficialCatalogue()).resolves.toEqual([]);
    });

    it('resolves to an empty list on a non-OK response', async () => {
      fetchMock.mockResolvedValue({ ok: false, json: async () => ({}) });

      await expect(service.loadOfficialCatalogue()).resolves.toEqual([]);
    });

    it('resolves to an empty list on a malformed payload', async () => {
      fetchMock.mockResolvedValue({ ok: true, json: async () => null });

      await expect(service.loadOfficialCatalogue()).resolves.toEqual([]);
    });
  });

  describe('rotation helpers', () => {
    it('shuffles into a permutation that keeps every item exactly once', () => {
      const source = ['a', 'b', 'c', 'd', 'e', 'f'];

      const bag = shuffleBag(source, seededRandom(3));

      expect(bag).toHaveLength(source.length);
      expect([...bag].sort()).toEqual([...source].sort());
      // The input must not be mutated — the pool is shared state.
      expect(source).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
    });

    it('actually reorders rather than returning the input order', () => {
      const source = Array.from({ length: 12 }, (_unused, i) => i);
      const bag = shuffleBag(source, seededRandom(11));

      expect(bag).not.toEqual(source);
    });

    it('produces a different order from a different seed', () => {
      const source = Array.from({ length: 12 }, (_unused, i) => i);

      expect(shuffleBag(source, seededRandom(1))).not.toEqual(
        shuffleBag(source, seededRandom(2))
      );
    });

    it('handles empty and single-item bags without special-casing', () => {
      expect(shuffleBag([], seededRandom(1))).toEqual([]);
      expect(shuffleBag(['only'], seededRandom(1))).toEqual(['only']);
    });

    it('draws inside [0, 1) and is reproducible from its seed', () => {
      const a = seededRandom(42);
      const b = seededRandom(42);

      for (let i = 0; i < 500; i += 1) {
        const value = a();
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThan(1);
        expect(value).toBe(b());
      }
    });

    it('formats a running time without rounding the minutes up early', () => {
      expect(trackLength(59_000)).toBe('0:59');
      expect(trackLength(60_000)).toBe('1:00');
      expect(trackLength(212_000)).toBe('3:32');
      expect(trackLength(3_599_000)).toBe('59:59');
    });

    it('returns null for lengths it cannot trust', () => {
      expect(trackLength(undefined)).toBeNull();
      expect(trackLength(0)).toBeNull();
      expect(trackLength(-1)).toBeNull();
    });
  });

  describe('master manifest', () => {
    const CATALOGUE = 'https://app.test/';

    /** Two real-shaped catalogue entries to match masters against. */
    const catalogue = (): SmuveTvRadioTrack[] =>
      service.normalizeCatalogue([
        appleSong({ trackId: 11, trackName: 'Got Away (Remix)', collectionName: 'More Than Others' }),
        appleSong({ trackId: 22, trackName: 'Bless Yo Soul', collectionName: 'February 25th' }),
        appleSong({ trackId: 33, trackName: 'Same Name', collectionName: 'Album One' }),
        appleSong({ trackId: 44, trackName: 'Same Name', collectionName: 'Album Two' }),
      ]);

    it('folds case and punctuation but keeps remix markers', () => {
      expect(normalizeMatchKey('Got Away (Remix)')).toBe('got away remix');
      expect(normalizeMatchKey('  BLESS   yo soul ')).toBe('bless yo soul');
      expect(normalizeMatchKey('Lost My Mind (feat. ChrisO)')).toBe('lost my mind');
      expect(normalizeMatchKey(undefined)).toBe('');
    });

    it('matches a master to its catalogue record by track id', () => {
      const [master] = service.matchMasters(
        catalogue(),
        [{ trackId: 11, file: 'assets/audio/got-away.mp3' }],
        CATALOGUE
      );

      expect(master).toMatchObject({
        // The catalogue's own id, so the record never appears twice.
        id: 'apple-11',
        catalogId: '11',
        title: 'Got Away (Remix)',
        album: 'More Than Others',
        preview: false,
        url: 'https://app.test/assets/audio/got-away.mp3',
      });
    });

    it('falls back to title and album when no track id is given', () => {
      const [master] = service.matchMasters(
        catalogue(),
        [{ title: 'bless yo soul', album: 'February 25th', file: '/audio/bless.mp3' }],
        CATALOGUE
      );

      expect(master.id).toBe('apple-22');
      expect(master.url).toBe('https://app.test/audio/bless.mp3');
    });

    it('uses a title-only match when the catalogue holds one such record', () => {
      const [master] = service.matchMasters(
        catalogue(),
        [{ title: 'Bless Yo Soul', file: 'a.mp3' }],
        CATALOGUE
      );

      expect(master.id).toBe('apple-22');
    });

    it('refuses a title-only match when the name is ambiguous', () => {
      const [master] = service.matchMasters(
        catalogue(),
        [{ title: 'Same Name', file: 'a.mp3' }],
        CATALOGUE
      );

      // Guessing between two records would put the wrong audio on air.
      expect(master.id).not.toBe('apple-33');
      expect(master.id).not.toBe('apple-44');
      expect(master.title).toBe('Same Name');
      expect(master.preview).toBe(false);
    });

    it('keeps an unmatched recording as its own playable master', () => {
      const [master] = service.matchMasters(
        catalogue(),
        [{ title: 'Unreleased Demo', album: 'Sessions', file: 'https://cdn.test/demo.mp3' }],
        CATALOGUE
      );

      expect(master).toMatchObject({
        title: 'Unreleased Demo',
        album: 'Sessions',
        url: 'https://cdn.test/demo.mp3',
        preview: false,
      });
    });

    it('skips manifest lines with no file yet', () => {
      const resolved = service.matchMasters(
        catalogue(),
        [{ trackId: 11, file: '' }, { trackId: 22 }, { trackId: 33, file: '   ' }],
        CATALOGUE
      );

      expect(resolved).toEqual([]);
    });

    it('leaves absolute URLs untouched', () => {
      const [master] = service.matchMasters(
        catalogue(),
        [{ trackId: 11, file: 'https://bucket.example.test/song.m4a?v=2' }],
        CATALOGUE
      );

      expect(master.url).toBe('https://bucket.example.test/song.m4a?v=2');
    });

    it('carries the record\'s real running time onto the master', () => {
      const [master] = service.matchMasters(
        service.normalizeCatalogue([appleSong({ trackId: 5, trackTimeMillis: 212_000 })]),
        [{ trackId: 5, file: 'a.mp3' }],
        CATALOGUE
      );

      expect(master.durationMs).toBe(212_000);
      expect(trackLength(master.durationMs)).toBe('3:32');
    });

    it('returns nothing when the manifest has no playable lines', () => {
      expect(service.matchMasters(catalogue(), [], CATALOGUE)).toEqual([]);
    });

    it('reads the manifest from the path the app actually serves', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ masters: [{ trackId: 1, file: 'a.mp3' }] }),
      });

      const entries = await service.loadMasterManifest();

      expect(fetchMock).toHaveBeenCalledWith(MASTER_MANIFEST_PATH);
      expect(entries).toHaveLength(1);
    });

    it('treats a missing or malformed manifest as nothing hosted', async () => {
      fetchMock.mockResolvedValue({ ok: false, json: async () => ({}) });
      await expect(service.loadMasterManifest()).resolves.toEqual([]);

      fetchMock.mockResolvedValue({ ok: true, json: async () => null });
      await expect(service.loadMasterManifest()).resolves.toEqual([]);

      fetchMock.mockRejectedValue(new Error('offline'));
      await expect(service.loadMasterManifest()).resolves.toEqual([]);
    });
  });

  describe('catalogue normalization', () => {
    it('drops anything that is not a playable song', () => {
      const tracks = service.normalizeCatalogue([
        appleSong({ wrapperType: 'collection' }),
        appleSong({ kind: 'music-video' }),
        appleSong({ previewUrl: undefined }),
        appleSong({ trackName: undefined }),
        appleSong({ trackId: 2 }),
      ]);

      expect(tracks.map((track) => track.id)).toEqual(['apple-2']);
    });

    it('refuses records that are not this artist', () => {
      const tracks = service.normalizeCatalogue([
        appleSong({ artistName: 'Someone Else' }),
        appleSong({ trackId: 3, artistName: 'Smuve Jeff feat. PBA' }),
      ]);

      // A feature credit still carries the artist's name; a foreign record does not.
      expect(tracks.map((track) => track.id)).toEqual(['apple-3']);
    });

    it('de-duplicates repeated track ids', () => {
      const tracks = service.normalizeCatalogue([appleSong(), appleSong()]);
      expect(tracks).toHaveLength(1);
    });

    it('orders the rotation oldest first, so it reads like a catalogue', () => {
      const tracks = service.normalizeCatalogue([
        appleSong({ trackId: 9, releaseDate: '2025-03-01T00:00:00Z' }),
        appleSong({ trackId: 4, releaseDate: '2021-03-01T00:00:00Z' }),
        appleSong({ trackId: 7, releaseDate: '2023-03-01T00:00:00Z' }),
      ]);

      expect(tracks.map((track) => track.year)).toEqual(['2021', '2023', '2025']);
    });

    it('tolerates a missing running time rather than inventing one', () => {
      const tracks = service.normalizeCatalogue([
        appleSong({ trackTimeMillis: undefined }),
      ]);

      expect(tracks[0].durationMs).toBeUndefined();
      expect(trackLength(tracks[0].durationMs)).toBeNull();
    });

    it('tolerates entries missing a release date', () => {
      const tracks = service.normalizeCatalogue([
        appleSong({ trackId: 5, releaseDate: undefined }),
        appleSong({ trackId: 6, releaseDate: '2020-01-01T00:00:00Z' }),
      ]);

      expect(tracks).toHaveLength(2);
      expect(tracks[0].id).toBe('apple-6');
      expect(tracks[1].year).toBeUndefined();
    });

    it('falls back to "Single" when the payload has no collection name', () => {
      const tracks = service.normalizeCatalogue([
        appleSong({ collectionName: undefined }),
      ]);

      expect(tracks[0].album).toBe('Single');
    });

    it('returns nothing for an empty payload', () => {
      expect(service.normalizeCatalogue([])).toEqual([]);
    });
  });

  describe('complete catalogue', () => {
    /** One canned line of the committed catalogue file. */
    const catalogueRecord = (
      overrides: Partial<SmuveJeffCatalogueRecord> = {}
    ): SmuveJeffCatalogueRecord => ({
      id: 'apple-1',
      trackId: 1,
      title: 'Official Record',
      artist: 'Smuve Jeff',
      album: 'Official Album',
      year: '2024',
      durationMs: 180000,
      previewUrl: 'https://example.test/preview.m4a',
      artworkUrl: 'https://example.test/art.jpg',
      links: [{ label: 'DEEZER', url: 'https://deezer.test/1' }],
      ...overrides,
    });

    it('reads the catalogue from the path the app actually serves', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ records: [catalogueRecord()] }),
      });

      const records = await service.loadCatalogueRecords();

      expect(fetchMock).toHaveBeenCalledWith(CATALOGUE_PATH);
      expect(records).toHaveLength(1);
    });

    it('treats a missing or malformed catalogue as no catalogue', async () => {
      fetchMock.mockResolvedValue({ ok: false, json: async () => ({}) });
      await expect(service.loadCatalogueRecords()).resolves.toEqual([]);

      fetchMock.mockResolvedValue({ ok: true, json: async () => null });
      await expect(service.loadCatalogueRecords()).resolves.toEqual([]);

      fetchMock.mockRejectedValue(new Error('offline'));
      await expect(service.loadCatalogueRecords()).resolves.toEqual([]);
    });

    it('lists records Apple does not carry, which have no stream here', () => {
      const merged = service.mergeCatalogue(
        [
          catalogueRecord({ previewUrl: '' }),
          catalogueRecord({ id: 'apple-2', trackId: 2, title: 'Another' }),
        ],
        []
      );

      expect(merged).toHaveLength(2);
      const listed = merged.find((track) => track.id === 'apple-1');
      // No preview means no `url`, which is what keeps it out of the rotation.
      expect(listed?.url).toBeUndefined();
      expect(listed?.links).toEqual([
        { label: 'DEEZER', url: 'https://deezer.test/1' },
      ]);
      expect(merged.find((track) => track.id === 'apple-2')?.url).toBe(
        'https://example.test/preview.m4a'
      );
    });

    it('makes the first official link the row\'s single destination', () => {
      const merged = service.mergeCatalogue(
        [
          catalogueRecord({
            links: [
              { label: 'DEEZER', url: 'https://deezer.test/1' },
              { label: 'APPLE MUSIC', url: 'https://apple.test/1' },
            ],
          }),
        ],
        []
      );

      expect(merged[0].linkUrl).toBe('https://deezer.test/1');
      expect(merged[0].links).toHaveLength(2);
    });

    it('drops malformed link rows instead of rendering dead anchors', () => {
      const merged = service.mergeCatalogue(
        [
          catalogueRecord({
            links: [{ label: 'DEEZER' }, { url: 'https://deezer.test/1' }],
          }),
        ],
        []
      );

      expect(merged[0].links).toEqual([
        { label: 'OFFICIAL', url: 'https://deezer.test/1' },
      ]);
    });

    it('refreshes a record from the live catalogue rather than duplicating it', () => {
      const live = service.normalizeCatalogue([
        appleSong({
          trackId: 1,
          previewUrl: 'https://example.test/fresh.m4a',
          trackTimeMillis: 181000,
        }),
      ]);

      const merged = service.mergeCatalogue([catalogueRecord()], live);

      expect(merged).toHaveLength(1);
      expect(merged[0].url).toBe('https://example.test/fresh.m4a');
      expect(merged[0].durationMs).toBe(181000);
      // The committed file's links survive the refresh.
      expect(merged[0].links).toEqual([
        { label: 'DEEZER', url: 'https://deezer.test/1' },
      ]);
    });

    it('matches on track id even when the two sources name the album differently', () => {
      const live = service.normalizeCatalogue([
        appleSong({ trackId: 1, collectionName: 'Official Album (Mixtape)' }),
      ]);

      const merged = service.mergeCatalogue(
        [catalogueRecord({ album: 'Official Album' })],
        live
      );

      expect(merged).toHaveLength(1);
      expect(merged[0].url).toBe('https://example.test/preview.m4a');
    });

    it('appends a release the committed catalogue has never seen', () => {
      const live = service.normalizeCatalogue([
        appleSong({ trackId: 77, trackName: 'Brand New Single' }),
      ]);

      const merged = service.mergeCatalogue([catalogueRecord()], live);

      expect(merged).toHaveLength(2);
      // Both are 2024 releases, so they land either side of each other by title.
      expect(merged.map((track) => track.title).sort()).toEqual([
        'Brand New Single',
        'Official Record',
      ]);
    });

    it('orders the whole catalogue oldest first and sinks undated records', () => {
      const merged = service.mergeCatalogue(
        [
          catalogueRecord({ id: 'a', trackId: 10, year: '2025', title: 'New' }),
          catalogueRecord({ id: 'b', trackId: 11, year: '2020', title: 'Old' }),
          catalogueRecord({ id: 'c', trackId: 12, year: null, title: 'Undated' }),
        ],
        []
      );

      expect(merged.map((track) => track.title)).toEqual([
        'Old',
        'New',
        'Undated',
      ]);
    });

    it('skips catalogue entries with no title rather than inventing a row', () => {
      const merged = service.mergeCatalogue(
        [catalogueRecord({ title: '   ' }), catalogueRecord({ id: 'apple-2' })],
        []
      );

      expect(merged).toHaveLength(1);
    });

    it('keeps every record in the committed catalogue usable', () => {
      const file = resolvePath(
        __dirname,
        '../../assets/data/smuve-jeff-catalogue.json'
      );
      const payload = JSON.parse(readFileSync(file, 'utf8')) as {
        totalRecords?: number;
        records?: SmuveJeffCatalogueRecord[];
      };
      const records = payload.records ?? [];

      expect(payload.totalRecords).toBe(records.length);
      expect(records.length).toBeGreaterThanOrEqual(80);

      const ids = records.map((record) => record.id);
      expect(new Set(ids).size).toBe(ids.length);

      for (const record of records) {
        expect(record.title?.trim()).toBeTruthy();
        expect(record.durationMs).toBeGreaterThan(0);
        // Every record must be reachable somehow: a preview to play here, or an
        // official page holding the complete version.
        expect(Boolean(record.previewUrl) || Boolean(record.links?.length)).toBe(
          true
        );
      }

      // The records Apple does not carry are the whole reason the file exists.
      const catalogueOnly = records.filter((record) => !record.previewUrl);
      expect(catalogueOnly.length).toBeGreaterThan(0);
      for (const record of catalogueOnly) {
        expect(record.links?.length).toBeGreaterThan(0);
      }
    });
  });
});
