import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SmuveTvComponent } from './smuve-tv.component';
import {
  SMUVE_JEFF_RADIO_CHANNEL_ID,
  SmuveTvService,
} from '../../services/smuve-tv.service';
import { LibraryService } from '../../services/library.service';
import {
  SmuveTvFeedsService,
  seededRandom,
  trackLength,
} from '../../services/smuve-tv-feeds.service';

/** One canned entry in Apple's catalogue payload shape. */
const appleSong = (overrides: Record<string, unknown> = {}) => ({
  wrapperType: 'track',
  kind: 'song',
  trackId: 1,
  trackName: 'Official Record',
  artistName: 'Smuve Jeff',
  collectionName: 'Official Album',
  previewUrl: 'https://example.test/preview.m4a',
  releaseDate: '2024-01-01T12:00:00Z',
  primaryGenreName: 'Hip-Hop/Rap',
  trackViewUrl: 'https://example.test/album',
  ...overrides,
});

describe('SmuveTvComponent', () => {
  let fixture: ComponentFixture<SmuveTvComponent>;
  let component: SmuveTvComponent;
  let service: SmuveTvService;
  let feeds: SmuveTvFeedsService;
  let library: LibraryService;
  let fetchMock: jest.Mock;
  let originalFetch: typeof fetch | undefined;

  const template = readFileSync(
    join(__dirname, 'smuve-tv.component.html'),
    'utf8'
  );
  const styles = readFileSync(join(__dirname, 'smuve-tv.component.css'), 'utf8');

  beforeEach(async () => {
    // Station favourites persist, so a test that writes them would otherwise
    // seed the next test's component at construction time.
    localStorage.removeItem('smuve_tv_stations');

    /*
     * The official catalogue is a live network read performed at construction,
     * so it is pinned here: the suite must never depend on Apple being
     * reachable, nor on how fast it answers.
     */
    originalFetch = global.fetch;
    fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ results: [] }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    await TestBed.configureTestingModule({
      imports: [SmuveTvComponent],
    }).compileComponents();

    service = TestBed.inject(SmuveTvService);
    feeds = TestBed.inject(SmuveTvFeedsService);
    library = TestBed.inject(LibraryService);
    library.items.set([]);
    fixture = TestBed.createComponent(SmuveTvComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    fixture.destroy();
    if (originalFetch) global.fetch = originalFetch;
    else delete (global as { fetch?: unknown }).fetch;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('opens on the first station of the line-up, already on air', () => {
    expect(component.activeChannel().number).toBe(service.channels[0].number);
    expect(component.onAir().onAir).toBe(true);
    expect(component.progressPercent()).toBeGreaterThanOrEqual(0);
    expect(component.progressPercent()).toBeLessThanOrEqual(100);
    expect(component.guide()).toHaveLength(6);
  });

  it('shows every station in channel order on the rail', () => {
    const numbers = component.rail().map((entry) => entry.channel.number);

    expect(numbers).toEqual([...numbers].sort((a, b) => a - b));
    expect(component.rail().length).toBe(service.channels.length);
    expect(component.rail().every((entry) => entry.slot.onAir)).toBe(true);
  });

  it('tunes by channel number typed into the pad', () => {
    component.channelEntry.set('107');
    component.goToChannel();

    expect(component.activeChannel().number).toBe(107);
    expect(component.channelEntry()).toBe('');
  });

  it('ignores a number that is not on the line-up', () => {
    const before = component.activeChannelId();

    component.channelEntry.set('999');
    component.goToChannel();

    expect(component.activeChannelId()).toBe(before);
    expect(component.channelEntry()).toBe('');
  });

  it('drops a hiding filter when the number pad tunes off the shown line-up', () => {
    component.selectCategory('music');
    const target = service.channels.find((c) => c.number === 109)!;
    expect(component.visibleChannels().some((c) => c.id === target.id)).toBe(false);

    component.channelEntry.set('109');
    component.goToChannel();

    expect(component.activeCategory()).toBe('all');
    expect(component.visibleChannels().some((c) => c.id === target.id)).toBe(true);
  });

  it('zaps through the whole line-up and wraps in both directions', () => {
    const first = component.activeChannel();

    component.stepChannel(-1);
    expect(component.activeChannel().number).toBe(
      service.channels[service.channels.length - 1].number
    );

    component.stepChannel(1);
    expect(component.activeChannel().id).toBe(first.id);
  });

  it('filters the rail by category and clears the search', () => {
    component.searchQuery.set('vinyl');
    expect(component.visibleChannels().length).toBeLessThan(service.channels.length);

    component.selectCategory('cinema');

    expect(component.searchQuery()).toBe('');
    expect(
      component.visibleChannels().every((channel) => channel.category === 'cinema')
    ).toBe(true);
  });

  it('reports an empty rail when nothing matches', () => {
    component.searchQuery.set('zzzz-no-such-station');

    expect(component.rail()).toEqual([]);
  });

  it('opens a non-empty rail on every category chip', () => {
    // Every chip in the guide has to lead somewhere, or the catalog has a
    // category with nothing in it.
    for (const category of component.categories) {
      component.selectCategory(category.id);
      expect(component.rail().length).toBeGreaterThan(0);
    }
  });

  it('tunes the expanded categories by number, live feed included', () => {
    for (const category of ['news', 'sports', 'docs'] as const) {
      const target = service.channels.find(
        (channel) => channel.category === category
      );
      expect(target).toBeTruthy();

      component.channelEntry.set(String(target!.number));
      component.goToChannel();

      expect(component.activeChannel().id).toBe(target!.id);
      expect(component.activeFeedId()).toBe(
        feeds.feedForStation(target!.id)!.id
      );
    }
  });

  describe('favourites persistence', () => {
    const STORE_KEY = 'smuve_tv_stations';

    /** A second instance, so the constructor's read path runs again. */
    const reloaded = () => {
      const extra = TestBed.createComponent(SmuveTvComponent);
      extra.detectChanges();
      return extra;
    };

    it('writes MY STATIONS through so they survive a reload', () => {
      component.favorites.set([]);
      const id = component.activeChannelId();

      component.toggleFavorite();

      expect(JSON.parse(localStorage.getItem(STORE_KEY) ?? '[]')).toEqual([id]);

      const next = reloaded();
      try {
        expect(next.componentInstance.favorites()).toEqual([id]);
      } finally {
        next.destroy();
      }
    });

    it('treats a corrupted store as empty instead of throwing', () => {
      localStorage.setItem(STORE_KEY, '{not json');

      const next = reloaded();
      try {
        expect(next.componentInstance.favorites()).toEqual([]);
      } finally {
        next.destroy();
      }
    });

    it('drops station ids that are no longer on the line-up', () => {
      // Otherwise a retired station lingers in MY STATIONS as a phantom the
      // viewer can never clear.
      localStorage.setItem(
        STORE_KEY,
        JSON.stringify(['midnight-vinyl', 'retired-station', 42])
      );

      const next = reloaded();
      try {
        expect(next.componentInstance.favorites()).toEqual(['midnight-vinyl']);
      } finally {
        next.destroy();
      }
    });
  });

  describe('favourites', () => {
    it('adds and removes the tuned station', () => {
      const id = component.activeChannelId();

      component.toggleFavorite();
      expect(component.favorites()).toContain(id);

      component.toggleFavorite();
      expect(component.favorites()).not.toContain(id);
    });

    it('narrows the rail to my stations and can be switched back off', () => {
      const target = service.channels[2];
      component.favorites.set([target.id]);

      component.toggleFavoritesOnly();
      expect(component.visibleChannels().map((c) => c.id)).toEqual([target.id]);

      component.toggleFavoritesOnly();
      expect(component.visibleChannels().length).toBe(service.channels.length);
    });
  });

  describe('Smuve Jeff Radio', () => {
    const track = (overrides: Record<string, unknown> = {}) => ({
      id: 'radio-track-1',
      name: 'Authorized Single',
      addedAt: 1,
      url: 'data:audio/mpeg;base64,AAAA',
      artist: 'Smuve Jeff',
      official: true,
      mediaType: 'audio' as const,
      ...overrides,
    });

    it('only admits explicitly approved Smuve Jeff audio from the library', () => {
      library.items.set([
        track(),
        track({ id: 'other-artist', artist: 'Someone Else' }),
        track({ id: 'unapproved', official: false }),
        track({ id: 'video', mediaType: 'video' }),
      ]);

      expect(component.radioQueue().map((item) => item.id)).toEqual([
        'radio-track-1',
      ]);
    });

    it('enters a full-page radio broadcast and starts a random track', () => {
      library.items.set([
        track({ id: 'first' }),
        track({ id: 'second' }),
      ]);
      const audio = fixture.nativeElement.querySelector(
        '.tv-music-player'
      ) as HTMLAudioElement;
      const play = jest.spyOn(audio, 'play').mockResolvedValue(undefined);
      Object.defineProperty(audio, 'paused', { configurable: true, value: true });

      component.enterRadio();

      expect(component.radioStandalone()).toBe(true);
      expect(component.musicTrack()).not.toBeNull();
      expect(play).toHaveBeenCalledTimes(1);
      component.exitRadio();
      expect(component.radioStandalone()).toBe(false);
      play.mockRestore();
    });

    it('keeps the music surface off the page, with no controls at all', () => {
      /*
       * The module is the channel guide and the picture for the tuned station.
       * The artist radio survived as a transport and nothing more, so its panel
       * must not be on the page and its element must never grow native controls
       * — controls are how a page starts displaying a player.
       */
      expect(template).not.toContain('tv-music-channel');
      expect(template).not.toContain('tv-radio-standalone');
      expect(template).not.toContain('tv-music-now');
      expect(template).not.toContain('[controls]');
      expect(
        fixture.nativeElement.querySelector('.tv-music-channel')
      ).toBeNull();
      expect(
        fixture.nativeElement.querySelector('audio.tv-music-player')
      ).not.toBeNull();
    });

    it('queues a selected track without autoplay, then starts only on user action', () => {
      library.items.set([track()]);
      const audio = fixture.nativeElement.querySelector(
        '.tv-music-player'
      ) as HTMLAudioElement;
      const load = jest.spyOn(audio, 'load').mockImplementation(() => undefined);
      const play = jest.spyOn(audio, 'play').mockResolvedValue(undefined);
      Object.defineProperty(audio, 'paused', { configurable: true, value: true });

      component.selectMusicTrack(component.radioQueue()[0]);
      expect(audio.src).toContain('data:audio/mpeg');
      expect(load).toHaveBeenCalled();
      expect(play).not.toHaveBeenCalled();

      component.startMusic();
      expect(play).toHaveBeenCalledTimes(1);

      load.mockRestore();
      play.mockRestore();
    });

    it('leads with authorized masters, then the official catalogue', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ results: [appleSong(), appleSong({ trackId: 2 })] }),
      });
      library.items.set([track()]);

      await component.loadCatalogue();

      const queue = component.radioQueue();
      expect(queue).toHaveLength(3);
      // Masters first, so the catalogue never precedes the artist's own files.
      expect(queue[0]).toMatchObject({ id: 'radio-track-1', preview: false });
      expect(queue.slice(1).every((entry) => entry.preview)).toBe(true);
      expect(component.fullTrackCount()).toBe(1);
      expect(component.catalogueState()).toBe('ready');
    });

    it('labels previews as previews rather than implying full tracks', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ results: [appleSong()] }),
      });

      await component.loadCatalogue();

      expect(component.officialCatalogue()[0]).toMatchObject({
        title: 'Official Record',
        album: 'Official Album',
        year: '2024',
        preview: true,
      });
    });

    it('survives an unreachable catalogue and says so', async () => {
      fetchMock.mockRejectedValue(new Error('offline'));
      library.items.set([track()]);

      await component.loadCatalogue();

      expect(component.catalogueState()).toBe('unavailable');
      expect(component.officialCatalogue()).toEqual([]);
      // The channel still plays; only the fetched half is missing.
      expect(component.radioQueue().map((entry) => entry.id)).toEqual([
        'radio-track-1',
      ]);
    });

  });

  describe('the route into Smuve Jeff Radio', () => {
    const track = (overrides: Record<string, unknown> = {}) => ({
      id: 'radio-track-1',
      name: 'Authorized Single',
      addedAt: 1,
      url: 'data:audio/mpeg;base64,AAAA',
      artist: 'Smuve Jeff',
      official: true,
      mediaType: 'audio' as const,
      ...overrides,
    });

    const setPaused = (audio: HTMLAudioElement, value: boolean): void =>
      Object.defineProperty(audio, 'paused', { configurable: true, value });

    /** The hidden audio sink, stubbed the way the rest of the suite does it. */
    const player = () => {
      const audio = fixture.nativeElement.querySelector(
        '.tv-music-player'
      ) as HTMLAudioElement;
      jest.spyOn(audio, 'load').mockImplementation(() => undefined);
      const play = jest.spyOn(audio, 'play').mockResolvedValue(undefined);
      const pause = jest
        .spyOn(audio, 'pause')
        .mockImplementation(() => undefined);
      setPaused(audio, true);
      return { audio, play, pause };
    };

    it('ships as an ordinary station, so the guide itself is the route in', () => {
      const station = service.radioChannel;

      expect(station.id).toBe(SMUVE_JEFF_RADIO_CHANNEL_ID);
      expect(service.channels).toContain(station);
      expect(service.channelsIn('music')).toContainEqual(station);
      expect(service.channelByNumber(station.number)?.id).toBe(station.id);
      expect(service.search('smuve jeff radio')).toContainEqual(station);
      expect(component.rail().map((entry) => entry.channel.id)).toContain(
        station.id
      );
    });

    it('tunes in from that route and starts the rotation on the spot', () => {
      library.items.set([track({ id: 'first' }), track({ id: 'second' })]);
      const { audio, play } = player();

      component.tuneToRadio();

      expect(component.activeChannelId()).toBe(SMUVE_JEFF_RADIO_CHANNEL_ID);
      expect(component.isRadioStation()).toBe(true);
      expect(component.musicTrack()).not.toBeNull();
      expect(audio.getAttribute('src')).toContain('data:audio/mpeg');
      expect(play).toHaveBeenCalled();
    });

    it('hands the speaker back when the guide moves to another station', () => {
      library.items.set([track()]);
      const { audio, pause } = player();
      component.tuneToRadio();
      component.onMusicPlaying();
      expect(component.isMusicPlaying()).toBe(true);
      expect(component.isPlaying()).toBe(true);

      setPaused(audio, false);
      component.tuneTo(service.channels[0]);

      expect(component.isRadioStation()).toBe(false);
      expect(pause).toHaveBeenCalled();
      expect(component.isMusicPlaying()).toBe(false);
      expect(component.nowPlaying()).toBeNull();
    });

    it('drives the record from the transport while the station is tuned', () => {
      library.items.set([track()]);
      const { audio, pause } = player();
      component.tuneToRadio();
      component.onMusicPlaying();

      setPaused(audio, false);
      component.togglePlayback();

      expect(pause).toHaveBeenCalled();
      expect(component.isMusicPlaying()).toBe(false);
      expect(component.isPlaying()).toBe(false);
    });

    it('names the record on the lower third only while it is playing', () => {
      library.items.set([track()]);
      player();
      component.tuneToRadio();
      component.onMusicPlaying();
      fixture.detectChanges();

      expect(component.onAirLabel()).toBe('SMUVE JEFF RADIO \u00b7 FULL RECORD');
      expect(component.onAirTitle()).toBe('Authorized Single');
      expect(fixture.nativeElement.textContent).toContain('Authorized Single');

      component.onMusicPaused();
      fixture.detectChanges();

      expect(component.onAirTitle()).toBe(component.onAir().program.title);
      expect(fixture.nativeElement.textContent).not.toContain(
        'Authorized Single'
      );
    });

    it("reports the record's own clock rather than a slot's", () => {
      library.items.set([track()]);
      const { audio } = player();
      component.tuneToRadio();
      component.onMusicPlaying();

      Object.defineProperty(audio, 'currentTime', {
        configurable: true,
        value: 30,
      });
      Object.defineProperty(audio, 'duration', {
        configurable: true,
        value: 120,
      });
      component.onMusicTimeUpdate();

      expect(component.onAirProgress()).toBe(25);
      expect(component.onAirStart()).toBe('0:30');
      expect(component.onAirEnd()).toBe('2:00');
    });

    it('leaves every other station on its own linear schedule', () => {
      library.items.set([track()]);
      player();
      component.startMusic();
      component.onMusicPlaying();

      expect(component.isRadioStation()).toBe(false);
      expect(component.onAirTitle()).toBe(component.onAir().program.title);
      expect(component.onAirSubtitle()).toBe(component.onAir().program.subtitle);
    });

    it('shows that route as a fixed control in the guide', () => {
      expect(template).toContain('tuneToRadio()');
      expect(template).toContain('tv-featured');
      expect(fixture.nativeElement.querySelector('.tv-featured')).not.toBeNull();
    });

    /**
     * A record the station can only play a clip of — the catalogue shape for
     * everything Apple licenses, which is nearly the whole catalogue.
     */
    const catalogued = (overrides: Record<string, unknown> = {}) => ({
      id: 'apple-display-1',
      title: 'Display Record',
      artist: 'Smuve Jeff',
      album: 'Official Album',
      url: 'https://example.test/preview.m4a',
      preview: true,
      durationMs: 180000,
      youtubeId: 'IE-b3hMngfQ',
      ...overrides,
    });

    /** The display as it is rendered: the one frame inside the station's player. */
    const display = (): HTMLIFrameElement | null =>
      fixture.nativeElement.querySelector('.tv-player .tv-record iframe');

    it("puts the record on the station's screen once it is on air", () => {
      component.officialCatalogue.set([catalogued()]);
      const { pause } = player();

      component.tuneToRadio();
      // Nothing is on the screen until the channel's own audio confirms the
      // record: a frame raised before the sound would be a picture of a record
      // nobody is hearing.
      expect(component.fullRecordActive()).toBe(false);
      expect(display()).toBeNull();

      component.onMusicPlaying();
      fixture.detectChanges();

      const frame = display();
      expect(component.fullRecordActive()).toBe(true);
      expect(frame).not.toBeNull();
      expect(frame?.getAttribute('src')).toContain('/embed/IE-b3hMngfQ');
      // Muted, so every browser starts it without a gesture, and the station's
      // own player keeps the air — the record is never heard twice.
      expect(frame?.getAttribute('src')).toContain('mute=1');
      expect(pause).not.toHaveBeenCalled();
    });

    it('takes the record off the screen when the channel moves on', () => {
      component.officialCatalogue.set([catalogued()]);
      player();
      component.tuneToRadio();
      component.onMusicPlaying();
      fixture.detectChanges();
      expect(display()).not.toBeNull();

      component.tuneTo(service.channels[0]);
      fixture.detectChanges();

      expect(component.isRadioStation()).toBe(false);
      expect(component.fullRecordActive()).toBe(false);
      expect(display()).toBeNull();
    });

    it('keeps the record off the screen on every other station', () => {
      component.officialCatalogue.set([catalogued()]);
      player();
      component.startMusic();
      component.onMusicPlaying();
      fixture.detectChanges();

      expect(component.isRadioStation()).toBe(false);
      expect(component.fullRecordActive()).toBe(false);
      expect(display()).toBeNull();
    });

    it('keeps the station scene for a record with no official upload', () => {
      component.officialCatalogue.set([catalogued({ youtubeId: undefined })]);
      player();
      component.tuneToRadio();
      component.onMusicPlaying();
      fixture.detectChanges();

      expect(component.musicTrack()).not.toBeNull();
      expect(component.fullRecordActive()).toBe(false);
      expect(display()).toBeNull();
    });
  });

  describe('the complete official catalogue', () => {
    /**
     * Routes the station's independent reads by URL. `loadCatalogue` fetches the
     * committed catalogue and Apple's at the same time and the master manifest
     * straight after, so one canned payload would answer all three.
     */
    const routeReads = (options: {
      records?: unknown;
      apple?: unknown;
      masters?: unknown;
    }): void => {
      fetchMock.mockImplementation(async (url: unknown) => {
        const href = String(url);
        if (href.includes('smuve-jeff-catalogue')) {
          return options.records
            ? { ok: true, json: async () => options.records }
            : { ok: false, json: async () => ({}) };
        }
        if (href.includes('smuve-jeff-masters')) {
          return {
            ok: true,
            json: async () => options.masters ?? { masters: [] },
          };
        }
        return options.apple
          ? { ok: true, json: async () => options.apple }
          : { ok: false, json: async () => ({}) };
      });
    };

    const catalogueRecord = (overrides: Record<string, unknown> = {}) => ({
      id: 'apple-1',
      trackId: 1,
      title: 'Official Record',
      artist: 'Smuve Jeff',
      album: 'Official Album',
      year: '2024',
      durationMs: 180000,
      previewUrl: 'https://example.test/preview.m4a',
      links: [{ label: 'DEEZER', url: 'https://deezer.test/1' }],
      ...overrides,
    });

    /** A record Apple does not carry: listed and linked, but not playable here. */
    const appleMissingRecord = () =>
      catalogueRecord({
        id: 'dz-wyhh',
        trackId: null,
        title: 'Wyhh',
        album: 'The Black Label',
        durationMs: 144000,
        previewUrl: '',
        links: [
          { label: 'DEEZER', url: 'https://deezer.test/wyhh' },
          { label: 'SOUNDCLOUD', url: 'https://soundcloud.test/wyhh' },
        ],
      });

    it('holds the records Apple does not carry', async () => {
      routeReads({
        records: { records: [catalogueRecord(), appleMissingRecord()] },
        apple: { results: [appleSong()] },
      });

      await component.loadCatalogue();

      expect(
        component.officialCatalogue().map((track) => track.title).sort()
      ).toEqual(['Official Record', 'Wyhh']);
      expect(component.catalogueOnly().map((track) => track.title)).toEqual([
        'Wyhh',
      ]);
      expect(component.catalogueState()).toBe('ready');
    });

    it('keeps an unplayable record out of the rotation so the broadcast cannot stall', async () => {
      routeReads({
        records: { records: [catalogueRecord(), appleMissingRecord()] },
      });

      await component.loadCatalogue();

      expect(component.rotationPool().map((track) => track.id)).toEqual([
        'apple-1',
      ]);

      // Twenty draws must never deal a record the channel cannot play.
      const drawn = new Set<string>();
      for (let attempt = 0; attempt < 20; attempt += 1) {
        const next = component.nextRotationTrack();
        if (next) drawn.add(next.id);
      }
      expect([...drawn]).toEqual(['apple-1']);
    });

    it('stays quiet when every catalogued record needs an official page', async () => {
      routeReads({ records: { records: [appleMissingRecord()] } });

      await component.loadCatalogue();

      expect(component.rotationCount()).toBe(0);
      expect(component.catalogueOnly()).toHaveLength(1);
      // Starting a channel with nothing to play is a no-op, not a crash.
      expect(() => component.startMusic()).not.toThrow();
    });

    it('badges the record by what it actually is', async () => {
      routeReads({ records: { records: [catalogueRecord()] } });

      await component.loadCatalogue();

      const playable = component.rotationPool()[0];

      expect(component.trackBadge(playable)).toBe('PREVIEW');
      expect(component.trackBadge({ ...playable, preview: false })).toBe('FULL');
    });

    it("keeps a record that is not the artist's out of the channel", async () => {
      routeReads({
        records: {
          records: [
            catalogueRecord(),
            catalogueRecord({
              id: 'apple-2',
              trackId: 2,
              title: 'Somebody Else Song',
              artist: 'Another Artist',
            }),
          ],
        },
        // A hosted file credited elsewhere must not be relabelled as Smuve
        // Jeff's own recording either.
        masters: [
          {
            title: 'Foreign Master',
            artist: 'Another Artist',
            file: 'https://cdn.test/foreign.mp3',
          },
        ],
      });

      await component.loadCatalogue();

      expect(component.radioQueue().map((track) => track.title)).toEqual([
        'Official Record',
      ]);
      expect(component.rotationPool().map((track) => track.title)).toEqual([
        'Official Record',
      ]);
    });

    /** The player, silenced the way jsdom needs it silenced. */
    const player = (): HTMLAudioElement => {
      const audio = fixture.nativeElement.querySelector(
        '.tv-music-player'
      ) as HTMLAudioElement;
      jest.spyOn(audio, 'load').mockImplementation(() => undefined);
      Object.defineProperty(audio, 'paused', { configurable: true, value: true });
      jest.spyOn(audio, 'play').mockResolvedValue(undefined);
      return audio;
    };

    it('lists no queue and offers no links anywhere on the surface', async () => {
      routeReads({
        records: { records: [catalogueRecord(), appleMissingRecord()] },
      });

      await component.loadCatalogue();
      player();
      component.startMusic();
      fixture.detectChanges();

      // The module is a broadcast, not a browser: the record list and every
      // platform link are gone from the page entirely.
      expect(template).not.toContain('tv-music-list');
      expect(template).not.toContain('tv-music-link');
      expect(template).not.toContain('tv-music-more');
      expect(
        fixture.nativeElement.querySelectorAll('.tv-music-list, .tv-music-link')
      ).toHaveLength(0);
    });

    it('names no record anywhere on the page, playing or not', async () => {
      routeReads({ records: { records: [catalogueRecord()] } });

      await component.loadCatalogue();
      player();
      component.startMusic();
      fixture.detectChanges();
      // Queued is not playing: nothing may be named while the record is silent.
      expect(component.nowPlaying()).toBeNull();

      component.onMusicPlaying();
      fixture.detectChanges();

      // The transport knows what is on air; the page does not show any of it.
      expect(component.nowPlaying()?.title).toBe('Official Record');
      expect(fixture.nativeElement.textContent).not.toContain('Official Record');
      expect(
        fixture.nativeElement.querySelectorAll(
          '.tv-music-now, .tv-music-badge, .tv-music-list, .tv-music-link'
        )
      ).toHaveLength(0);

      component.onMusicPaused();
      expect(component.nowPlaying()).toBeNull();
    });

    it('brings the metadata down when a record ends', async () => {
      routeReads({ records: { records: [catalogueRecord()] } });

      await component.loadCatalogue();
      player();
      component.startMusic();
      component.onMusicPlaying();
      fixture.detectChanges();

      component.onMusicEnded();
      // The next record has not started yet, so the transport names nothing.
      expect(component.isMusicPlaying()).toBe(false);
      expect(component.nowPlaying()).toBeNull();
    });

    it('falls back to the live Apple catalogue when the file is missing', async () => {
      routeReads({ apple: { results: [appleSong()] } });

      await component.loadCatalogue();

      expect(component.catalogueState()).toBe('ready');
      expect(component.rotationCount()).toBe(1);
      expect(component.catalogueOnly()).toEqual([]);
    });
  });

  describe('24/7 rotation', () => {
    /** Puts `count` authorized full-length masters in the library. */
    const seedMasters = (count: number) => {
      library.items.set(
        Array.from({ length: count }, (_unused, index) => ({
          id: `master-${index}`,
          name: `Master ${index}`,
          addedAt: index,
          url: `data:audio/mpeg;base64,AAAA${index}`,
          artist: 'Smuve Jeff',
          official: true,
          mediaType: 'audio' as const,
        }))
      );
    };

    const silenceAudioElement = () => {
      const audio = fixture.nativeElement.querySelector(
        '.tv-music-player'
      ) as HTMLAudioElement;
      jest.spyOn(audio, 'load').mockImplementation(() => undefined);
      Object.defineProperty(audio, 'paused', { configurable: true, value: true });
      jest.spyOn(audio, 'play').mockResolvedValue(undefined);
      return audio;
    };

    beforeEach(() => {
      component.random = seededRandom(20260919);
    });

    it('plays full-length masters and shuts previews out entirely', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ results: [appleSong(), appleSong({ trackId: 2 })] }),
      });
      seedMasters(3);
      await component.loadCatalogue();

      const pool = component.rotationPool();

      expect(pool).toHaveLength(3);
      expect(pool.every((entry) => !entry.preview)).toBe(true);
      expect(component.playsFullLength()).toBe(true);
      // The catalogue is still listed for the record, but never rotates.
      expect(component.radioQueue().some((entry) => entry.preview)).toBe(true);
      expect(pool.some((entry) => entry.preview)).toBe(false);
    });

    it('falls back to the official previews when no masters exist', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ results: [appleSong(), appleSong({ trackId: 2 })] }),
      });
      await component.loadCatalogue();

      expect(component.playsFullLength()).toBe(false);
      expect(component.rotationPool()).toHaveLength(2);
    });

    it('plays every record exactly once per random pass', () => {
      seedMasters(6);
      const ids = new Set(component.rotationPool().map((entry) => entry.id));

      const pass = Array.from({ length: 6 }, () =>
        component.nextRotationTrack()?.id
      );

      // A shuffle bag, not independent picks: a cycle cannot repeat a record.
      expect(new Set(pass).size).toBe(6);
      expect(pass.every((id) => id !== undefined && ids.has(id))).toBe(true);
    });

    it('does not open a new pass with the record that just played', () => {
      seedMasters(4);
      component.random = seededRandom(7);

      // Drain a pass, note where it landed, then check the seam of the next one.
      let last: string | undefined;
      for (let i = 0; i < 4; i += 1) last = component.nextRotationTrack()?.id;
      const firstOfNextPass = component.nextRotationTrack()?.id;

      expect(firstOfNextPass).not.toBe(last);
    });

    it('is genuinely shuffled, not just resequenced from the top', () => {
      seedMasters(8);
      const sourceOrder = component.rotationPool().map((entry) => entry.id);

      const pass = Array.from({ length: 8 }, () =>
        component.nextRotationTrack()?.id
      );

      expect(pass).not.toEqual(sourceOrder);
    });

    it('honours the injected random source', () => {
      seedMasters(5);
      component.random = seededRandom(1);
      const first = Array.from({ length: 5 }, () => component.nextRotationTrack()?.id);

      component.random = seededRandom(1);
      const second = Array.from({ length: 5 }, () => component.nextRotationTrack()?.id);

      // Same seed, same order — which is what makes a shuffle testable at all.
      expect(second).toEqual(first);
    });

    it('rebuilds the pass and keeps broadcasting after a record ends', () => {
      seedMasters(2);
      silenceAudioElement();

      const first = component.nextRotationTrack();
      component.selectMusicTrack(first!, true);
      expect(component.musicTrack()?.id).toBe(first!.id);

      component.onMusicEnded();

      // The channel hands over to the other record without a gap.
      expect(component.musicTrack()?.id).not.toBe(first!.id);
      expect(component.musicTrack()).not.toBeNull();
    });

    it('steps past a record that will not play instead of stalling', () => {
      seedMasters(4);
      silenceAudioElement();
      component.selectMusicTrack(component.rotationPool()[0], true);
      const before = component.musicTrack()?.id;

      component.onMusicError();

      // A dead source cannot end a 24/7 stream; the rotation just moves on.
      expect(component.musicTrack()?.id).not.toBe(before);
      expect(component.musicError()).toBeNull();
    });

    it('gives up loudly after a run of failures rather than looping forever', () => {
      seedMasters(2);
      silenceAudioElement();

      for (let i = 0; i < 6; i += 1) component.onMusicError();

      expect(component.musicError()).toContain('allows audio');
    });

    it('only a confirmed playing event clears the failure guard', () => {
      seedMasters(2);
      silenceAudioElement();

      for (let i = 0; i < 4; i += 1) component.onMusicError();
      component.onMusicPlaying();

      // The guard reset, so the next failure is treated as the first again.
      component.onMusicError();
      expect(component.musicError()).toBeNull();
    });

    it('reports the running time of the record, not of the clip', () => {
      expect(trackLength(212_000)).toBe('3:32');
      expect(trackLength(92_395)).toBe('1:32');
      expect(trackLength(undefined)).toBeNull();
      expect(trackLength(0)).toBeNull();
    });

    it('carries Apple\'s real running time onto the queued track', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ results: [appleSong({ trackTimeMillis: 212_000 })] }),
      });

      await component.loadCatalogue();

      expect(component.officialCatalogue()[0].durationMs).toBe(212_000);
      expect(trackLength(component.officialCatalogue()[0].durationMs)).toBe('3:32');
    });

    it('drops records that leave the pool mid-pass', () => {
      seedMasters(3);
      component.nextRotationTrack();

      // The artist deletes a file the bag has not dealt out yet.
      library.items.set(
        library.items().filter((entry) => entry.id !== 'master-2')
      );

      const dealt = Array.from({ length: 2 }, () =>
        component.nextRotationTrack()?.id
      );

      expect(dealt).not.toContain('master-2');
    });

    it('says so rather than silently idling when nothing is queued', () => {
      component.advanceRotation();

      expect(component.musicError()).toContain('Nothing is queued');
    });
  });

  describe('hosted full-length masters', () => {
    /** Routes the two fetches the module makes: Apple's catalogue, then ours. */
    const routeFetch = (catalogueResults: unknown[], masters: unknown[]) => {
      fetchMock.mockImplementation(async (url: unknown) => {
        if (String(url).includes('itunes.apple.com')) {
          return { ok: true, json: async () => ({ results: catalogueResults }) };
        }
        return { ok: true, json: async () => ({ masters }) };
      });
    };

    it('puts a hosted master on air in place of its preview', async () => {
      routeFetch(
        [appleSong({ trackId: 11, trackName: 'Got Away (Remix)' })],
        [{ trackId: 11, file: 'https://cdn.test/got-away.mp3' }]
      );

      await component.loadCatalogue();

      expect(component.hostedMasters()).toHaveLength(1);
      expect(component.playsFullLength()).toBe(true);
      const queue = component.radioQueue();
      // One row per record, and it is the full-length one — not both.
      expect(queue).toHaveLength(1);
      expect(queue[0]).toMatchObject({
        id: 'apple-11',
        preview: false,
        url: 'https://cdn.test/got-away.mp3',
      });
    });

    it('keeps previews for the records that are not hosted yet', async () => {
      routeFetch(
        [appleSong({ trackId: 11 }), appleSong({ trackId: 22 })],
        [{ trackId: 11, file: 'https://cdn.test/a.mp3' }]
      );

      await component.loadCatalogue();

      const queue = component.radioQueue();
      expect(queue).toHaveLength(2);
      expect(queue.filter((track) => track.preview)).toHaveLength(1);
      expect(queue.find((track) => track.id === 'apple-22')?.preview).toBe(true);
    });

    it('stays on the official previews while nothing is hosted', async () => {
      routeFetch([appleSong({ trackId: 11 })], []);

      await component.loadCatalogue();

      expect(component.hostedMasters()).toEqual([]);
      expect(component.playsFullLength()).toBe(false);
      expect(component.rotationPool()).toHaveLength(1);
    });

    it('rotates only the full-length records once any exist', async () => {
      routeFetch(
        [appleSong({ trackId: 11 }), appleSong({ trackId: 22 })],
        [{ trackId: 11, file: 'https://cdn.test/a.mp3' }]
      );

      await component.loadCatalogue();

      const pool = component.rotationPool();
      expect(pool).toHaveLength(1);
      expect(pool[0]).toMatchObject({ id: 'apple-11', preview: false });
    });

    it('survives a manifest that is missing entirely', async () => {
      fetchMock.mockImplementation(async (url: unknown) => {
        if (String(url).includes('itunes.apple.com')) {
          return { ok: true, json: async () => ({ results: [appleSong({ trackId: 11 })] }) };
        }
        // A fresh clone has no manifest served yet.
        return { ok: false, json: async () => ({}) };
      });

      await component.loadCatalogue();

      expect(component.hostedMasters()).toEqual([]);
      expect(component.radioQueue()).toHaveLength(1);
    });
  });

  describe('live feeds', () => {
    it('gives every station a real, verified live feed', () => {
      for (const channel of service.channels) {
        /*
         * The artist's own station is the one deliberate exception. Its picture
         * is its own scene rather than a licensed channel, because the station's
         * audio is the artist's catalogue — a feed unmuted over the record would
         * put two songs on the module's single speaker.
         */
        if (channel.id === SMUVE_JEFF_RADIO_CHANNEL_ID) {
          expect(feeds.feedForStation(channel.id)).toBeNull();
          continue;
        }
        const feed = feeds.feedForStation(channel.id);
        expect(feed).not.toBeNull();
        expect(feed!.url).toMatch(/^https:\/\//);
        // Provenance is always stated, never implied.
        expect(feed!.operator.length).toBeGreaterThan(0);
        expect(feed!.source.length).toBeGreaterThan(0);
      }
    });

    it('opens on the first station already tuned to that station\'s feed', () => {
      expect(component.activeFeedId()).toBe(
        feeds.feedForStation(service.channels[0].id)!.id
      );
      expect(component.activeFeed()?.name).toBeDefined();
    });

    it('re-tunes the feed when the station changes', () => {
      const next = service.channels[2];

      component.tuneTo(next);

      expect(component.activeFeedId()).toBe(feeds.feedForStation(next.id)!.id);
    });

    it('can be switched back to the station\'s own scene', () => {
      component.chooseFeed('');

      expect(component.activeFeed()).toBeNull();
      // With no feed the mute button falls back to the synthesised bed.
      expect(component.audioSource()).toBe('bed');
    });

    it('hands the mute button to the feed once it is actually playing', () => {
      expect(component.audioSource()).toBe('bed');
      expect(component.audioTitle()).toContain('audio bed');

      component.feedReady.set(true);

      expect(component.audioSource()).toBe('feed');
      expect(component.audioTitle()).toContain('live feed');
      // The feed is always unmutable; only the bed depends on Web Audio.
      expect(component.audioUsable()).toBe(true);
    });

    it('falls back to the scene, naming the feed that failed', () => {
      component.feedReady.set(true);
      const name = component.activeFeed()!.name;

      component.onFeedError();

      expect(component.feedReady()).toBe(false);
      expect(component.feedError()).toContain(name);
    });

    it('does not ship hls.js in the initial bundle', () => {
      const source = readFileSync(
        join(__dirname, 'smuve-tv.component.ts'),
        'utf8'
      );

      // A static import would pull the player into the first load for every
      // route; only Safari and Android fall through to the dynamic one anyway.
      expect(source).not.toContain("from 'hls.js'");
      expect(source).toContain("await import('hls.js')");
    });
  });

  describe('transport', () => {
    it('pauses and resumes the station', () => {
      expect(component.isPlaying()).toBe(true);

      component.togglePlayback();
      expect(component.isPlaying()).toBe(false);

      component.togglePlayback();
      expect(component.isPlaying()).toBe(true);
    });

    it('pausing a station also silences it, when a bed is running', () => {
      // "PAUSED" over a still-audible station would be a lie about what the
      // surface is doing. With no bed up (jsdom, or the viewer never enabled
      // it) both calls must still be no-ops rather than throws.
      component.toggleAudio();
      const wasOn = component.audioOn();

      expect(() => component.togglePlayback()).not.toThrow();
      expect(() => component.togglePlayback()).not.toThrow();
      expect(component.isPlaying()).toBe(true);
      expect(component.audioOn()).toBe(wasOn);
    });

    it('keeps the station audio bed strictly opt-in and reversible', () => {
      // A TV that makes noise the moment it opens is hostile: the bed starts
      // off, comes up only on an explicit press, and goes back down again. A
      // browser with no Web Audio must no-op instead of throwing.
      expect(component.audioOn()).toBe(false);

      expect(() => component.toggleAudio()).not.toThrow();
      expect(() => component.toggleAudio()).not.toThrow();

      expect(component.audioOn()).toBe(false);
    });

    it('sets and clears fullscreen without ever throwing', async () => {
      await expect(component.toggleFullscreen()).resolves.toBeUndefined();
    });
  });

  describe('touch and keyboard', () => {
    it('zaps on a committed horizontal swipe only', () => {
      const before = component.activeChannelId();
      const touch = (x: number, y: number) =>
        ({ touches: [{ clientX: x, clientY: y }], changedTouches: [{ clientX: x, clientY: y }] }) as unknown as TouchEvent;

      // Vertical page scroll must never change station.
      component.onSwipeStart(touch(200, 200));
      component.onSwipeEnd(touch(210, 320));
      expect(component.activeChannelId()).toBe(before);

      // A short horizontal drag is a tap, not a swipe.
      component.onSwipeStart(touch(200, 200));
      component.onSwipeEnd(touch(220, 202));
      expect(component.activeChannelId()).toBe(before);

      // Left swipe advances.
      component.onSwipeStart(touch(220, 200));
      component.onSwipeEnd(touch(120, 205));
      expect(component.activeChannelId()).not.toBe(before);
    });

    it('ignores swipes that never started', () => {
      const before = component.activeChannelId();
      const end = {
        changedTouches: [{ clientX: 10, clientY: 10 }],
      } as unknown as TouchEvent;

      component.onSwipeEnd(end);

      expect(component.activeChannelId()).toBe(before);
    });

    it('zaps and pauses from the keyboard', () => {
      const before = component.activeChannelId();

      component.onKeydown(
        new KeyboardEvent('keydown', { key: 'ArrowDown', cancelable: true })
      );
      expect(component.activeChannelId()).not.toBe(before);

      component.onKeydown(
        new KeyboardEvent('keydown', { key: ' ', cancelable: true })
      );
      expect(component.isPlaying()).toBe(false);
    });

    it('leaves Space and the arrow keys to the control that has focus', () => {
      // A shortcut must never outrank the control the viewer tabbed to: Space
      // activates a focused button, and the arrows belong to a focused listbox.
      const button = document.createElement('button');
      const press = (key: string) => {
        const event = new KeyboardEvent('keydown', { key, cancelable: true });
        Object.defineProperty(event, 'target', { value: button });
        component.onKeydown(event);
        return event;
      };
      const before = component.activeChannelId();

      expect(press(' ').defaultPrevented).toBe(false);
      expect(component.isPlaying()).toBe(true);

      press('ArrowDown');
      expect(component.activeChannelId()).toBe(before);

      // Escape stays global: the surface must be escapable from anywhere in it.
      const emitSpy = jest.spyOn(component.exit, 'emit');
      press('Escape');
      expect(emitSpy).toHaveBeenCalled();
      emitSpy.mockRestore();
    });

    describe('reduced motion', () => {
      /** A 2D context that only counts how often the scene is repainted. */
      const recordingContext = () => {
        let calls = 0;
        const gradient = { addColorStop: () => undefined };
        const ctx: Record<string, unknown> = {
          createRadialGradient: () => gradient,
          createLinearGradient: () => gradient,
        };
        for (const method of [
          'clearRect', 'fillRect', 'save', 'restore', 'beginPath', 'arc',
          'ellipse', 'stroke', 'fill', 'moveTo', 'lineTo', 'strokeRect',
        ]) {
          ctx[method] = () => {
            calls += 1;
          };
        }
        return { ctx: ctx as unknown as CanvasRenderingContext2D, calls: () => calls };
      };

      const setReducedMotion = (matches: boolean) => {
        const original = window.matchMedia;
        Object.defineProperty(window, 'matchMedia', {
          configurable: true,
          writable: true,
          value: (query: string) => ({
            matches: matches && query.includes('prefers-reduced-motion'),
            media: query,
            onchange: null,
            addListener: () => undefined,
            removeListener: () => undefined,
            addEventListener: () => undefined,
            removeEventListener: () => undefined,
            dispatchEvent: () => false,
          }),
        });
        return () =>
          Object.defineProperty(window, 'matchMedia', {
            configurable: true,
            writable: true,
            value: original,
          });
      };

      const frameTick = (timestamp: number) =>
        (component as unknown as { renderFrame: (t: number) => void }).renderFrame(
          timestamp
        );

      it('freezes the scene to one frame per station when motion is reduced', () => {
        const draw = recordingContext();
        const getContext = jest
          .spyOn(HTMLCanvasElement.prototype, 'getContext')
          .mockReturnValue(draw.ctx as never);
        const restoreMedia = setReducedMotion(true);

        try {
          frameTick(16);
          const painted = draw.calls();
          expect(painted).toBeGreaterThan(0);

          // The picture is a still now: repainting it would be pure waste.
          frameTick(32);
          frameTick(48);
          expect(draw.calls()).toBe(painted);
        } finally {
          restoreMedia();
          getContext.mockRestore();
        }
      });

      it('keeps animating the scene when motion is allowed', () => {
        const draw = recordingContext();
        const getContext = jest
          .spyOn(HTMLCanvasElement.prototype, 'getContext')
          .mockReturnValue(draw.ctx as never);
        const restoreMedia = setReducedMotion(false);

        try {
          frameTick(16);
          const painted = draw.calls();

          frameTick(32);
          expect(draw.calls()).toBeGreaterThan(painted);
        } finally {
          restoreMedia();
          getContext.mockRestore();
        }
      });
    });

    it('leaves the surface on Escape', () => {
      // The surface answers Escape itself. It cannot rely on the parent's
      // pseudo-event, and it cannot rely on focus being inside the surface
      // either, so it listens at the document in the capture phase.
      const emitSpy = jest.spyOn(component.exit, 'emit');
      const event = new KeyboardEvent('keydown', {
        key: 'Escape',
        cancelable: true,
      });

      component.onKeydown(event);

      expect(emitSpy).toHaveBeenCalled();
      expect(event.defaultPrevented).toBe(true);
      emitSpy.mockRestore();
    });

    it('leaves typing in the channel pad and search box alone', () => {
      const before = component.activeChannelId();
      const input = document.createElement('input');
      const event = new KeyboardEvent('keydown', {
        key: 'ArrowDown',
        cancelable: true,
      });
      Object.defineProperty(event, 'target', { value: input });

      component.onKeydown(event);

      expect(component.activeChannelId()).toBe(before);
    });

    it('claims the transport keys even when focus never entered the surface', () => {
      /*
       * Measured in Chromium: entering the broadcast left
       * `document.activeElement` on <body>, so a host-bound listener saw no
       * keys at all and Space reached the app's command palette, which started
       * the Studio deck underneath the broadcast.
       */
      const press = (key: string) => {
        const event = new KeyboardEvent('keydown', {
          key,
          bubbles: true,
          cancelable: true,
        });
        document.body.dispatchEvent(event);
        return event;
      };

      const before = component.activeChannelId();
      press('ArrowDown');
      expect(component.activeChannelId()).not.toBe(before);

      expect(component.isPlaying()).toBe(true);
      const event = press(' ');
      expect(component.isPlaying()).toBe(false);
      // Claimed, or the palette would toggle the Studio deck on the same key.
      expect(event.defaultPrevented).toBe(true);

      const emitSpy = jest.spyOn(component.exit, 'emit');
      press('Escape');
      expect(emitSpy).toHaveBeenCalled();
      emitSpy.mockRestore();
    });

    it('takes the keyboard on entry and gives it back on destroy', () => {
      // A full-screen takeover owns the tab order while it is up.
      const surface = fixture.nativeElement.querySelector('.smuve-tv');
      expect(surface).toBeTruthy();
      expect(document.activeElement).toBe(surface);

      const before = component.activeChannelId();
      fixture.destroy();
      document.body.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'ArrowDown',
          bubbles: true,
          cancelable: true,
        })
      );

      // The listener is gone with the surface, so the app keeps its keys back.
      expect(component.activeChannelId()).toBe(before);
    });
  });

  it('offers its own labelled way out of the immersive surface', () => {
    // The surface owns the viewport, so the exit control has to be real, named,
    // and at the top of the DOM — not something reachable only by scrolling.
    const button = fixture.nativeElement.querySelector(
      '.tv-exit'
    ) as HTMLButtonElement | null;
    const emitSpy = jest.spyOn(component.exit, 'emit');

    expect(button).toBeTruthy();
    expect(button?.textContent ?? '').toContain('EXIT');
    expect(template).toContain('(click)="exit.emit()"');

    button?.click();
    expect(emitSpy).toHaveBeenCalled();
    emitSpy.mockRestore();
  });

  describe('template contract', () => {
    it('renders the broadcast natively and keeps the music surface off the page', () => {
      /*
       * The guide and the picture are the whole page: the catalogue panel, the
       * record metadata, and the third-party host that played a complete record
       * are all off it now, and nothing may quietly reintroduce them.
       */
      expect(template).not.toContain('tv-music-channel');
      expect(template).not.toContain('tv-music-full-host');
      expect(template).not.toContain('tv-music-full-btn');
      expect(template).not.toContain('tv-radio-standalone');
      expect(template).not.toContain('tv-music-import');
      expect(template).not.toContain('PLUTO');
      expect(template).not.toContain('pluto');
      expect(template).not.toContain('srcdoc');
      expect(template).toContain('<canvas #bed');

      /*
       * `src` is a DOM property, so binding it coerces null to the string
       * "null" and re-assigns the source after the track was queued — which
       * aborts playback. The element is driven imperatively instead.
       */
      expect(template).not.toContain('[src]="musicSource()"');
      expect(template).toContain('#music');
    });

    it('binds the touch handlers the swipe-to-zap gestures rely on', () => {
      expect(template).toContain('(touchstart)="onSwipeStart($event)"');
      expect(template).toContain('(touchend)="onSwipeEnd($event)"');
    });

    it('carries a guide, a station rail, and a transport', () => {
      expect(template).toContain('class="tv-rail"');
      expect(template).toContain('class="tv-guide"');
      expect(template).toContain('class="tv-controls"');
      expect(template).toContain('class="tv-station-list"');
      expect(template).toContain('class="tv-lower-third"');
    });

    it('labels every icon-only control for assistive tech', () => {
      const controlButtons = template.match(/class="tv-control[^"]*"/g) ?? [];
      expect(controlButtons.length).toBeGreaterThanOrEqual(6);
      expect((template.match(/aria-label=/g) ?? []).length).toBeGreaterThanOrEqual(
        10
      );
    });

    it('keeps touch targets at or above the 44px floor and scrolls on phones', () => {
      expect(styles).toContain('min-height: 44px');
      expect(styles).toContain('height: 48px');

      /*
       * Measured in Chromium, these sat at 40px — under the touch floor the rest
       * of the surface honoured. Pinned here so they cannot slide back.
       */
      for (const selector of ['.tv-tune input', '.tv-tune-go', '.tv-feed-picker select']) {
        const block = styles.slice(styles.indexOf(`${selector} {`));
        expect(block.slice(0, block.indexOf('}'))).toContain('44px');
      }
      expect(styles).toContain('touch-action: manipulation');
      expect(styles).toContain('overscroll-behavior: contain');
      expect(styles).toContain('@media (max-width: 900px)');
      expect(styles).toContain('@media (max-width: 420px)');
    });

    it('pins the stage rows so the player cannot be squeezed to nothing', () => {
      // Measured in Chromium at 412x915: as a shrunken flex child of the mobile
      // column, the player collapsed to zero height and its canvas backing
      // store came out 742x1 — a black rectangle where the picture belongs.
      expect(styles).toContain('.tv-stage > * {');
      expect(styles).toContain('flex: 0 0 auto');

      /*
       * The player must be pinned at every width, not only in the narrow-screen
       * media query. Measured at 1440x900 it was the one shrinkable stage row,
       * so it took the whole overflow and collapsed to 2px tall.
       */
      expect(styles).toContain('.tv-stage > .tv-player {');
    });

    it('owns the viewport as a flex column so nothing is pushed off-screen', () => {
      expect(styles).toContain('position: fixed');
      expect(styles).toContain('flex-direction: column');
      expect(styles).toContain('flex: 1 1 auto');
      expect(styles).toContain('min-height: 0');
      // The rail must never be reachable only by scrolling the whole page.
      expect(styles).toContain('.tv-rail');
      expect(styles).toContain('overflow-y: auto');
    });
  });
});
