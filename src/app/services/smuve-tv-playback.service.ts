import { Injectable, computed, inject, signal } from '@angular/core';
import {
  SMUVE_TV_CHANNELS,
  SmuveTvChannel,
  SmuveTvService,
} from './smuve-tv.service';
import {
  SmuveTvFeedsService,
  SmuveTvLiveFeed,
} from './smuve-tv-feeds.service';

/**
 * Where the one station video is currently attached.
 *
 * `module` is the normal in-page television surface. `pip` and `floating` are
 * deliberately different: the first means the browser really opened a native
 * Picture-in-Picture window, while the second is the honest fallback for
 * browsers that do not offer it.
 */
export type SmuveTvPlayerSurface = 'closed' | 'module' | 'pip' | 'floating';

export interface SmuveTvPlaybackSnapshot {
  channelId: string | null;
  feedId: string | null;
  playing: boolean;
  audioOn: boolean;
}

/** The small part of hls.js this coordinator needs, kept optional at runtime. */
interface HlsLike {
  destroy(): void;
  on(event: string, listener: (...args: unknown[]) => void): void;
  loadSource(url: string): void;
  attachMedia(video: HTMLVideoElement): void;
}

interface HlsConstructorLike {
  isSupported(): boolean;
  new (options?: { enableWorker?: boolean }): HlsLike;
  Events: {
    FRAG_LOADED: string;
    ERROR: string;
  };
}

type PictureInPictureVideo = HTMLVideoElement & {
  requestPictureInPicture?: () => Promise<unknown>;
};

/**
 * One app-wide TV playback session.
 *
 * The guide owns the channel metadata and schedule; this service owns the one
 * media element. Keeping the element here is what lets a viewer pop the live
 * picture out, navigate to another route, and come back to the same channel
 * without a second decoder or a second copy of the stream fighting for it.
 */
@Injectable({ providedIn: 'root' })
export class SmuveTvPlaybackService {
  private readonly tv = inject(SmuveTvService);
  private readonly feeds = inject(SmuveTvFeedsService);

  readonly surface = signal<SmuveTvPlayerSurface>('closed');
  readonly sessionActive = signal(false);
  readonly channelId = signal<string | null>(null);
  readonly feedId = signal<string | null>(null);
  readonly ready = signal(false);
  readonly playing = signal(false);
  readonly audioOn = signal(false);
  readonly error = signal<string | null>(null);
  readonly pipSupported = signal(
    typeof HTMLVideoElement !== 'undefined' &&
      typeof (HTMLVideoElement.prototype as PictureInPictureVideo)
        .requestPictureInPicture === 'function'
  );

  readonly activeChannel = computed<SmuveTvChannel | null>(() => {
    const id = this.channelId();
    return (
      SMUVE_TV_CHANNELS.find((channel) => channel.id === id) ??
      this.tv.channels[0] ??
      null
    );
  });

  readonly activeFeed = computed<SmuveTvLiveFeed | null>(() =>
    this.feeds.feedById(this.feedId() ?? '')
  );

  readonly isPip = computed(() => this.surface() === 'pip');
  readonly isFloating = computed(() => this.surface() === 'floating');
  readonly isPersistent = computed(
    () => this.surface() === 'pip' || this.surface() === 'floating'
  );
  readonly hasPlayableSession = computed(
    () => this.sessionActive() && !!this.feedId() && !!this.activeFeed()
  );

  private video: HTMLVideoElement | null = null;
  private fallbackHost: HTMLElement | null = null;
  private moduleHost: HTMLElement | null = null;
  private hls: HlsLike | null = null;
  private loadToken = 0;
  private sourceKey = '';
  private listenersAttached = false;

  private readonly onVideoPlaying = (): void => {
    if (!this.sessionActive()) return;
    this.playing.set(true);
    this.error.set(null);
  };

  private readonly onVideoPause = (): void => {
    if (this.sessionActive() && this.surface() !== 'closed') {
      this.playing.set(false);
    }
  };

  private readonly onVideoError = (): void => {
    this.failFeed();
  };

  private readonly onVideoEnterPip = (): void => {
    if (
      this.video &&
      typeof document !== 'undefined' &&
      document.pictureInPictureElement === this.video
    ) {
      this.surface.set('pip');
    }
  };

  private readonly onVideoLeavePip = (): void => {
    if (this.surface() !== 'pip') return;
    this.surface.set(this.moduleHost ? 'module' : 'floating');
  };

  /**
   * Registers the single video element owned by the app shell.
   *
   * The element is moved between the guide stage and the shell's floating host
   * rather than copied. That is the important distinction: moving one media
   * element preserves its buffer and its Picture-in-Picture session.
   */
  registerVideo(video: HTMLVideoElement, fallbackHost: HTMLElement): void {
    this.video = video;
    this.fallbackHost = fallbackHost;
    this.attachVideoListeners();
    this.moveVideo(this.moduleHost ?? fallbackHost);

    if (this.sessionActive() && this.feedId()) {
      void this.loadFeed(
        this.activeFeed(),
        this.channelId() ?? '',
        this.playing(),
        this.audioOn()
      );
    }
  }

  unregisterVideo(video: HTMLVideoElement): void {
    if (this.video !== video) return;
    this.detachVideoListeners();
    this.releaseSource();
    this.video = null;
    this.fallbackHost = null;
    this.moduleHost = null;
  }

  /**
   * Moves the one video into the guide's stage and returns any native PiP.
   *
   * The move happens whether or not a session is running. The guide mounts
   * this host *before* it tunes a feed, so waiting for an active session left
   * the element parked in the shell and the stage showed nothing but the
   * canvas scene — the live picture never appeared on screen.
   */
  mountInModule(host: HTMLElement): void {
    this.moduleHost = host;
    if (this.surface() === 'pip') {
      void this.exitNativePictureInPicture();
    }

    this.surface.set('module');
    this.moveVideo(host);
  }

  /**
   * Called while the guide is being destroyed.
   *
   * An explicit pop-out is a user instruction to keep watching, so the video
   * moves to the shell and the session stays alive. Leaving without popping
   * out releases the source as before.
   */
  detachFromModule(): void {
    this.moduleHost = null;
    if (this.isPersistent()) {
      this.moveVideo(this.fallbackHost);
      return;
    }
    this.close();
  }

  /** Starts or replaces the one live source for a channel. */
  async loadFeed(
    feed: SmuveTvLiveFeed | null,
    channelId: string,
    shouldPlay: boolean,
    audioOn: boolean
  ): Promise<void> {
    this.channelId.set(channelId || null);
    this.feedId.set(feed?.id ?? null);
    this.sessionActive.set(!!feed);
    this.playing.set(!!feed && shouldPlay);
    this.audioOn.set(!!feed && audioOn);
    this.error.set(null);
    this.ready.set(false);

    if (!feed) {
      this.sourceKey = '';
      this.releaseSource();
      return;
    }

    const nextKey = `${channelId}:${feed.id}`;
    if (this.video && this.sourceKey === nextKey && this.video.src) {
      this.moveVideo(this.moduleHost ?? this.fallbackHost);
      this.setAudio(audioOn);
      this.setPlaying(shouldPlay);
      return;
    }

    this.sourceKey = nextKey;
    this.releaseSource();

    const video = this.video;
    if (!video) return;

    // A fresh source attaches wherever the session currently lives, so tuning
    // a channel from the floating dock never yanks the video back into a
    // guide that is no longer on screen.
    this.moveVideo(this.moduleHost ?? this.fallbackHost);

    const token = ++this.loadToken;
    video.muted = !audioOn;

    try {
      if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = feed.url;
        video.addEventListener('loadedmetadata', this.onMediaReady, {
          once: true,
        });
        this.tryPlay(video, token);
        return;
      }

      const module = (await import('hls.js')) as unknown as {
        default: HlsConstructorLike;
      };
      if (token !== this.loadToken || this.video !== video) return;
      const Hls = module.default;
      if (!Hls.isSupported()) {
        this.failFeed();
        return;
      }

      const hls = new Hls({ enableWorker: true });
      this.hls = hls;
      hls.on(Hls.Events.FRAG_LOADED, () => {
        if (token !== this.loadToken || this.video !== video) return;
        this.ready.set(true);
        this.tryPlay(video, token);
      });
      hls.on(Hls.Events.ERROR, (_event: unknown, data: unknown) => {
        const fatal =
          !!data &&
          typeof data === 'object' &&
          'fatal' in data &&
          Boolean((data as { fatal?: unknown }).fatal);
        if (fatal && token === this.loadToken && this.video === video) {
          this.failFeed();
        }
      });
      hls.loadSource(feed.url);
      hls.attachMedia(video);
    } catch {
      if (token === this.loadToken) this.failFeed();
    }
  }

  /** Pauses or resumes the source without rebuilding the guide. */
  setPlaying(next: boolean): void {
    this.playing.set(next);
    const video = this.video;
    if (!video) return;
    if (next) {
      this.tryPlay(video, this.loadToken);
    } else {
      video.pause();
    }
  }

  /** Mutes or unmutes the live source and resumes it when sound is requested. */
  setAudio(next: boolean): void {
    this.audioOn.set(next);
    const video = this.video;
    if (!video) return;
    video.muted = !next;
    if (next) this.tryPlay(video, this.loadToken);
  }

  /**
   * Requests native PiP. A rejected request is not treated as success: the
   * caller receives false and the shell shows the floating fallback instead.
   */
  async popOut(): Promise<boolean> {
    if (!this.video || !this.hasPlayableSession()) return false;

    /*
     * The video must be on screen before the browser will open a Picture-in-
     * Picture window for it. Moving it into the dock is not enough on its own:
     * the dock is `display: none` until the surface signal reaches change
     * detection, and a video inside a display-none subtree is not eligible.
     * Wait for the frame that actually paints the dock, then ask. Without this
     * the request is refused on every browser and the viewer only ever got the
     * floating surface, which is the symptom this whole path exists to fix.
     */
    this.surface.set('floating');
    this.moveVideo(this.fallbackHost);
    await this.afterRender();

    const video = this.video as PictureInPictureVideo;
    if (
      !this.pipSupported() ||
      typeof video.requestPictureInPicture !== 'function' ||
      video.disablePictureInPicture
    ) {
      return false;
    }

    try {
      await video.requestPictureInPicture();
      const confirmed =
        typeof document !== 'undefined' &&
        document.pictureInPictureElement === video;
      if (confirmed) {
        this.surface.set('pip');
        return true;
      }
    } catch {
      // Permission policy, an already-open PiP window, and unsupported mobile
      // browsers all land here. The floating surface is the truthful fallback.
    }
    this.surface.set('floating');
    return false;
  }

  /**
   * Resolves once the browser has had a chance to paint the pending DOM.
   *
   * Two animation frames is the honest minimum: the first lets change
   * detection apply the surface class, the second lets layout and style settle
   * so the video is genuinely visible to the PiP eligibility check. Falls back
   * to a macrotask where no animation frame exists, and resolves immediately
   * during teardown rather than holding a caller open forever.
   */
  private afterRender(): Promise<void> {
    return new Promise<void>((resolve) => {
      if (typeof requestAnimationFrame !== 'function') {
        setTimeout(resolve, 0);
        return;
      }
      requestAnimationFrame(() => {
        if (typeof requestAnimationFrame !== 'function') {
          resolve();
          return;
        }
        requestAnimationFrame(() => resolve());
      });
    });
  }

  /** Leaves native PiP and keeps the session visible in the shell. */
  async dock(): Promise<void> {
    await this.exitNativePictureInPicture();
    if (!this.sessionActive()) return;
    this.surface.set(this.moduleHost ? 'module' : 'floating');
    this.moveVideo(this.moduleHost ?? this.fallbackHost);
  }

  /**
   * Stops and releases the source when the viewer explicitly closes TV.
   *
   * The session state is torn down *before* the Picture-in-Picture window is
   * asked to close, not after. Awaiting first left the session reading as
   * active for at least a frame after the caller was done with it — so a guide
   * being destroyed on a route change kept a "playing" session, and a decoder
   * still pulling a stream, for the length of that await.
   */
  async close(): Promise<void> {
    this.moduleHost = null;
    this.surface.set('closed');
    this.sessionActive.set(false);
    this.channelId.set(null);
    this.feedId.set(null);
    this.ready.set(false);
    this.playing.set(false);
    this.audioOn.set(false);
    this.error.set(null);
    this.sourceKey = '';
    this.moveVideo(this.fallbackHost);
    this.releaseSource();
    await this.exitNativePictureInPicture();
  }

  /** Human-readable feed failure used by both the guide and the floating dock. */
  failFeed(): void {
    this.ready.set(false);
    this.playing.set(false);
    const name = this.activeFeed()?.name;
    this.error.set(
      name
        ? `${name} is not answering right now. Showing the station scene instead.`
        : 'Live feed unavailable. Showing the station scene instead.'
    );
  }

  private readonly onMediaReady = (): void => {
    this.ready.set(true);
    if (this.playing()) this.tryPlay(this.video, this.loadToken);
  };

  private tryPlay(video: HTMLVideoElement, token: number): void {
    if (token !== this.loadToken || this.video !== video) return;
    try {
      const result = video.play() as Promise<void> | undefined;
      if (result && typeof result.catch === 'function') {
        void result.catch(() => {
          // Autoplay refusal is not a broken feed. The next gesture can retry.
          if (token === this.loadToken) this.playing.set(false);
        });
      }
    } catch {
      this.playing.set(false);
    }
  }

  private releaseSource(): void {
    this.hls?.destroy();
    this.hls = null;
    const video = this.video;
    if (!video) return;
    const hadSource = !!(
      video.getAttribute('src') ||
      video.currentSrc ||
      video.src
    );
    video.removeEventListener('loadedmetadata', this.onMediaReady);
    if (!hadSource) return;
    try {
      video.pause();
      video.removeAttribute('src');
      video.load();
    } catch {
      // A browser may already have detached the media element.
    }
  }

  private moveVideo(host: HTMLElement | null): void {
    if (!this.video || !host) return;
    if (this.video.parentElement !== host) host.appendChild(this.video);
  }

  private attachVideoListeners(): void {
    if (!this.video || this.listenersAttached) return;
    this.video.addEventListener('playing', this.onVideoPlaying);
    this.video.addEventListener('pause', this.onVideoPause);
    this.video.addEventListener('error', this.onVideoError);
    this.video.addEventListener('enterpictureinpicture', this.onVideoEnterPip);
    this.video.addEventListener('leavepictureinpicture', this.onVideoLeavePip);
    this.video.disablePictureInPicture = false;
    this.listenersAttached = true;
  }

  private detachVideoListeners(): void {
    if (!this.video || !this.listenersAttached) return;
    this.video.removeEventListener('playing', this.onVideoPlaying);
    this.video.removeEventListener('pause', this.onVideoPause);
    this.video.removeEventListener('error', this.onVideoError);
    this.video.removeEventListener('enterpictureinpicture', this.onVideoEnterPip);
    this.video.removeEventListener('leavepictureinpicture', this.onVideoLeavePip);
    this.listenersAttached = false;
  }

  private async exitNativePictureInPicture(): Promise<void> {
    if (typeof document === 'undefined' || !this.video) return;
    if (document.pictureInPictureElement !== this.video) return;
    const exit = (document as Document & {
      exitPictureInPicture?: () => Promise<void>;
    }).exitPictureInPicture;
    if (typeof exit !== 'function') return;
    try {
      await exit.call(document);
    } catch {
      // The window may have closed between the check and the call.
    }
  }
}
