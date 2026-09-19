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
  SMUVE_JEFF_RADIO_CHANNEL_ID,
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

/** Where the artist's official uploads live on the web. */
const OFFICIAL_FRAME_ORIGIN = 'https://www.youtube-nocookie.com';

/**
 * The artist's record, framed for the station's player on the module page.
 *
 * Muted by design: the station's own player keeps the air and the frame carries
 * only the picture — two audible sources would be two records at once, which
 * is the one thing a channel must never be.
 */
function officialEmbedUrl(videoId: string): string {
  const params = [
    'autoplay=1',
    'mute=1',
    'playsinline=1',
    'rel=0',
    'modestbranding=1',
  ];
  if (typeof window !== 'undefined' && window.location?.origin) {
    params.push(`origin=${encodeURIComponent(window.location.origin)}`);
  }
  return `${OFFICIAL_FRAME_ORIGIN}/embed/${encodeURIComponent(
    videoId
  )}?${params.join('&')}`;
}

/**
 * The artist's record, framed for the broadcast screen.
 *
 * Unmuted, no controls, no annotations: the record is the broadcast and the
 * viewer has no say in what the channel plays. User activation from entering
 * the broadcast lets the browser start the audio.
 */
function officialStageUrl(videoId: string): string {
  const params = [
    'autoplay=1',
    'playsinline=1',
    'rel=0',
    'modestbranding=1',
    'controls=0',
    'disablekb=1',
    'iv_load_policy=3',
  ];
  if (typeof window !== 'undefined' && window.location?.origin) {
    params.push(`origin=${encodeURIComponent(window.location.origin)}`);
  }
  return `${OFFICIAL_FRAME_ORIGIN}/embed/${encodeURIComponent(
    videoId
  )}?${params.join('&')}`;
}

/** Narrow surface of the platform's official player the station uses. */
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

/** The states the API reports, with the values its own docs define. */
const OFFICIAL_STATES = { PLAYING: 1, PAUSED: 2, ENDED: 0 } as const;

/** The script that gives the station a player it can listen to. */
const OFFICIAL_API_SRC = 'https://www.youtube.com/iframe_api';

/** Cached, so the network script is fetched once per session. */
let officialApiPromise: Promise<OfficialVideoApi | null> | null = null;

/**
 * Loads the platform's player API on demand.
 *
 * Nothing on this surface reaches the network for the station itself: this runs
 * only when the broadcast has a record the artist uploaded, and the script is
 * added once. A script that cannot load reports `null` through `onerror` rather
 * than hanging the transport, and a failed load is not cached, so asking again
 * is a genuine retry rather than a permanent dead end.
 */
function loadOfficialVideoApi(): Promise<OfficialVideoApi | null> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return Promise.resolve(null);
  }
  const existing = (window as unknown as { YT?: OfficialVideoApi }).YT;
  if (existing?.Player) return Promise.resolve(existing);
  if (officialApiPromise) return officialApiPromise;

  const pending = new Promise<OfficialVideoApi | null>((resolve) => {
    const previous = (window as unknown as {
      onYouTubeIframeAPIReady?: () => void;
    }).onYouTubeIframeAPIReady;
    (window as unknown as { onYouTubeIframeAPIReady?: () => void })
      .onYouTubeIframeAPIReady = () => {
      previous?.();
      const api = (window as unknown as { YT?: OfficialVideoApi }).YT;
      resolve(api?.Player ? api : null);
    };
    if (!document.querySelector('[data-smuve-tv-official]')) {
      const script = document.createElement('script');
      script.src = OFFICIAL_API_SRC;
      script.async = true;
      script.setAttribute('data-smuve-tv-official', '');
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
  /** The host inside the broadcast overlay where the official player renders. */
  @ViewChild('standaloneHost', { static: false })
  private standaloneHostRef?: ElementRef<HTMLElement>;
  @ViewChild('feed', { static: false })
  private feedRef?: ElementRef<HTMLVideoElement>;

  readonly categories = SMUVE_TV_CATEGORIES;
  readonly clock = smuveTvClock;
  /** The artist's own station, offered as a fixed route into the guide. */
  readonly radioStation = this.tv.radioChannel;
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
  /** How far into the record the station's own player is, in milliseconds. */
  musicElapsedMs = signal(0);
  /**
   * The playing element's own running time, in milliseconds.
   *
   * Measured from the element rather than read off the catalogue record, because
   * a licensed 30-second preview must never draw a progress bar that claims to
   * be three minutes long.
   */
  musicDurationMs = signal(0);
  /** Full-page lean-back mode for the Smuve Jeff Radio station. */
  radioStandalone = signal(false);
  /**
   * True while the artist's own record is on the station's screen.
   *
   * This is the display, not the speaker: the station's own player keeps the air
   * and the frame carries the picture, so nothing on this surface is ever heard
   * twice.
   */
  fullRecordActive = signal(false);
  /** Sanitized URL for the artist's own record, rendered by the station's player. */
  fullRecordEmbedUrl = signal<SafeResourceUrl | null>(null);

  /**
   * The artist's official upload, playing with sound in the broadcast.
   *
   * Only raised when the broadcast is up and the record exists as a preview
   * but the artist's own upload is complete: Apple clips a record, the
   * broadcast plays the whole thing through the artist's own frame.
   */
  standaloneEmbedUrl = signal<SafeResourceUrl | null>(null);

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

  /** True while the tuned station is the artist's own radio station. */
  isRadioStation = computed(
    () => this.activeChannelId() === SMUVE_JEFF_RADIO_CHANNEL_ID
  );

  /**
   * The record the lower third names: only ever a record actually on air, and
   * only ever on the artist's own station.
   *
   * Every other station's lower third belongs to its linear schedule, so this is
   * null there and the programme keeps the screen.
   */
  private radioRecord = computed<SmuveTvRadioTrack | null>(() =>
    this.isRadioStation() ? this.nowPlaying() : null
  );

  /** What the lower third is describing, in the listener's terms. */
  onAirLabel = computed(() => {
    const record = this.radioRecord();
    if (!record) return 'NOW PLAYING';
    return record.preview
      ? 'SMUVE JEFF RADIO \u00b7 OFFICIAL PREVIEW'
      : 'SMUVE JEFF RADIO \u00b7 FULL RECORD';
  });

  /**
   * The record's name while it is audible, the schedule otherwise.
   *
   * Naming the song is the one thing the station shows about its rotation, and
   * it appears only while that song is playing.
   */
  onAirTitle = computed(
    () => this.radioRecord()?.title ?? this.onAir().program.title
  );

  onAirSubtitle = computed(() => {
    const record = this.radioRecord();
    if (!record) return this.onAir().program.subtitle;
    return [record.artist, record.album, trackLength(record.durationMs)]
      .filter(Boolean)
      .join(' \u00b7 ');
  });

  /** The bar follows the record when a record is on air, the slot otherwise. */
  onAirProgress = computed(() => {
    if (!this.radioRecord()) return this.progressPercent();
    const duration = this.musicDurationMs();
    if (duration <= 0) return 0;
    return Math.min(
      100,
      Math.max(0, Math.round((this.musicElapsedMs() / duration) * 100))
    );
  });

  /** Elapsed on the left, running time on the right, or the slot's own times. */
  onAirStart = computed(() =>
    this.radioRecord()
      ? this.recordClock(this.musicElapsedMs())
      : this.clock(this.onAir().startsAt)
  );

  onAirEnd = computed(() => {
    if (!this.radioRecord()) return this.clock(this.onAir().endsAt);
    const duration = this.musicDurationMs();
    return duration > 0 ? this.recordClock(duration) : '--:--';
  });

  /** `m:ss` for a count of milliseconds. */
  private recordClock(ms: number): string {
    const totalSeconds = Math.max(0, Math.floor(ms / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    return `${minutes}:${String(totalSeconds % 60).padStart(2, '0')}`;
  }

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
  /** The live official player, when a record is playing through the broadcast. */
  private standalonePlayer: OfficialVideoPlayer | null = null;
  /** Fallback: advances the rotation if the platform never reports an end. */
  private standaloneEndTimer: number | null = null;
  /** Fallback: degrades if the platform never reports playback. */
  private standaloneReadyTimer: number | null = null;
  /** Invalidated every time a new record takes the broadcast. */
  private standaloneToken = 0;
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
    this.closeStandaloneEmbed();
    this.closeFullRecord();
    this.stopRadio();
    this.releaseMusicSource();
    document.removeEventListener('keydown', this.keyListener, true);
    document.removeEventListener('fullscreenchange', this.fullscreenListener);
    document.removeEventListener('webkitfullscreenchange', this.fullscreenListener);
    this.radioStandalone.set(false);
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
    /*
     * Smuve Jeff Radio is the one station whose audio is the artist's own
     * catalogue rather than the station bed, so the zap decides who owns the
     * speaker: tuning in starts the rotation, tuning away stops the record.
     */
    if (this.isRadioStation()) {
      this.startRadio();
    } else {
      this.stopRadio();
      // The station's own status belongs to the station; it must not follow the
      // viewer onto another channel as a message about a record nobody hears.
      this.musicError.set(null);
    }
  }

  /** The guide's fixed route into the artist's own station. */
  tuneToRadio(): void {
    this.tuneTo(this.radioStation);
    /*
     * `tuneTo` returns early when the station is already tuned, so this covers
     * the case the early return would otherwise skip: the listener is on the
     * station and reaches for the route again, which has to start a record the
     * browser refused or the transport stopped.
     */
    this.startRadio();
    /*
     * The route is the lean-back broadcast, not another panel on the module:
     * the station takes the whole screen, the record is chosen by the channel,
     * and the guide comes back when the listener asks to leave.
     */
    this.enterRadio();
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
    /*
     * On the artist's station the record *is* the broadcast, so the transport
     * drives it rather than the bed. Starting the bed here would put a synth
     * underneath the song and give the surface two audio sources at once.
     */
    if (this.isRadioStation()) {
      if (this.isMusicPlaying()) {
        this.stopRadio();
        // The pause event does this too, but the badge must not wait on an
        // event a host might not deliver before the next render.
        this.isPlaying.set(false);
      } else {
        this.startRadio();
      }
      return;
    }

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

  /** Enter the radio as a lean-back broadcast: one random queue, no track UI. */
  enterRadio(): void {
    this.radioStandalone.set(true);
    if (!this.musicTrack()) {
      this.startMusic();
    } else if (this.musicRef?.nativeElement.paused) {
      this.toggleMusic();
    }
  }

  exitRadio(): void {
    /*
     * Leaving the standalone screen hands the room back, but the channel does
     * not stop: the station was tuned and stays tuned, and the record keeps
     * playing under the guide exactly as it would on any other station. Only
     * leaving the station itself (`tuneTo` elsewhere) takes the record down.
     */
    this.closeStandaloneEmbed();
    this.radioStandalone.set(false);
    this.surfaceRef?.nativeElement.focus?.({ preventScroll: true });
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
   * Tune the artist's station in.
   *
   * A radio station is already broadcasting by the time the viewer reaches it,
   * so tuning in picks the rotation up where it stands: a random record when
   * nothing is queued, and play when the record on the deck is merely paused.
   * The tap is also what lets the browser start unmuted audio at all.
   */
  startRadio(): void {
    if (this.isMusicPlaying()) return;
    if (!this.rotationPool().length) {
      this.musicError.set('Nothing is queued for this channel yet.');
      return;
    }
    if (this.radioStandalone()) {
      const current = this.musicTrack();
      this.playStandaloneRecord(current ?? this.nextRotationTrack());
      return;
    }
    this.startMusic();
  }

  /**
   * Tuning away stops the record.
   *
   * The television has one speaker: a song still playing under another
   * channel's scene is exactly the kind of lie the transport badges exist to
   * prevent. The queue keeps its place, so tuning back in resumes the record.
   */
  stopRadio(): void {
    /*
     * The display goes with the speaker. A record frozen on the station's screen
     * while the channel is paused — or while the viewer has zapped to another
     * station — is a picture of something that is not on air.
     */
    this.closeStandaloneEmbed();
    this.closeFullRecord();
    const audio = this.musicRef?.nativeElement;
    /*
     * Only a record that is actually running has anything to stop. Pausing an
     * empty element is not just pointless — jsdom and embedded webviews report
     * the call they do not implement as a page error.
     */
    const loaded = !!(audio?.currentSrc || audio?.getAttribute('src'));
    if (audio && loaded && !audio.paused) {
      audio.pause();
    }
    this.isMusicPlaying.set(false);
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
    if (this.radioStandalone()) {
      this.playStandaloneRecord(next);
      return;
    }
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
    // A new record starts its own clock: the bar must not carry the previous
    // record's playback position or running time onto it.
    this.musicElapsedMs.set(0);
    this.musicDurationMs.set(0);

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
    // On the artist's station the record is the broadcast, so the ON AIR badge
    // and the transport follow it instead of the station bed.
    if (this.isRadioStation()) {
      this.isPlaying.set(true);
      /*
       * The record goes on the station's screen as soon as the channel's own
       * audio confirms it is on air. A record with no official upload — a master
       * the artist hosted here, or a file from this device — keeps the scene.
       */
      const record = this.musicTrack();
      if (record && this.canPlayFullRecord(record)) this.playFullRecord(record);
    }
  }

  /** A paused player is not playing, so the metadata comes down with it. */
  onMusicPaused(): void {
    this.isMusicPlaying.set(false);
    if (this.isRadioStation()) this.isPlaying.set(false);
  }

  /**
   * The record's own clock, so the lower third can report where the song is.
   *
   * Read from the element rather than a timer: it is the browser's own position,
   * it costs nothing, and it stops the moment playback does.
   */
  onMusicTimeUpdate(): void {
    const audio = this.musicRef?.nativeElement;
    if (!audio) return;
    const elapsed = Number.isFinite(audio.currentTime)
      ? Math.max(0, audio.currentTime * 1000)
      : 0;
    const duration = Number.isFinite(audio.duration)
      ? Math.max(0, audio.duration * 1000)
      : 0;
    this.musicElapsedMs.set(Math.round(elapsed));
    if (duration > 0) this.musicDurationMs.set(Math.round(duration));
  }

  // ── The artist's record, on the station's screen ───────

  /**
   * Whether the station can put this record on its screen.
   *
   * Read from the catalogue alone, never from the DOM: the record is the one the
   * catalogue says the artist published, so there is nothing about it to wait a
   * change-detection pass for.
   */
  canPlayFullRecord(track: SmuveTvRadioTrack | null | undefined): boolean {
    return !!track?.youtubeId;
  }

  /**
   * Puts the artist's own record on the station's screen.
   *
   * This is the answer to "full length" for the catalogue Apple only clips: the
   * recording is the artist's own distributed one, played by the platform that
   * publishes it, so what the station shows for the record on air is the whole
   * song rather than a 30-second rectangle with nothing in it.
   *
   * The frame is muted and the station's own player keeps the air, so a record is
   * never heard twice — and the station decides when the display opens, not the
   * listener: a channel is something the viewer tunes to, so the record goes on
   * screen when it is confirmed on air and comes down with it.
   */
  playFullRecord(track: SmuveTvRadioTrack): void {
    const videoId = track.youtubeId;
    if (!videoId || this.fullRecordActive()) return;
    // The display lives inside the player: with no screen there is nowhere to put
    // the record, so the station simply keeps its own scene.
    if (!this.officialHostRef?.nativeElement) return;

    this.fullRecordEmbedUrl.set(
      this.sanitizer.bypassSecurityTrustResourceUrl(officialEmbedUrl(videoId))
    );
    this.fullRecordActive.set(true);
  }

  /**
   * Clears the station's screen, leaving the rotation exactly where it stands.
   *
   * The display never holds the sound, so taking it down says nothing about
   * whether the channel is playing: the station's own player is the only thing
   * that decides that.
   */
  closeFullRecord(): void {
    this.fullRecordActive.set(false);
    this.fullRecordEmbedUrl.set(null);
  }

  // ── The broadcast: full-length record via the artist's own frame ──

  /**
   * Puts the next record on the broadcast, choosing the right source for full
   * length: the artist's own official upload when one exists (preview records
   * that Apple clips but the artist uploaded complete), the station's own player
   * when a hosted master is available, or Apple's preview otherwise.
   *
   * The broadcast has no controls, so the record that goes on air is the
   * channel's decision, not the listener's.
   */
  private playStandaloneRecord(track: SmuveTvRadioTrack | null): void {
    if (!track) return;
    this.musicTrack.set(track);
    this.musicError.set(null);
    this.closeFullRecord();

    if (track.youtubeId && this.canPlayFullRecord(track)) {
      void this.playStandaloneFullRecord(track);
      return;
    }
    this.selectMusicTrack(track, true);
  }

  /**
   * The artist's own official upload, playing with sound in the broadcast.
   *
   * Apple clips a record; the artist's own upload is complete. The broadcast
   * hands the speaker to the frame so the full record is what the room hears,
   * and the platform's own player tells the rotation when the song ends.
   */
  private async playStandaloneFullRecord(track: SmuveTvRadioTrack): Promise<void> {
    const videoId = track.youtubeId;
    if (!videoId) return;

    const token = ++this.standaloneToken;
    this.clearStandaloneTimers();

    // The station's own player steps aside: the frame carries the sound.
    const audio = this.musicRef?.nativeElement;
    if (audio && (audio.currentSrc || audio.getAttribute('src')) && !audio.paused) {
      audio.pause();
    }
    this.silenceStationAudio();

    this.standaloneEmbedUrl.set(
      this.sanitizer.bypassSecurityTrustResourceUrl(officialStageUrl(videoId))
    );

    // The browser is allowed to refuse an unmuted start; the station's own
    // player is the fallback, and a ready timer tells us if the frame took it.
    this.standaloneReadyTimer = window.setTimeout(() => {
      if (token !== this.standaloneToken) return;
      // The platform never reported playback: keep the broadcast going with
      // the station's own player, which was always the fallback.
      this.fallbackToStationAudio(track);
    }, 6000);

    const api = await this.officialApiLoader();
    if (token !== this.standaloneToken) return;
    if (!api?.Player) {
      this.fallbackToStationAudio(track);
      return;
    }

    const host = this.standaloneHostRef?.nativeElement ?? this.officialHostRef?.nativeElement;
    if (!host) {
      this.fallbackToStationAudio(track);
      return;
    }

    this.destroyStandalonePlayer();
    const states = api.PlayerState ?? OFFICIAL_STATES;
    try {
      this.standalonePlayer = new api.Player(host, {
        videoId,
        playerVars: {
          autoplay: 1,
          playsinline: 1,
          rel: 0,
          modestbranding: 1,
          controls: 0,
          disablekb: 1,
          iv_load_policy: 3,
        },
        events: {
          onReady: () => {
            if (token === this.standaloneToken) this.standalonePlayer?.playVideo();
          },
          onStateChange: (event) => {
            if (token !== this.standaloneToken) return;
            this.onStandaloneRecordState(event?.data, states, track);
          },
          onError: () => {
            if (token !== this.standaloneToken) return;
            this.onStandaloneRecordError(track);
          },
        },
      });
    } catch {
      this.fallbackToStationAudio(track);
    }
  }

  /**
   * The platform's own state, mapped onto the broadcast.
   *
   * Only `PLAYING` confirms the record is really on air; `ENDED` hands the
   * rotation to the next one. Everything else is noise the broadcast absorbs.
   */
  private onStandaloneRecordState(
    state: number | undefined,
    states: { PLAYING: number; PAUSED: number; ENDED: number },
    track: SmuveTvRadioTrack
  ): void {
    if (state === states.PLAYING) {
      this.clearStandaloneTimers();
      this.consecutiveFailures = 0;
      this.isMusicPlaying.set(true);
      this.musicError.set(null);

      // Safety net: if the platform never reports ENDED, the rotation still
      // moves on after the record's own running time.
      const duration = track.durationMs;
      if (duration && duration > 0) {
        const endToken = this.standaloneToken;
        this.standaloneEndTimer = window.setTimeout(() => {
          if (this.standaloneToken !== endToken) return;
          this.destroyStandalonePlayer();
          this.standaloneEmbedUrl.set(null);
          this.isMusicPlaying.set(false);
          this.advanceRotation();
        }, duration + 2000);
      }
      return;
    }
    if (state === states.PAUSED) {
      // The broadcast has no controls: a pause the viewer did not cause is
      // the platform buffering, not a choice. Resume and keep the record on air.
      this.standalonePlayer?.playVideo();
      return;
    }
    if (state === states.ENDED) {
      this.clearStandaloneTimers();
      this.destroyStandalonePlayer();
      this.standaloneEmbedUrl.set(null);
      this.isMusicPlaying.set(false);
      this.advanceRotation();
    }
  }

  /**
   * A refused upload must not end the broadcast.
   *
   * The station's own player takes the record back so the channel keeps
   * sounding, and the rotation keeps moving.
   */
  private onStandaloneRecordError(track: SmuveTvRadioTrack): void {
    this.clearStandaloneTimers();
    this.destroyStandalonePlayer();
    this.standaloneEmbedUrl.set(null);
    this.consecutiveFailures += 1;
    if (this.consecutiveFailures >= SmuveTvComponent.MAX_ROTATION_FAILURES) {
      this.musicError.set(
        'Nothing in the rotation would play. Check that this browser allows audio.'
      );
      return;
    }
    this.fallbackToStationAudio(track);
  }

  /**
   * When the platform will not play, the station's own player takes the record
   * back: 30 seconds of preview is better than silence, and the rotation keeps
   * moving.
   */
  private fallbackToStationAudio(track: SmuveTvRadioTrack): void {
    this.clearStandaloneTimers();
    this.destroyStandalonePlayer();
    this.standaloneEmbedUrl.set(null);
    this.selectMusicTrack(track, true);
  }

  private destroyStandalonePlayer(): void {
    this.clearStandaloneTimers();
    const player = this.standalonePlayer;
    this.standalonePlayer = null;
    if (!player) return;
    try {
      player.destroy();
    } catch {
      // The frame is already gone; there is nothing left to release.
    }
  }

  private clearStandaloneTimers(): void {
    if (this.standaloneEndTimer !== null) {
      window.clearTimeout(this.standaloneEndTimer);
      this.standaloneEndTimer = null;
    }
    if (this.standaloneReadyTimer !== null) {
      window.clearTimeout(this.standaloneReadyTimer);
      this.standaloneReadyTimer = null;
    }
  }

  /** Tears down the broadcast's own player and timers. */
  private closeStandaloneEmbed(): void {
    this.destroyStandalonePlayer();
    this.standaloneEmbedUrl.set(null);
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
    /*
     * The artist's record covers the canvas outright, so there is nothing to see
     * there and nothing to spend a frame on: the loop skips the scene while the
     * record is on the screen rather than tearing itself down, so it carries its
     * own state straight back the moment the record comes off. The frame clock is
     * left alone too, so a frozen scene does not jump forward by however long
     * the record lasted.
     */
    if (this.fullRecordActive()) {
      this.lastFrameAt = 0;
      return;
    }
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
      /*
       * The artist's broadcast owns the whole screen, so Escape leaves *it*
       * first — back to the guide, record still playing — and a second press
       * leaves the television entirely. One key, two layers, the nearest
       * exit first.
       */
      if (this.radioStandalone()) {
        this.exitRadio();
        return;
      }
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
