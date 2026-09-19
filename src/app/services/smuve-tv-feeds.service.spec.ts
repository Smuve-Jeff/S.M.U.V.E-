import { TestBed } from '@angular/core/testing';
import {
  SMUVE_TV_LIVE_FEEDS,
  SmuveTvFeedsService,
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
});
