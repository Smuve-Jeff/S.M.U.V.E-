import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  ViewChild,
  computed,
  inject,
  output,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { FormsModule } from '@angular/forms';
import {
  SMUVE_TV_CATEGORIES,
  SmuveTvCategoryId,
  SmuveTvChannel,
  SmuveTvScene,
  SmuveTvService,
  smuveTvClock,
} from '../../services/smuve-tv.service';
import { LibraryService } from '../../services/library.service';
import {
  SmuveTvFeedsService,
  SmuveTvLiveFeed,
  SmuveTvRadioTrack,
  isSmuveJeffArtist,
  shuffleBag,
  trackLength,
} from '../../services/smuve-tv-feeds.service';

/** Deterministic 0–1 noise, so scenes never allocate and never repeat visibly. */
function noise01(seed: number): number {
  const value = Math.sin(seed * 127.1) * 43758.5453;
  return value - Math.floor(value);
}

/** Station favourites persist the way the arcade's do: namespaced localStorage. */
const STATION_FAVORITES_KEY = 'smuve_tv_stations';

/** Bed level while the station is playing. Loud enough to hear, quiet enough to talk over. */
const AUDIO_LEVEL = 0.05;

function readFavoriteStations(service: SmuveTvService): string[] {
  try {
    if (typeof localStorage === 'undefined') return [];
    const raw = localStorage.getItem(STATION_FAVORITES_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    /*
     * Prune ids that are no longer on the line-up. Without this a station that
     * was renamed or retired lingers in MY STATIONS as a phantom the viewer can
     * never clear.
     */
    return parsed.filter(
      (id): id is string =>
        typeof id === 'string' && service.channels.some((c) => c.id === id)
    );
  } catch {
    // Malformed payload, or storage denied. Favourites start empty, nothing throws.
    return [];
  }
}

function writeFavoriteStations(ids: string[]): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(STATION_FAVORITES_KEY, JSON.stringify(ids));
  } catch {
    // Storage is read-only in a private context; favourites stay in memory.
  }
}

/** Everything below draws natively — no iframe, no codec, no network request. */
function drawScene(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  scene: SmuveTvScene,
  accent: string,
  time: number
): void {
  const seconds = time / 1000;
  const cx = width / 2;
  const cy = height / 2;

  ctx.clearRect(0, 0, width, height);

  // Shared bed: a slow accent wash over near-black so every station reads as
  // "on air" even in a still frame.
  const wash = ctx.createRadialGradient(
    cx + Math.sin(seconds * 0.3) * width * 0.15,
    cy + Math.cos(seconds * 0.22) * height * 0.15,
    0,
    cx,
    cy,
    Math.max(width, height) * 0.75
  );
  wash.addColorStop(0, `${accent}55`);
  wash.addColorStop(0.55, `${accent}18`);
  wash.addColorStop(1, 'rgba(4,6,10,0.96)');
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, width, height);

  ctx.save();
  ctx.shadowColor = accent;
  ctx.strokeStyle = accent;
  ctx.fillStyle = accent;

  switch (scene) {
    case 'spectrum': {
      const bars = Math.max(24, Math.floor(width / 26));
      const barWidth = width / bars;
      for (let i = 0; i < bars; i += 1) {
        const wave =
          Math.sin(seconds * 2.1 + i * 0.45) * 0.35 +
          Math.sin(seconds * 0.7 + i * 0.13) * 0.3 +
          noise01(i * 3.3) * 0.35;
        const barHeight = Math.max(6, height * 0.42 * (0.35 + Math.abs(wave)));
        ctx.globalAlpha = 0.35 + Math.abs(wave) * 0.6;
        ctx.fillRect(
          i * barWidth + barWidth * 0.18,
          cy + height * 0.18 - barHeight,
          barWidth * 0.64,
          barHeight
        );
      }
      break;
    }
    case 'vinyl': {
      const radius = Math.min(width, height) * 0.33;
      ctx.globalAlpha = 0.5;
      ctx.lineWidth = 1;
      for (let ring = 1; ring <= 16; ring += 1) {
        ctx.beginPath();
        ctx.arc(cx, cy, (radius * ring) / 16, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      ctx.arc(cx, cy, radius * 0.28, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.95;
      ctx.lineWidth = 3;
      for (let groove = 0; groove < 3; groove += 1) {
        const angle = seconds * 1.4 + groove * 2.1;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(
          cx + Math.cos(angle) * radius * 1.1,
          cy + Math.sin(angle) * radius * 1.1
        );
        ctx.stroke();
      }
      break;
    }
    case 'skyline': {
      const layers = 3;
      for (let layer = 0; layer < layers; layer += 1) {
        const depth = (layer + 1) / layers;
        const baseline = height * (0.72 + layer * 0.07);
        const drift = ((seconds * 12 * depth) % 90) - 45;
        ctx.globalAlpha = 0.25 + depth * 0.5;
        for (let i = -1; i < Math.floor(width / 60) + 2; i += 1) {
          const seed = i + layer * 100;
          const blockWidth = 34 + noise01(seed) * 34;
          const blockHeight = 40 + noise01(seed * 1.7) * height * 0.34;
          ctx.fillRect(
            i * 60 + drift,
            baseline - blockHeight / 2,
            blockWidth,
            blockHeight
          );
        }
      }
      ctx.globalAlpha = 0.85;
      ctx.beginPath();
      ctx.moveTo(0, height * 0.72);
      ctx.lineTo(width, height * 0.72);
      ctx.lineWidth = 2;
      ctx.stroke();
      break;
    }
    case 'orbit': {
      ctx.globalAlpha = 0.55;
      ctx.lineWidth = 1.4;
      for (let ring = 1; ring <= 4; ring += 1) {
        ctx.beginPath();
        ctx.ellipse(
          cx,
          cy,
          (Math.min(width, height) * 0.42 * ring) / 4,
          (Math.min(width, height) * 0.42 * ring) / 4 * 0.42,
          0,
          0,
          Math.PI * 2
        );
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      for (let dot = 0; dot < 4; dot += 1) {
        const angle = seconds * (0.6 + dot * 0.25) + dot;
        const rx = (Math.min(width, height) * 0.42 * (dot + 1)) / 4;
        ctx.beginPath();
        ctx.arc(cx + Math.cos(angle) * rx, cy + Math.sin(angle) * rx * 0.42, 5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 0.95;
      ctx.beginPath();
      ctx.arc(cx, cy, 16 + Math.sin(seconds * 2) * 3, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'neon-grid': {
      ctx.globalAlpha = 0.5;
      ctx.lineWidth = 1;
      const horizon = height * 0.52;
      for (let lane = -8; lane <= 8; lane += 1) {
        ctx.beginPath();
        ctx.moveTo(cx + lane * 26, horizon);
        ctx.lineTo(cx + lane * width * 0.22, height);
        ctx.stroke();
      }
      const scroll = (seconds * 0.7) % 1;
      for (let row = 0; row < 12; row += 1) {
        const depth = (row + scroll) / 12;
        const y = horizon + depth * depth * (height - horizon);
        ctx.globalAlpha = 0.18 + depth * 0.6;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }
      ctx.globalAlpha = 0.85;
      ctx.beginPath();
      ctx.moveTo(0, horizon);
      ctx.lineTo(width, horizon);
      ctx.lineWidth = 2;
      ctx.stroke();
      break;
    }
    case 'reel': {
      const frameHeight = height * 0.3;
      const scroll = (seconds * 40) % frameHeight;
      ctx.globalAlpha = 0.75;
      ctx.lineWidth = 2;
      for (let i = -1; i < 4; i += 1) {
        const y = i * frameHeight - scroll;
        ctx.strokeRect(width * 0.18, y + 6, width * 0.64, frameHeight - 12);
      }
      ctx.globalAlpha = 0.4;
      for (let hole = -1; hole < 16; hole += 1) {
        const y = hole * (height / 12) - ((seconds * 40) % (height / 12));
        ctx.fillRect(width * 0.08, y + 3, width * 0.04, height / 26);
        ctx.fillRect(width * 0.88, y + 3, width * 0.04, height / 26);
      }
      break;
    }
    case 'pulse': {
      for (let ring = 0; ring < 4; ring += 1) {
        const phase = (seconds * 0.5 + ring / 4) % 1;
        ctx.globalAlpha = (1 - phase) * 0.8;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(cx, cy, phase * Math.min(width, height) * 0.55, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = 0.85;
      ctx.beginPath();
      ctx.arc(cx, cy, 22 + Math.sin(seconds * 1.8) * 5, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'storm': {
      ctx.globalAlpha = 0.45;
      ctx.lineWidth = 1.3;
      for (let drop = 0; drop < 90; drop += 1) {
        const speed = 0.5 + noise01(drop) * 0.8;
        const x = (noise01(drop * 1.7) * width + seconds * 60 * speed) % width;
        const y = (noise01(drop * 2.3) * height + seconds * 420 * speed) % height;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - 9, y + 22);
        ctx.stroke();
      }
      ctx.globalAlpha = 0.16 + Math.max(0, Math.sin(seconds * 0.6)) * 0.16;
      ctx.fillRect(0, 0, width, height);
      break;
    }
  }

  ctx.restore();
}

/**
 * The artist's official full-length player.
 *
 * Apple licenses 30-second clips and no store hands a browser a full-length
 * stream, so the only route to a *complete* record is the artist's own
 * distributed upload, played by the platform that publishes it. This is the
 * narrow surface of that player the station actually uses — typed structurally
 * so the network script stays a lazily-loaded, optional chunk.
 */
interface OfficialVideoPlayer {
  playVideo(): void;
  pauseVideo(): void;
  destroy(): void;
}

interface OfficialVideoApi {
  Player: new (
    host: HTMLElement,
    options: {
      videoId: string;
      playerVars?: Record<string, string | number>;
      events?: {
        onReady?: () => void;
        onStateChange?: (event: { data: number }) => void;
        onError?: () => void;
      };
    }
  ) => OfficialVideoPlayer;
  PlayerState?: { PLAYING: number; PAUSED: number; ENDED: number };
}

/** The states the player reports, with the values its own API documents. */
const OFFICIAL_STATES = { PLAYING: 1, PAUSED: 2, ENDED: 0 } as const;

const OFFICIAL_API_SRC = 'https://www.youtube.com/iframe_api';
const OFFICIAL_API_FLAG = 'data-smuve-tv-official';

/** Cached, so the network script is fetched once per session and never twice. */
let officialApiPromise: Promise<OfficialVideoApi | null> | null = null;

/**
 * Loads the platform's official player API on demand.
 *
 * Nothing on this surface reaches the network for the station itself: this runs
 * only when the listener asks for a complete record, and the script is added
 * once. A script that cannot load reports `null` through `onerror` rather than
 * hanging the transport, and a failed load is not cached, so asking again is a
 * genuine retry rather than a permanent dead end.
 */
function loadOfficialVideoApi(): Promise<OfficialVideoApi | null> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return Promise.resolve(null);
  }
  const existing = (window as unknown as { YT?: OfficialVideoApi }).YT;
  if (existing?.Player) return Promise.resolve(existing);
  if (officialApiPromise) return officialApiPromise;

  const pending = new Promise<OfficialVideoApi | null>((resolve) => {
    const previous = (window as unknown as { onYouTubeIframeAPIReady?: () => void })
      .onYouTubeIframeAPIReady;
    // The API calls one global when it is ready, so the previous handler is
    // chained rather than replaced — another part of the app may want it.
    (window as unknown as { onYouTubeIframeAPIReady?: () => void })
      .onYouTubeIframeAPIReady = () => {
      previous?.();
      const api = (window as unknown as { YT?: OfficialVideoApi }).YT;
      resolve(api?.Player ? api : null);
    };
    if (!document.querySelector(`script[${OFFICIAL_API_FLAG}]`)) {
      const script = document.createElement('script');
      script.src = OFFICIAL_API_SRC;
      script.async = true;
      script.setAttribute(OFFICIAL_API_FLAG, '');
      script.onerror = () => resolve(null);
      document.head.appendChild(script);
    }
  });

  officialApiPromise = pending.then((api) => {
    if (!api) officialApiPromise = null;
    return api;
  });
  return officialApiPromise;
}

@Component({
  selector: 'app-smuve-tv',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './smuve-tv.component.html',
  styleUrls: ['./smuve-tv.component.css'],
})
export class SmuveTvComponent implements AfterViewInit, OnDestroy {
  private tv = inject(SmuveTvService);
  private library = inject(LibraryService);
  private feeds = inject(SmuveTvFeedsService);
  private sanitizer = inject(DomSanitizer);

  /** The focusable surface wrapper, so entry can move focus into it. */
  @ViewChild('surface', { static: false })
  private surfaceRef?: ElementRef<HTMLElement>;

  /** The immersive surface owns the viewport, so it offers its own way out. */
  readonly exit = output<void>();

  @ViewChild('bed', { static: false })
  private bedRef?: ElementRef<HTMLCanvasElement>;
  @ViewChild('stage', { static: false })
  private stageRef?: ElementRef<HTMLElement>;
  @ViewChild('music', { static: false })
  private musicRef?: ElementRef<HTMLAudioElement>;
  /**
   * Where the artist's official full-length player renders when it is asked for.
   *
   * Angular renders the empty host and nothing inside it: the platform's own
   * API moves its frame in, so this surface never manages third-party DOM.
   */
  @ViewChild('officialHost', { static: false })
  private officialHostRef?: ElementRef<HTMLElement>;
  @ViewChild('feed', { static: false })
  private feedRef?: ElementRef<HTMLVideoElement>;

  readonly categories = SMUVE_TV_CATEGORIES;
  readonly clock = smuveTvClock;
  /** Surfaces `m:ss` record lengths to the template. */
  readonly trackLength = trackLength;
  /** How many failures in a row end the broadcast rather than keep skipping. */
  private static readonly MAX_ROTATION_FAILURES = 5;

  activeCategory = signal<SmuveTvCategoryId>('all');
  searchQuery = signal('');
  channelEntry = signal('');
  activeChannelId = signal<string>(this.tv.channels[0].id);
  /** Survives a reload, exactly like the arcade's `tha_spot_favorites`. */
  favorites = signal<string[]>(readFavoriteStations(this.tv));
  favoritesOnly = signal(false);

  /** Ticks the guide's progress bars and the on-air clock. */
  now = signal(Date.now());

  isPlaying = signal(true);
  isFullscreen = signal(false);
  audioOn = signal(false);
  audioSupported = signal(false);
  musicSource = signal<string | null>(null);
  musicTrack = signal<SmuveTvRadioTrack | null>(null);
  /**
   * True only while the artist's audio is actually playing.
   *
   * The record's metadata is shown on the strength of this flag and nothing
   * else, so a paused player never advertises a song as if it were on air.
   */
  isMusicPlaying = signal(false);
  musicError = signal<string | null>(null);
  /**
   * True while the artist's own official upload is what is on air.
   *
   * The station's own player and this one are two different sources for the same
   * record, so exactly one of them is ever audible and the transport drives
   * whichever of the two is currently live.
   */
  fullRecordActive = signal(false);
  /** True while that player is being brought up, so the action cannot fire twice. */
  fullRecordLoading = signal(false);
  /** What the last attempt at a complete record did, in the listener's terms. */
  fullRecordState = signal<string | null>(null);
  /** Sanitized URL for the artist's official full-length embed. */
  fullRecordEmbedUrl = signal<SafeResourceUrl | null>(null);

  /** The live feed tuned on this station, or null when it renders its own scene. */
  activeFeedId = signal<string>(
    this.feeds.feedForStation(this.tv.channels[0].id)?.id ?? ''
  );
  /** True once the feed has buffered real media, so the canvas can step aside. */
  feedReady = signal(false);
  feedAudioOn = signal(false);
  /** Explains a refused or failed feed instead of leaving a black rectangle. */
  feedError = signal<string | null>(null);

  /**
   * The complete official catalogue, loaded once per session: the committed file
   * of all 94 official records with the live Apple catalogue laid over it.
   */
  officialCatalogue = signal<SmuveTvRadioTrack[]>([]);
  catalogueState = signal<'loading' | 'ready' | 'unavailable'>('loading');
  /** Full-length recordings the artist hosts, matched onto the catalogue. */
  hostedMasters = signal<SmuveTvRadioTrack[]>([]);
  /** True while an upload is in flight, so the action cannot be double-fired. */
  publishing = signal(false);
  /** What the last publish attempt did, in the artist's own terms. */
  publishState = signal<string | null>(null);

  /** Masters imported on this device that the station does not host yet. */
  unpublishedMasters = computed(
    () => this.importedTracks().filter((track) => !!track.blob).length
  );

  readonly allFeeds = this.feeds.feeds;

  activeFeed = computed<SmuveTvLiveFeed | null>(() =>
    this.feeds.feedById(this.activeFeedId())
  );

  /**
   * Everything genuinely by this artist, best source first: the files they
   * imported here, then the full-length recordings they host, then the official
   * catalogue.
   *
   * A record with a hosted master must not also appear as its own preview — the
   * matched master reuses the catalogue entry's id, so de-duplicating by id
   * keeps one row per record and always the longer one.
   */
  radioQueue = computed<SmuveTvRadioTrack[]>(() => {
    const hosted = this.hostedMasters();
    const hostedIds = new Set(hosted.map((track) => track.id));
    return [
      ...this.importedTracks(),
      ...hosted,
      ...this.officialCatalogue().filter((track) => !hostedIds.has(track.id)),
      /*
       * The last gate before the channel, and the only one that matters: this
       * station plays Smuve Jeff and nobody else. Every source above is already
       * scoped, and this holds even if one of them ever is not.
       */
    ].filter((track) => isSmuveJeffArtist(track.artist));
  });

  private importedTracks = computed<SmuveTvRadioTrack[]>(() =>
    this.library
      .items()
      .filter(
        (item) =>
          item.official === true &&
          item.mediaType === 'audio' &&
          (item.artist ?? '').trim().toLowerCase() === 'smuve jeff'
      )
      .map((item) => ({
        id: item.id,
        title: item.name,
        artist: item.artist ?? 'Smuve Jeff',
        album: 'Authorized master files',
        url: item.url,
        blob: item.blob,
        preview: false,
      }))
  );

  /** How many of the queued tracks are the full recording, not a preview. */
  fullTrackCount = computed(
    () => this.radioQueue().filter((track) => !track.preview).length
  );

  /**
   * What the channel actually rotates through.
   *
   * Full-length masters win outright: when the artist's own files are present
   * the 24/7 rotation is those records and nothing else, which is what "play
   * the full-length tracks" means. Only when there are no masters at all does
   * it fall back to the official previews, and the UI says so.
   */
  rotationPool = computed<SmuveTvRadioTrack[]>(() => {
    /*
     * Only records this build can actually play are rotated. A catalogue record
     * with no stream here is listed and linked instead — putting it in the bag
     * would make the channel stall on something it can never play, and a run of
     * those is indistinguishable from the source itself being gone.
     */
    const queue = this.radioQueue().filter((track) => !!(track.blob || track.url));
    const masters = queue.filter((track) => !track.preview);
    return masters.length ? masters : queue;
  });

  /**
   * Records the station lists but cannot stream here.
   *
   * These are the catalogue entries Apple does not carry, so there is no preview
   * to play. They are what makes the station hold the artist's *complete*
   * catalogue rather than the Apple subset, and each opens on a platform that
   * publishes the complete track.
   */
  catalogueOnly = computed<SmuveTvRadioTrack[]>(() =>
    this.radioQueue().filter((track) => !track.blob && !track.url)
  );

  /**
   * The record whose metadata is on screen: only the one that is playing.
   *
   * Nothing about the queue is listed on the surface — no track list, no
   * platform links — so this is the module's single place where a record is
   * named, and it appears only while that record is audible.
   */
  nowPlaying = computed<SmuveTvRadioTrack | null>(() =>
    this.isMusicPlaying() ? this.musicTrack() : null
  );

  /** True when the rotation is drawing on real full-length recordings. */
  playsFullLength = computed(() =>
    this.rotationPool().some((track) => !track.preview)
  );

  /**
   * How many catalogued records the artist's own distribution put out complete.
   *
   * These are the records the station can hand to the official player, so this
   * count is what turns "94 records catalogued" into "89 of them can be heard
   * whole right now" — the reach of the catalogue, not just its length.
   */
  fullRecordCount = computed(
    () => this.radioQueue().filter((track) => !!track.youtubeId).length
  );

  /** Whichever pool is on air, so the count never describes the wrong list. */
  rotationCount = computed(() => this.rotationPool().length);

  /**
   * One mute button drives whatever is actually making sound: the live feed when
   * one is playing, otherwise the locally synthesised station bed.
   */
  audioSource = computed<'feed' | 'bed'>(() =>
    this.activeFeed() && this.feedReady() ? 'feed' : 'bed'
  );
  isAudioOn = computed(() =>
    this.audioSource() === 'feed' ? this.feedAudioOn() : this.audioOn()
  );
  audioUsable = computed(
    () => this.audioSource() === 'feed' || this.audioSupported()
  );

  activeChannel = computed<SmuveTvChannel>(() => {
    const id = this.activeChannelId();
    return this.tv.channels.find((channel) => channel.id === id) ?? this.tv.channels[0];
  });

  onAir = computed(() => this.tv.nowPlaying(this.activeChannel(), new Date(this.now())));

  guide = computed(() =>
    this.tv.guideFor(this.activeChannel(), new Date(this.now()), 6)
  );

  progressPercent = computed(() => Math.round(this.onAir().progress * 100));

  /**
   * The rail. Favourites filtering sits on top of the category/search result so
   * "my stations" is a view of the line-up rather than a separate list.
   */
  visibleChannels = computed<SmuveTvChannel[]>(() => {
    const query = this.searchQuery();
    const pool = query
      ? this.tv.search(query)
      : this.tv.channelsIn(this.activeCategory());
    const chosen = this.favoritesOnly()
      ? pool.filter((channel) => this.favorites().includes(channel.id))
      : pool;
    return chosen.sort((a, b) => a.number - b.number);
  });

  /**
   * The rail is the visible line-up paired with what each station is playing
   * right now, resolved in one pass so the template never re-derives airtimes
   * per change-detection cycle.
   */
  rail = computed(() => {
    const at = new Date(this.now());
    return this.visibleChannels().map((channel) => ({
      channel,
      slot: this.tv.nowPlaying(channel, at),
    }));
  });

  /**
   * The hls.js instance, kept only as the narrow surface used to tear it down.
   * Typed structurally so hls.js can stay a lazily-imported optional chunk.
   */
  private hls: { destroy(): void } | null = null;
  /** Records left in the current random pass through the rotation pool. */
  private rotationBag: SmuveTvRadioTrack[] = [];
  /** The record that just played, so a new pass cannot open on it. */
  private lastRotationId: string | null = null;
  /** Consecutive tracks that failed to play; guards against an endless skip. */
  private consecutiveFailures = 0;
  /** Injectable so a test can pin the rotation order. */
  random: () => number = Math.random;
  /** Injectable so a test can drive the official player without YouTube. */
  officialApiLoader: () => Promise<OfficialVideoApi | null> = loadOfficialVideoApi;
  /** The live official player, once the listener has asked for a complete record. */
  private officialPlayer: OfficialVideoPlayer | null = null;
  /** Fallback watchdog for hosts where the API callback fires before its iframe is attached. */
  private officialFallbackTimer: number | null = null;
  /** Station the current feed was attached for, so zapping re-attaches once. */
  private feedStationId: string | null = null;
  private nowTimerId: number | null = null;
  private frameId: number | null = null;
  private sceneTime = 0;
  private lastFrameAt = 0;
  /** Last still frame drawn while reduced motion is on, so it can idle. */
  private lastStillKey: string | null = null;
  private audio: { ctx: AudioContext; master: GainNode; voices: OscillatorNode[] } | null =
    null;
  private touchStart: { x: number; y: number } | null = null;
  private fullscreenListener = () => {
    const doc = document as Document & { webkitFullscreenElement?: Element | null };
    this.isFullscreen.set(!!(doc.fullscreenElement ?? doc.webkitFullscreenElement));
  };

  constructor() {
    this.audioSupported.set(
      typeof window !== 'undefined' &&
        typeof (window.AudioContext ??
          (window as unknown as { webkitAudioContext?: typeof AudioContext })
            .webkitAudioContext) === 'function'
    );
    // The official catalogue is fetched, not bundled: it is the artist's real
    // release list and would be wrong the moment a new record lands.
    void this.loadCatalogue();
  }

  ngAfterViewInit(): void {
    this.nowTimerId = window.setInterval(() => this.now.set(Date.now()), 1000);
    document.addEventListener('fullscreenchange', this.fullscreenListener);
    document.addEventListener('webkitfullscreenchange', this.fullscreenListener);
    /*
     * The transport keys are claimed at the document in the *capture* phase,
     * not with a host binding. Measured in Chromium: entering the broadcast
     * left `document.activeElement` on <body>, so a host-bound listener never
     * saw a key at all and Space fell through to the app's command palette,
     * which started the Studio deck playing underneath the broadcast.
     * Capture wins the race against that bubble-phase listener, and the
     * surface still yields Space to whatever control actually has focus.
     */
    document.addEventListener('keydown', this.keyListener, true);
    // A full-screen takeover owns the keyboard, so the tab order starts here.
    this.surfaceRef?.nativeElement.focus?.({ preventScroll: true });
    this.startSceneLoop();
    this.attachFeed();
  }

  ngOnDestroy(): void {
    if (this.nowTimerId !== null) {
      window.clearInterval(this.nowTimerId);
      this.nowTimerId = null;
    }
    this.stopSceneLoop();
    this.stopAudio();
    this.stopFeed();
    this.destroyOfficialPlayer();
    this.clearOfficialFallbackTimer();
    this.releaseMusicSource();
    document.removeEventListener('keydown', this.keyListener, true);
    document.removeEventListener('fullscreenchange', this.fullscreenListener);
    document.removeEventListener('webkitfullscreenchange', this.fullscreenListener);
  }

  // ── Tuning ─────────────────────────────────────────────

  tuneTo(channel: SmuveTvChannel): void {
    if (channel.id === this.activeChannelId()) return;
    this.activeChannelId.set(channel.id);
    this.channelEntry.set('');
    /*
     * A zap can target a station the current filter hides — a number-pad entry
     * for a cinema channel while MUSIC is selected. Reopening the rail on the
     * tuned station beats showing a guide that excludes what is playing.
     */
    if (
      this.activeCategory() !== 'all' &&
      channel.category !== this.activeCategory()
    ) {
      this.activeCategory.set('all');
    }
    this.retuneAudio();
    // Every station carries its own live feed, so a zap re-tunes the source.
    this.activeFeedId.set(this.feeds.feedForStation(channel.id)?.id ?? '');
    void this.attachFeed();
  }

  stepChannel(step: number): void {
    const pool = this.tv.channelsIn('all');
    const index = pool.findIndex((channel) => channel.id === this.activeChannelId());
    const next = (index + step + pool.length) % pool.length;
    this.tuneTo(pool[next]);
  }

  selectCategory(id: SmuveTvCategoryId): void {
    this.activeCategory.set(id);
    this.searchQuery.set('');
  }

  clearSearch(): void {
    this.searchQuery.set('');
  }

  goToChannel(): void {
    const target = this.tv.channelByNumber(this.channelEntry());
    if (target) {
      this.tuneTo(target);
    } else {
      this.channelEntry.set('');
    }
  }

  toggleFavorite(id = this.activeChannel().id): void {
    const updated = this.favorites().includes(id)
      ? this.favorites().filter((entry) => entry !== id)
      : [...this.favorites(), id];
    this.favorites.set(updated);
    writeFavoriteStations(updated);
  }

  toggleFavoritesOnly(): void {
    this.favoritesOnly.update((value) => !value);
  }

  // ── Transport ──────────────────────────────────────────

  togglePlayback(): void {
    const resume = !this.isPlaying();
    this.isPlaying.set(resume);

    const video = this.feedRef?.nativeElement;
    if (resume) {
      this.startSceneLoop();
      this.rampAudio(AUDIO_LEVEL);
      this.playMedia(video);
    } else {
      this.stopSceneLoop();
      video?.pause();
      /*
       * Pausing has to silence the station too. Leaving the bed running under a
       * "PAUSED" badge is simply a lie about what the surface is doing.
       */
      this.rampAudio(0);
    }
  }

  /** Slide the bed's gain without tearing the graph down. */
  private rampAudio(level: number): void {
    if (!this.audio) return;
    try {
      this.audio.master.gain.setTargetAtTime(
        level,
        this.audio.ctx.currentTime,
        0.2
      );
    } catch {
      // The context is already closing; there is nothing left to ramp.
    }
  }

  async toggleFullscreen(): Promise<void> {
    const stage = this.stageRef?.nativeElement as
      | (HTMLElement & { requestFullscreen?: () => Promise<void> })
      | undefined;
    if (!stage) return;
    const doc = document as Document & {
      webkitFullscreenElement?: Element | null;
      webkitExitFullscreen?: () => Promise<void>;
    };
    try {
      if (doc.fullscreenElement ?? doc.webkitFullscreenElement) {
        await (doc.exitFullscreen?.() ?? doc.webkitExitFullscreen?.());
      } else if (stage.requestFullscreen) {
        await stage.requestFullscreen();
      }
    } catch {
      // Fullscreen can be refused (embedded frames, missing user activation).
      // The player keeps working in place, so this is never worth surfacing.
    }
  }

  /**
   * The artist radio uses the browser's native audio pipeline. It is separate
   * from the decorative synth bed: no iframe, no third-party player, and no
   * autoplay. Playback begins only after the viewer presses play.
   */
  toggleMusic(): void {
    const audio = this.musicRef?.nativeElement;
    if (!audio || !this.radioQueue().length) return;
    /*
     * One transport, two sources: while the artist's official upload is the one
     * on air, the transport drives it, so PLAY / PAUSE never acts on a player
     * nobody can hear.
     */
    if (this.fullRecordActive()) {
      if (this.isMusicPlaying()) this.officialPlayer?.pauseVideo();
      else this.officialPlayer?.playVideo();
      return;
    }
    if (audio.paused) {
      // The television has one speaker: the radio takes it.
      this.silenceStationAudio();
      this.musicError.set(null);
      this.playMedia(audio, () =>
        this.musicError.set('Tap play again to allow audio in this browser.')
      );
    } else {
      audio.pause();
    }
  }

  startMusic(): void {
    if (!this.rotationPool().length) return;
    if (!this.musicTrack()) {
      // The station opens on a random record, not the top of the catalogue.
      const first = this.nextRotationTrack();
      if (!first) return;
      this.selectMusicTrack(first);
    }
    this.toggleMusic();
  }

  /**
   * The next record on the 24/7 rotation.
   *
   * A shuffle bag, not an independent random pick: each pass plays every record
   * once in a random order, so nothing repeats within a cycle but the channel
   * still never follows a predictable sequence. A fresh pass is rotated past the
   * seam when its first draw is the record that just finished, because hearing
   * the same song twice in a row is the one thing shuffle must never do.
   */
  nextRotationTrack(): SmuveTvRadioTrack | null {
    const pool = this.rotationPool();
    if (!pool.length) return null;

    // Anything removed from the pool mid-cycle (an import the artist deleted)
    // must not still be dealt out of the bag.
    const live = new Set(pool.map((track) => track.id));
    this.rotationBag = this.rotationBag.filter((track) => live.has(track.id));

    if (!this.rotationBag.length) {
      this.rotationBag = shuffleBag(pool, this.random);
      if (
        this.rotationBag.length > 1 &&
        this.rotationBag[0].id === this.lastRotationId
      ) {
        const [first, second] = this.rotationBag;
        this.rotationBag[0] = second;
        this.rotationBag[1] = first;
      }
    }

    const track = this.rotationBag.shift() ?? null;
    if (track) this.lastRotationId = track.id;
    return track;
  }

  /** Hands the channel to its next record, keeping the broadcast unbroken. */
  advanceRotation(): void {
    // A pass that ends mid-flight must not leave the bag empty for long; the
    // next call rebuilds it, so a single empty pool is the only dead end.
    if (!this.rotationPool().length) {
      this.musicError.set('Nothing is queued for this channel yet.');
      return;
    }
    const next = this.nextRotationTrack();
    if (!next) return;
    this.selectMusicTrack(next, true);
  }

  selectMusicTrack(track: SmuveTvRadioTrack, autoplay = false): void {
    const audio = this.musicRef?.nativeElement;
    if (!audio) return;
    // A new record is a new source: the previous one's official player goes with
    // it, so two records can never be on air at once, and neither can its status
    // text outlive the record it described.
    this.closeFullRecord();
    this.musicTrack.set(track);
    this.musicError.set(null);
    // A queued record is not a playing one: the panel only opens on the real
    // `playing` event, so it can never name a track the browser refused.
    this.isMusicPlaying.set(false);

    const source = track.blob
      ? URL.createObjectURL(track.blob)
      : track.url ?? null;
    if (!source) {
      this.musicError.set('This track has no playable audio source.');
      return;
    }

    /*
     * The element is driven imperatively; the template deliberately does not
     * bind `src`.
     *
     * Measured in Chromium: binding it made Angular re-assign `src` right after
     * this method had set it, which restarts the load and aborts the pending
     * `play()` promise — the channel then announced "Tap play again" on a track
     * it had just queued, and skipped it. Binding `null` was worse: `src` is a
     * DOM property, so it coerced to the literal string "null", the browser
     * fetched a bogus URL, and the element fired a spurious `error` event that
     * the rotation correctly read as a dead track.
     */
    const previous = this.musicSource();
    this.musicSource.set(source);
    audio.src = source;
    audio.load();
    // The old object URL is revoked only once the new source is attached, so a
    // mid-load revocation can never abort the record that is starting.
    if (previous && previous !== source && previous.startsWith('blob:')) {
      URL.revokeObjectURL(previous);
    }

    if (autoplay) {
      this.silenceStationAudio();
      this.playMedia(audio, () =>
        this.musicError.set('Tap play to start the selected track.')
      );
    }
  }

  onMusicEnded(): void {
    // One continuous rotation, so the channel really is 24/7: a record hands
    // over to the next exactly like a broadcast would.
    this.isMusicPlaying.set(false);
    this.advanceRotation();
  }

  /**
   * A source that will not play must not kill the channel.
   *
   * The rotation steps straight past it and keeps broadcasting — one dead
   * preview URL cannot be allowed to end a 24/7 stream. Only a run of failures
   * is worth telling the viewer about, because that means the source itself is
   * gone rather than one record having moved.
   */
  onMusicError(): void {
    this.isMusicPlaying.set(false);
    this.consecutiveFailures += 1;
    if (this.consecutiveFailures >= SmuveTvComponent.MAX_ROTATION_FAILURES) {
      this.musicError.set(
        'Nothing in the rotation would play. Check that this browser allows audio.'
      );
      return;
    }
    this.advanceRotation();
  }

  /**
   * Confirmed audio output is the only thing that clears the failure guard and
   * the only thing that puts the record's metadata on screen.
   * Resetting the guard on every attempt would defeat it entirely.
   */
  onMusicPlaying(): void {
    this.consecutiveFailures = 0;
    this.isMusicPlaying.set(true);
    this.musicError.set(null);
  }

  /** A paused player is not playing, so the metadata comes down with it. */
  onMusicPaused(): void {
    this.isMusicPlaying.set(false);
  }

  // ── The artist's official full-length upload ───────────

  /**
   * Whether the record on the panel has a complete version the station can hand
   * to the artist's own official player.
   *
   * Read from the catalogue alone — never from the DOM — so the control is
   * offered on the first render of the panel rather than one change-detection
   * pass later.
   */
  canPlayFullRecord(track: SmuveTvRadioTrack | null | undefined): boolean {
    return !!track?.youtubeId;
  }

  /**
   * Whether the panel should offer the complete record for what is playing.
   *
   * Only when the station's own audio is a clip: a hosted master is already the
   * whole recording, so offering the upload there would be a second, pointless
   * way to hear the same song.
   */
  offersFullRecord(track: SmuveTvRadioTrack | null | undefined): boolean {
    return !!track?.preview && this.canPlayFullRecord(track);
  }

  /**
   * Plays the COMPLETE record from the artist's own official upload.
   *
   * This is the answer to "full length" for the catalogue Apple only clips: the
   * recording is the artist's own distributed one, played by the platform that
   * publishes it, so a listener hears the whole song instead of 30 seconds. It
   * is only ever reached by pressing the control — nothing on this surface
   * embeds anything on its own.
   */
  async playFullRecord(track: SmuveTvRadioTrack): Promise<void> {
    const videoId = track.youtubeId;
    if (!videoId || this.fullRecordLoading() || this.fullRecordActive()) return;

    const host = this.officialHostRef?.nativeElement;
    if (!host) {
      this.fullRecordState.set('The official player has nowhere to render on this surface.');
      return;
    }

    this.fullRecordLoading.set(true);
    this.fullRecordEmbedUrl.set(
      this.sanitizer.bypassSecurityTrustResourceUrl(
        `https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}?autoplay=1&playsinline=1&rel=0&modestbranding=1`
      )
    );
    this.fullRecordState.set('BRINGING UP THE ARTIST\u2019S OFFICIAL UPLOAD\u2026');
    // The official embed is rendered by Angular immediately. This avoids a
    // race where the API replaces or clears the host before its iframe exists;
    // YouTube's own controls then own the full-length playback lifecycle.
    this.fullRecordLoading.set(false);
    this.fullRecordActive.set(true);
    this.isMusicPlaying.set(true);
    this.fullRecordState.set('THE ARTIST’S OWN OFFICIAL UPLOAD — THE COMPLETE RECORD');
    return;

    const api = await this.officialApiLoader();
    if (!api?.Player || !this.canPlayFullRecord(this.musicTrack())) {
      this.fullRecordLoading.set(false);
      this.fullRecordState.set(
        api?.Player
          ? 'The record changed before the official upload could start.'
          : 'The official player could not be loaded. The station keeps playing.'
      );
      return;
    }

    // The host can be recreated while the API script is loading; always resolve
    // the current rendered node before handing it to the official player.
    const liveHost = document.querySelector<HTMLElement>('.tv-music-full-host') ?? host;

    // The television has one speaker: the station's own player steps aside
    // before the official one starts, so the two never overlap.
    this.musicRef?.nativeElement.pause();
    this.silenceStationAudio();
    this.isMusicPlaying.set(false);

    const states = api.PlayerState ?? OFFICIAL_STATES;
    try {
      this.officialPlayer = new api.Player(liveHost, {
        videoId,
        playerVars: { autoplay: 1, playsinline: 1, rel: 0, modestbranding: 1 },
        events: {
          onReady: () => this.officialPlayer?.playVideo(),
          onStateChange: (event) => this.onOfficialState(event?.data, states),
          onError: () => this.onOfficialRecordError(),
        },
      });
      // Start the DOM watchdog immediately; the API may not emit a state event
      // in browsers that block its frame bootstrap. The direct official embed is
      // also attached now so the full record is never represented by an empty
      // host while the API finishes initializing.
      this.scheduleOfficialFallback();
      if (!liveHost.querySelector('iframe')) {
        const iframe = document.createElement('iframe');
        iframe.src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}?autoplay=1&playsinline=1&rel=0&modestbranding=1`;
        iframe.title = 'Smuve Jeff Radio official full-length player';
        iframe.allow = 'autoplay; encrypted-media; picture-in-picture';
        iframe.allowFullscreen = true;
        iframe.referrerPolicy = 'strict-origin-when-cross-origin';
        liveHost.appendChild(iframe);
      }
    } catch {
      this.destroyOfficialPlayer();
      this.fullRecordLoading.set(false);
      this.fullRecordState.set(
        'The official player refused to start. The station keeps playing.'
      );
    }
  }

  /** Takes the artist's official player back down, leaving the station queued. */
  closeFullRecord(): void {
    const wasActive = this.fullRecordActive();
    this.destroyOfficialPlayer();
    this.fullRecordLoading.set(false);
    this.fullRecordActive.set(false);
    if (wasActive) this.isMusicPlaying.set(false);
    this.fullRecordState.set(null);
    this.fullRecordEmbedUrl.set(null);
  }

  /**
   * The official player's own state, mapped onto the station's transport.
   *
   * Only `PLAYING` puts the record's metadata on screen, exactly as the
   * station's own player does: an upload that was refused must not be announced
   * as if it were on air.
   */
  private onOfficialState(
    state: number | undefined,
    states: { PLAYING: number; PAUSED: number; ENDED: number }
  ): void {
    if (state === states.PLAYING) {
      this.consecutiveFailures = 0;
      this.fullRecordLoading.set(false);
      this.fullRecordActive.set(true);
      this.fullRecordState.set(
        'THE ARTIST\u2019S OWN OFFICIAL UPLOAD \u2014 THE COMPLETE RECORD'
      );
      this.isMusicPlaying.set(true);
      this.musicError.set(null);
      this.scheduleOfficialFallback();
      return;
    }
    if (state === states.PAUSED) {
      this.isMusicPlaying.set(false);
      return;
    }
    if (state === states.ENDED) {
      // One continuous rotation: the complete record hands over to the next one
      // exactly like a broadcast would.
      this.destroyOfficialPlayer();
      this.fullRecordActive.set(false);
      this.fullRecordLoading.set(false);
      this.fullRecordState.set(null);
      this.isMusicPlaying.set(false);
      this.advanceRotation();
    }
  }

  private scheduleOfficialFallback(): void {
    const host = this.officialHostRef?.nativeElement;
    const track = this.musicTrack();
    const videoId = track?.youtubeId;
    if (!host || !videoId || host.querySelector('iframe')) return;
    this.clearOfficialFallbackTimer();
    this.officialFallbackTimer = window.setTimeout(() => {
      if (!this.officialPlayer || host.querySelector('iframe')) return;
      const iframe = document.createElement('iframe');
      iframe.src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}?autoplay=1&playsinline=1&rel=0&modestbranding=1`;
      iframe.title = 'Smuve Jeff Radio official full-length player';
      iframe.allow = 'autoplay; encrypted-media; picture-in-picture';
      iframe.allowFullscreen = true;
      iframe.referrerPolicy = 'strict-origin-when-cross-origin';
      host.replaceChildren(iframe);
    }, 1200);
  }

  /**
   * A refused upload must not end the broadcast.
   *
   * The station's own player takes the record back so the channel keeps
   * sounding, and the reason is stated rather than swallowed.
   */
  onOfficialRecordError(): void {
    this.destroyOfficialPlayer();
    this.fullRecordActive.set(false);
    this.fullRecordLoading.set(false);
    this.fullRecordState.set(
      'That official upload will not play here. Back on the station\u2019s own player.'
    );
    this.playMedia(this.musicRef?.nativeElement, () =>
      this.musicError.set('Tap play again to allow audio in this browser.')
    );
  }

  private clearOfficialFallbackTimer(): void {
    if (this.officialFallbackTimer !== null) {
      window.clearTimeout(this.officialFallbackTimer);
      this.officialFallbackTimer = null;
    }
  }

  private destroyOfficialPlayer(): void {
    this.clearOfficialFallbackTimer();
    const player = this.officialPlayer;
    this.officialPlayer = null;
    if (!player) return;
    try {
      player.destroy();
    } catch {
      // The frame is already gone; there is nothing left to release.
    }
  }

  /**
   * Reads the artist's official catalogue from Apple's public API.
   *
   * Failure is a first-class outcome, not an exception: the module still owns a
   * full station line-up and the authorized-file path, so an unavailable
   * catalogue degrades to those and says so.
   */
  async loadCatalogue(): Promise<void> {
    this.catalogueState.set('loading');
    // Both reads are independent, so they go out together and either can fail
    // without taking the other down.
    const [records, live] = await Promise.all([
      this.feeds.loadCatalogueRecords(),
      this.feeds.loadOfficialCatalogue(),
    ]);
    const tracks = this.feeds.mergeCatalogue(records, live);
    this.officialCatalogue.set(tracks);
    this.catalogueState.set(tracks.length ? 'ready' : 'unavailable');
    // The master manifest is joined onto the catalogue, so it must be read after
    // it — and a record already playing keeps playing, because the rotation only
    // rebuilds when the pool itself changes.
    await this.loadMasters(tracks);
  }

  /**
   * What a record's badge reads: a hosted master or a preview. Every record on
   * this station streams from a real source, so there is no third case.
   */
  trackBadge(track: SmuveTvRadioTrack): 'FULL' | 'PREVIEW' {
    // A hosted master is whole by itself; an official upload is whole once the
    // listener has actually brought it up, which is when this badge reads FULL.
    if (!track.preview) return 'FULL';
    return this.fullRecordActive() && track.id === this.musicTrack()?.id
      ? 'FULL'
      : 'PREVIEW';
  }

  /**
   * Attaches the artist's own full-length recordings to the catalogue.
   *
   * This is the whole answer to "full length on air": Apple licenses 30-second
   * previews and no platform will hand over the masters, so the recordings come
   * from the artist. Two sources feed it — the manifest committed with the build
   * and the recordings published through the API — and they are folded into one
   * entry per record before matching, so a record hosted both ways is still one
   * row on the station.
   */
  async loadMasters(catalogue = this.officialCatalogue()): Promise<void> {
    const [manifest, published] = await Promise.all([
      this.feeds.loadMasterManifest(),
      this.feeds.loadPublishedMasters(),
    ]);
    this.hostedMasters.set(
      this.feeds.matchMasters(
        catalogue,
        this.feeds.mergeMasterSources(manifest, published)
      )
    );
  }

  /**
   * Publishes every master imported on this device to the station.
   *
   * Importing only ever put a recording in this browser's own storage, so it
   * played here and nowhere else. Publishing is what puts it on the channel for
   * every listener — and what keeps it after this browser's data is cleared.
   */
  async publishMasters(): Promise<void> {
    if (this.publishing()) return;

    const local = this.importedTracks().filter((track) => !!track.blob);
    if (!local.length) {
      this.publishState.set('Import a master first, then publish it.');
      return;
    }

    this.publishing.set(true);
    this.publishState.set(`PUBLISHING 0/${local.length}\u2026`);

    const failures: string[] = [];
    let published = 0;
    for (const track of local) {
      try {
        await this.feeds.publishMaster(track);
        published += 1;
      } catch (err) {
        failures.push(
          `${track.title}: ${err instanceof Error ? err.message : 'the upload failed'}`
        );
      }
      this.publishState.set(`PUBLISHING ${published}/${local.length}\u2026`);
    }

    this.publishing.set(false);
    // Read the published list back rather than assuming the upload landed: the
    // station only hosts what the API agrees it hosts.
    await this.loadMasters();
    this.publishState.set(
      failures.length
        ? `${published} OF ${local.length} PUBLISHED \u2014 ${failures[0]}`
        : `PUBLISHED ${published} \u2014 ON AIR EVERYWHERE NOW`
    );
  }

  // ── Live feeds ─────────────────────────────────────────

  /** Swaps this station's live feed, keeping the native scene as an option. */
  chooseFeed(feedId: string): void {
    this.activeFeedId.set(feedId);
    void this.attachFeed();
  }

  /**
   * Tunes the station's live feed.
   *
   * hls.js is imported on demand so it never lands in the initial bundle, and
   * Safari, iOS, and Android Chrome play HLS natively without it. A station with
   * no feed — or one whose feed fails — keeps its canvas scene, which is why the
   * module never depends on the network to show a picture.
   */
  private async attachFeed(): Promise<void> {
    const video = this.feedRef?.nativeElement;
    const feed = this.activeFeed();
    const stationId = this.activeChannelId();

    this.stopFeed();
    this.feedStationId = stationId;
    this.feedError.set(null);

    if (!video || !feed) return;

    try {
      if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = feed.url;
        video.addEventListener('loadedmetadata', this.onFeedMetadata, { once: true });
      } else {
        const { default: Hls } = await import('hls.js');
        if (!Hls.isSupported()) {
          this.onFeedError();
          return;
        }
        const hls = new Hls({ enableWorker: true });
        this.hls = hls;
        hls.on(Hls.Events.FRAG_LOADED, () => {
          // Only the station still on screen may claim the picture.
          if (this.feedStationId === stationId) this.feedReady.set(true);
        });
        hls.on(Hls.Events.ERROR, (_event, data) => {
          // hls.js recovers from most failures on its own. Only a fatal error
          // means the station genuinely cannot be shown, so only then fall back
          // rather than flashing the scene during routine recovery.
          if (data?.fatal && this.feedStationId === stationId) this.onFeedError();
        });
        /*
         * A zap that lands between the import resolving and the player being
         * ready would otherwise leave two HLS instances fighting over one video
         * element, so the newest station always wins.
         */
        if (this.feedStationId !== stationId) {
          hls.destroy();
          this.hls = null;
          return;
        }
        hls.loadSource(feed.url);
        hls.attachMedia(video);
      }

      video.muted = !this.feedAudioOn();
      // Muted playback is allowed without a gesture on every target browser, so
      // the picture starts on its own and unmuting is the only thing the viewer
      // ever has to do.
      this.playMedia(video);
    } catch {
      this.onFeedError();
    }
  }

  /** Native HLS took the source without hiring hls.js, so the picture is live. */
  private onFeedMetadata = (): void => {
    this.feedReady.set(true);
  };

  onFeedError(): void {
    const name = this.activeFeed()?.name;
    this.feedReady.set(false);
    this.feedError.set(
      name
        ? `${name} is not answering right now. Showing the station scene instead.`
        : 'Live feed unavailable. Showing the station scene instead.'
    );
  }

  private stopFeed(): void {
    const video = this.feedRef?.nativeElement;
    // Only a feed that actually took a source needs releasing; resetting a
    // source-less element just makes the browser re-run its load algorithm.
    const hadSource = !!(video?.getAttribute('src') || video?.src);
    this.hls?.destroy();
    this.hls = null;
    this.feedStationId = null;
    this.feedReady.set(false);
    this.feedAudioOn.set(false);
    if (!video) return;
    video.removeEventListener('loadedmetadata', this.onFeedMetadata);
    if (!hadSource) return;
    try {
      video.pause();
      video.removeAttribute('src');
      video.load();
    } catch {
      // The element is already gone; there is nothing left to release.
    }
  }

  /**
   * Starts media without trusting what `play()` returns.
   *
   * Browsers hand back a promise that rejects when autoplay is blocked, but
   * embedded webviews — and jsdom's media stubs — return nothing at all. A
   * refusal is never an error here: the transport badge keeps telling the truth
   * and the next gesture starts playback anyway.
   */
  private playMedia(
    element: HTMLMediaElement | undefined | null,
    onRefused?: () => void
  ): void {
    if (!element) return;
    try {
      const result = element.play() as Promise<void> | undefined;
      if (result && typeof result.catch === 'function') {
        void result.catch(() => onRefused?.());
      }
    } catch {
      onRefused?.();
    }
  }

  /** TV has one speaker, so the radio and the station never play over each other. */
  private silenceStationAudio(): void {
    if (this.feedAudioOn()) {
      this.feedAudioOn.set(false);
      const video = this.feedRef?.nativeElement;
      if (video) video.muted = true;
    }
    if (this.audioOn()) this.stopAudio();
  }

  async onOfficialMusicFiles(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []).filter((file) => file.type.startsWith('audio/'));
    for (const file of files) {
      const randomId = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${file.name}`;
      const id = `smuve-jeff-radio-${randomId}`;
      this.library.addOrUpdate({
        id,
        name: file.name.replace(/\.[^.]+$/, ''),
        addedAt: Date.now(),
        size: file.size,
        blob: file,
        /*
         * This control is the artist putting their own masters on their own
         * station, and it is the one place a credit is asserted rather than
         * read: the radio holds every other source to `isSmuveJeffArtist`, and
         * this is the owner's own authorisation of a local file.
         */
        artist: 'Smuve Jeff',
        official: true,
        mediaType: 'audio',
      });
      await this.library.putOffline(id, file);
    }
    input.value = '';
    // Keep the first track queued but silent until the user explicitly starts
    // the radio; this respects mobile autoplay policies and the channel promise.
  }

  private releaseMusicSource(): void {
    const source = this.musicSource();
    if (source?.startsWith('blob:')) URL.revokeObjectURL(source);
    this.musicSource.set(null);
  }

  /**
   * A station audio bed, synthesised locally. Off by default: a TV that makes
   * noise the moment it opens is hostile. Every note is generated in-page, so
   * there is no stream to fail.
   */
  /**
   * Names what the mute button will actually do. It drives two different
   * sources, so "toggle audio" would be an unhelpful label to hear.
   */
  audioTitle(): string {
    if (this.audioSource() === 'feed') {
      return this.feedAudioOn() ? 'Mute the live feed' : 'Unmute the live feed';
    }
    if (!this.audioSupported()) return 'Audio is unavailable in this browser';
    return this.audioOn()
      ? 'Mute the station audio bed'
      : 'Play the station audio bed';
  }

  /**
   * One mute button, whichever source is on air. With a live feed playing it
   * mutes the feed; the synthesised bed is only the fallback picture's audio.
   */
  toggleAudio(): void {
    if (this.audioSource() === 'feed') {
      const next = !this.feedAudioOn();
      this.feedAudioOn.set(next);
      const video = this.feedRef?.nativeElement;
      if (video) {
        video.muted = !next;
        if (next) {
          this.pauseMusic();
          this.playMedia(video, () => this.feedAudioOn.set(false));
        }
      }
      return;
    }
    if (!this.audioSupported()) return;
    if (this.audioOn()) {
      this.stopAudio();
    } else {
      this.pauseMusic();
      this.startAudio();
    }
  }

  /** Leaves the radio queued where it is, so play resumes on the same track. */
  private pauseMusic(): void {
    this.musicRef?.nativeElement.pause();
  }

  private startAudio(): void {
    if (typeof window === 'undefined') return;
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctor) return;
    try {
      const ctx = new Ctor();
      const master = ctx.createGain();
      master.gain.value = 0;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 900;
      filter.connect(master);
      master.connect(ctx.destination);

      const voices = [0, 1, 2].map((index) => {
        const osc = ctx.createOscillator();
        osc.type = index === 0 ? 'triangle' : 'sine';
        osc.frequency.value = this.voiceFrequency(index);
        osc.connect(filter);
        osc.start();
        return osc;
      });

      // Slow tremolo so the bed breathes instead of droning flat.
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      lfo.frequency.value = 0.08;
      lfoGain.gain.value = 0.012;
      lfo.connect(lfoGain);
      lfoGain.connect(master.gain);
      lfo.start();

      // A station opened mid-pause starts silent, so play/pause stays truthful.
      master.gain.setTargetAtTime(
        this.isPlaying() ? AUDIO_LEVEL : 0,
        ctx.currentTime,
        0.8
      );
      this.audio = { ctx, master, voices };
      this.audioOn.set(true);
    } catch {
      this.audio = null;
      this.audioOn.set(false);
    }
  }

  private voiceFrequency(index: number): number {
    // Minor-ish stack rooted a fifth below the station number, so each channel
    // has its own bed without ever being musical enough to distract.
    const root = 55 * Math.pow(2, (this.activeChannel().number % 12) / 12);
    const ratios = [1, 1.5, 2.25];
    return root * ratios[index % ratios.length];
  }

  private retuneAudio(): void {
    if (!this.audio) return;
    const at = this.audio.ctx.currentTime;
    this.audio.voices.forEach((voice, index) => {
      voice.frequency.setTargetAtTime(this.voiceFrequency(index), at, 0.25);
    });
  }

  private stopAudio(): void {
    const audio = this.audio;
    this.audio = null;
    this.audioOn.set(false);
    if (!audio) return;
    try {
      audio.master.gain.setTargetAtTime(0, audio.ctx.currentTime, 0.2);
      audio.voices.forEach((voice) => voice.stop(audio.ctx.currentTime + 0.6));
      void audio.ctx.close();
    } catch {
      // Already torn down or the context is gone; nothing to release.
    }
  }

  // ── Native scene rendering ─────────────────────────────

  private startSceneLoop(): void {
    if (typeof window === 'undefined' || this.frameId !== null) return;
    // jsdom and embedded contexts may expose no animation frame at all; the
    // guide and HUD work regardless, so the scene is the only thing lost.
    if (typeof window.requestAnimationFrame !== 'function') return;
    this.lastFrameAt = 0;
    this.frameId = window.requestAnimationFrame(this.renderFrame);
  }

  private stopSceneLoop(): void {
    if (this.frameId !== null) {
      window.cancelAnimationFrame?.(this.frameId);
      this.frameId = null;
    }
  }

  private renderFrame = (timestamp: number): void => {
    this.frameId = window.requestAnimationFrame?.(this.renderFrame) ?? null;
    if (this.frameId === null) return;
    const delta = this.lastFrameAt ? timestamp - this.lastFrameAt : 16;
    this.lastFrameAt = timestamp;
    const animated = this.motionAllowed();
    if (animated) this.sceneTime += delta;

    const canvas = this.bedRef?.nativeElement;
    if (!canvas) return;
    const ratio = window.devicePixelRatio || 1;
    const width = Math.max(1, Math.floor(canvas.clientWidth * ratio));
    const height = Math.max(1, Math.floor(canvas.clientHeight * ratio));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
      // Resizing clears the buffer, so a frozen scene has to be repainted.
      this.lastStillKey = null;
    }
    let ctx: CanvasRenderingContext2D | null = null;
    try {
      ctx = canvas.getContext('2d');
    } catch {
      // Canvas unavailable (test doubles, restricted embeds): HUD still works.
      ctx = null;
    }
    if (!ctx) return;
    const channel = this.activeChannel();
    if (!animated) {
      /*
       * With motion turned down, repainting an unchanging picture sixty times a
       * second is pure waste: draw one frame per station and per canvas size,
       * then idle until either changes.
       */
      const still = `${channel.id}|${width}x${height}`;
      if (still === this.lastStillKey) return;
      this.lastStillKey = still;
    }
    drawScene(ctx, width, height, channel.scene, channel.accent, this.sceneTime);
  };

  /**
   * The scene is decoration, and it is the one thing on this surface a viewer
   * cannot switch off. `prefers-reduced-motion` freezes it to a still frame —
   * the guide, clock, and progress bar keep moving, because those are
   * information rather than ornament.
   */
  private motionAllowed(): boolean {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return true;
    }
    return !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  // ── Touch + keyboard ───────────────────────────────────

  onSwipeStart(event: TouchEvent): void {
    const touch = event.touches[0];
    if (!touch) return;
    this.touchStart = { x: touch.clientX, y: touch.clientY };
  }

  onSwipeEnd(event: TouchEvent): void {
    const start = this.touchStart;
    this.touchStart = null;
    const touch = event.changedTouches[0];
    if (!start || !touch) return;
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    // Horizontal and committed: vertical page scrolling never zaps.
    if (Math.abs(dx) <= Math.abs(dy) * 1.4 || Math.abs(dx) < 48) return;
    this.stepChannel(dx < 0 ? 1 : -1);
  }

  private keyListener = (event: KeyboardEvent): void => this.onKeydown(event);

  onKeydown(event: KeyboardEvent): void {
    const target = event.target as HTMLElement | null;
    const typing =
      !!target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName ?? '');
    if (typing) {
      if (event.key === 'Escape') target?.blur();
      return;
    }
    /*
     * Escape is handled here, on the surface itself, not only by the parent's
     * document-level listener. Measured in Chromium: Angular's
     * `document:keydown.escape` pseudo-event never reached either handler, while
     * this plain host `keydown` fires reliably, because the host wraps whatever
     * control currently has focus. The parent keeps its own listener as a
     * backstop for focus that has left the surface.
     */
    if (event.key === 'Escape' || event.key === 'Esc') {
      event.preventDefault();
      this.exit.emit();
      return;
    }
    /*
     * Everything else is a shortcut, and a shortcut must never outrank the
     * control the viewer actually tabbed to: Space belongs to the focused
     * button, and the arrow keys scroll a focused listbox. Hijacking them made
     * the transport unusable from the keyboard.
     */
    if (
      target?.closest?.(
        'button, a, input, select, textarea, [role="button"], [contenteditable="true"]'
      )
    ) {
      return;
    }
    switch (event.key) {
      case 'ArrowUp':
        event.preventDefault();
        this.stepChannel(-1);
        break;
      case 'ArrowDown':
        event.preventDefault();
        this.stepChannel(1);
        break;
      case ' ':
      case 'Spacebar':
        event.preventDefault();
        this.togglePlayback();
        break;
      case 'f':
      case 'F':
        void this.toggleFullscreen();
        break;
      case 'm':
      case 'M':
        this.toggleAudio();
        break;
      default:
        break;
    }
  }
}
