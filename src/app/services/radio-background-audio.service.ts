import { inject, Injectable, signal } from "@angular/core";
import type {
  AudioPlayerPlugin,
  AudioPlayerPrepareParams,
} from "@mediagrid/capacitor-native-audio";
import { LoggingService } from "./logging.service";

/** What the native media notification needs to name the record on air. */
export interface RadioBackgroundTrack {
  title: string;
  artist?: string;
  album?: string;
  artwork?: string;
  /** The stream/file URL to play. Only `http(s)` sources can go native. */
  source: string;
}

export type RadioBackgroundStatus = "idle" | "playing" | "paused" | "stopped";

/**
 * Smuve Jeff Radio's background broadcast.
 *
 * On Android the 24/7 station used to keep playing from the WebView's `<audio>`
 * element — until the app was backgrounded far enough for Android to reclaim
 * the process, which cut the broadcast mid-record. That is the one thing a
 * radio station may never do, and it is why every Play-shipped player runs a
 * foreground service while it sounds.
 *
 * This service binds the `@mediagrid/capacitor-native-audio` MediaSession
 * service, which owns the media notification (play/pause, lock-screen
 * controls, artwork) and the foreground-service guarantee that keeps the
 * process alive for the whole broadcast. The web `<audio>` element remains the
 * engine everywhere else — plain browsers, tests, and track sources the native
 * player cannot read (`blob:` URLs and relative paths are scoped to the
 * WebView, so those keep the element path even on device).
 *
 * Nothing here throws at a caller: every method reports whether the native
 * engine took the job, and a `false` sends the caller back to the element.
 */
@Injectable({
  providedIn: "root",
})
export class RadioBackgroundAudioService {
  private logger = inject(LoggingService);

  /** The notification's identity. One station, one player. */
  private readonly audioId = "smuve-jeff-radio";

  /** True once the native plugin adapter has been registered. */
  readonly available = signal(false);

  /** Playback state, kept in sync with the notification's own controls. */
  readonly status = signal<RadioBackgroundStatus>("idle");

  private plugin: AudioPlayerPlugin | null = null;
  private initPromise: Promise<boolean> | null = null;
  private created = false;
  private listenersBound = false;
  private endedHandler: (() => void) | null = null;
  private statusHandler: ((status: RadioBackgroundStatus) => void) | null =
    null;

  /** Register listeners before playback starts. */
  onEnded(handler: () => void): void {
    this.endedHandler = handler;
  }

  /** Fires for both app- and notification-initiated changes. */
  onStatusChange(handler: (status: RadioBackgroundStatus) => void): void {
    this.statusHandler = handler;
  }

  /**
   * Whether this source can play natively.
   *
   * `blob:` and relative sources are inside the WebView's world; the native
   * player cannot fetch them, so they are explicitly left to the element.
   */
  canHandle(source: string | null | undefined): boolean {
    if (!this.available() || !source) return false;
    return /^https?:\/\//i.test(source);
  }

  /** Detects and registers the native plugin. Safe to call repeatedly. */
  init(): Promise<boolean> {
    if (this.initPromise) return this.initPromise;
    this.initPromise = this.register();
    return this.initPromise;
  }

  private async register(): Promise<boolean> {
    try {
      const { Capacitor, registerPlugin } = await import("@capacitor/core");
      if (!Capacitor.isNativePlatform()) return false;
      this.plugin = registerPlugin<AudioPlayerPlugin>("AudioPlayer");
      this.available.set(true);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Point the native player at a record. Returns false when the caller should
   * use the web element instead.
   */
  async load(track: RadioBackgroundTrack): Promise<boolean> {
    if (!(await this.init()) || !this.plugin) return false;
    if (!this.canHandle(track.source)) return false;

    const metadata = {
      friendlyTitle: track.title,
      artistName: track.artist,
      albumTitle: track.album,
      artworkSource: track.artwork,
    };

    try {
      if (!this.created) {
        const params: AudioPlayerPrepareParams = {
          audioId: this.audioId,
          audioSource: track.source,
          useForNotification: true,
          // A radio stream is not seekable: the notification shows
          // play/pause only, never a scrubber over dead air.
          showSeekBackward: false,
          showSeekForward: false,
          ...metadata,
        };
        await this.plugin.create(params);
        this.created = true;
        this.bindListeners();
        await this.plugin.initialize({ audioId: this.audioId });
      } else {
        await this.plugin.changeAudioSource({
          audioId: this.audioId,
          source: track.source,
        });
        await this.plugin.changeMetadata({
          audioId: this.audioId,
          ...metadata,
        });
      }
      return true;
    } catch (e) {
      this.logger.warn("RadioBackgroundAudio: native load failed", e);
      // A half-initialized or dying native player must not be reused, and a
      // failed source change must not leave the old record on air underneath
      // the caller's web-element fallback. Tearing it down guarantees the
      // next load starts cleanly and only one engine can ever be sounding.
      await this.destroy();
      return false;
    }
  }

  async play(): Promise<boolean> {
    if (!this.plugin || !this.created) return false;
    try {
      await this.plugin.play({ audioId: this.audioId });
      return true;
    } catch (e) {
      this.logger.warn("RadioBackgroundAudio: native play failed", e);
      return false;
    }
  }

  async pause(): Promise<boolean> {
    if (!this.plugin || !this.created) return false;
    try {
      await this.plugin.pause({ audioId: this.audioId });
      return true;
    } catch (e) {
      this.logger.warn("RadioBackgroundAudio: native pause failed", e);
      return false;
    }
  }

  /** Stops the broadcast and takes the notification down with it. */
  async stop(): Promise<void> {
    if (!this.plugin || !this.created) return;
    try {
      await this.plugin.stop({ audioId: this.audioId });
      this.status.set("stopped");
    } catch (e) {
      this.logger.warn("RadioBackgroundAudio: native stop failed", e);
    }
  }

  /** Frees the native player entirely (leaving the station). */
  async destroy(): Promise<void> {
    if (!this.plugin || !this.created) return;
    try {
      await this.plugin.destroy({ audioId: this.audioId });
    } catch (e) {
      this.logger.warn("RadioBackgroundAudio: native destroy failed", e);
    }
    this.created = false;
    // The plugin has no listener-removal API, and callbacks are stored on the
    // native source, so a fresh `create` must register them again or the
    // notification controls and track-end handling would go silent.
    this.listenersBound = false;
    this.status.set("idle");
  }

  /**
   * The native side's own events, forwarded onto the component's state machine
   * so the guide, the ON AIR badge, and the 24/7 rotation stay truthful
   * whether the record was advanced here or from the lock screen.
   */
  private bindListeners(): void {
    if (this.listenersBound || !this.plugin) return;
    this.listenersBound = true;

    void this.plugin
      .onAudioEnd({ audioId: this.audioId }, () => {
        this.status.set("stopped");
        this.endedHandler?.();
      })
      .catch((e) => {
        this.listenersBound = false;
        this.logger.warn("RadioBackgroundAudio: onAudioEnd listener failed", e);
      });

    void this.plugin
      .onPlaybackStatusChange({ audioId: this.audioId }, ({ status }) => {
        this.status.set(status);
        this.statusHandler?.(status);
      })
      .catch((e) => {
        this.listenersBound = false;
        this.logger.warn("RadioBackgroundAudio: status listener failed", e);
      });
  }
}
