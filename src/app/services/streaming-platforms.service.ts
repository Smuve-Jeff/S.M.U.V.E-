import { HttpClient } from '@angular/common/http';
import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { APP_SECURITY_CONFIG } from '../app.security';
import { SnackbarService } from './snackbar.service';
import { TokenService } from './token.service';
import { UserProfileService } from './user-profile.service';

export type StreamingPlatformId =
  | 'twitch'
  | 'youtube'
  | 'kick'
  | 'facebook'
  | 'tiktok'
  | 'instagram'
  | 'discord'
  | 'x';

export interface StreamingPlatform {
  id: StreamingPlatformId;
  label: string;
  /**
   * Whether a broadcast can be routed here today. Instagram, Discord and X are
   * listed so the surface is complete, but they have no ingest path yet.
   */
  broadcast: boolean;
  /** The server has a real OAuth implementation for this provider. */
  connectable: boolean;
  /**
   * Where the push values live once the account is linked: Twitch and YouTube
   * resolve theirs server-side, Kick and Facebook use their own RTMP row, and
   * every other platform borrows a custom RTMP slot.
   */
  destination: "manual" | "custom" | null;
}

export const STREAMING_PLATFORMS: readonly StreamingPlatform[] = [
  {
    id: 'twitch',
    label: 'TWITCH',
    broadcast: true,
    connectable: true,
    destination: null,
  },
  // YouTube can still be linked (read-only account data), but it has no
  // ingest path in this product, so it is not a Go Live destination.
  {
    id: 'youtube',
    label: 'YOUTUBE',
    broadcast: false,
    connectable: true,
    destination: null,
  },
  // Kick and Facebook link over OAuth for the channel identity, but both still
  // broadcast from their own RTMP URL + key in Broadcast Push: Kick has no
  // public API for publishing a stream key, and Facebook Live needs a Page
  // token plus app review for publish_video.
  {
    id: 'kick',
    label: 'KICK',
    broadcast: true,
    connectable: true,
    destination: 'manual',
  },
  {
    id: 'facebook',
    label: 'FACEBOOK',
    broadcast: true,
    connectable: true,
    destination: 'manual',
  },
  {
    id: 'tiktok',
    label: 'TIKTOK',
    broadcast: false,
    connectable: false,
    destination: 'custom',
  },
  {
    id: 'instagram',
    label: 'INSTAGRAM',
    broadcast: false,
    connectable: false,
    destination: 'custom',
  },
  {
    id: 'discord',
    label: 'DISCORD',
    broadcast: false,
    connectable: false,
    destination: 'custom',
  },
  { id: 'x', label: 'X', broadcast: false, connectable: false, destination: 'custom' },
];

interface PlatformConnection {
  /** Channel/user name the provider reported at connect time. */
  displayName: string;
  connectedAt: string;
  lastSyncedAt: string;
}

interface PlatformConnectionDto {
  platform?: string;
  displayName?: string;
  connectedAt?: string;
  lastSyncedAt?: string;
}

interface ConnectionsResponse {
  connections?: PlatformConnectionDto[];
}

export interface FacebookPage {
  id: string;
  name: string;
  selected: boolean;
}

interface FacebookPagesResponse {
  pages?: { id?: unknown; name?: unknown; selected?: unknown }[];
}

interface AuthorizeResponse {
  authorizeUrl?: string;
}

interface SyncResponse extends ConnectionsResponse {
  refreshed?: number;
  disconnected?: string[];
}

/**
 * The host's streaming accounts, backed by the API.
 *
 * The browser never sees a provider token: it asks the server for a signed
 * authorize URL, the provider redirects the popup back to the server, and the
 * server exchanges and stores the grant. This service only mirrors the visible
 * result (which platform is linked, to which channel, and when it was last
 * confirmed) and owns the popup plumbing.
 */
@Injectable({ providedIn: 'root' })
export class StreamingPlatformsService {
  private readonly http = inject(HttpClient);
  private readonly profile = inject(UserProfileService);
  private readonly tokenService = inject(TokenService);
  private readonly snackbar = inject(SnackbarService);

  readonly platforms = STREAMING_PLATFORMS;
  readonly connections =
    signal<Partial<Record<StreamingPlatformId, PlatformConnection>>>({});
  /** When the server state was last read successfully, or null if never. */
  readonly syncedAt = signal<number | null>(null);
  readonly syncing = signal(false);
  /** The platform whose connect popup is open, if any. */
  readonly connecting = signal<StreamingPlatformId | null>(null);
  /** Bumped by every new authorization so an older popup cannot resume. */
  private authRound = 0;
  /** Pages the linked Facebook account can publish to. */
  readonly facebookPages = signal<FacebookPage[]>([]);
  readonly loadingFacebookPages = signal(false);
  readonly selectingFacebookPage = signal(false);
  /** Why the last Page read failed, or null when it succeeded. */
  readonly facebookPagesError = signal<string | null>(null);
  readonly facebookSelectedPageId = computed(
    () => this.facebookPages().find((page) => page.selected)?.id ?? '',
  );
  /**
   * Keep the Page row visible whenever Facebook is linked: with one Page it
   * shows the current destination, and with none it can explain the gap.
   */
  readonly facebookPagePickerVisible = computed(() =>
    this.isConnected('facebook'),
  );

  readonly connectedCount = computed(
    () =>
      this.platforms.filter((platform) => !!this.connections()[platform.id])
        .length,
  );

  constructor() {
    // Connections belong to the signed-in account: a profile change reloads
    // them instead of showing the previous account's channels.
    effect(() => {
      const userId = this.profile.profile()?.id ?? '';
      if (!userId) {
        this.connections.set({});
        this.syncedAt.set(null);
        return;
      }
      void this.load();
    });
  }

  isConnected(id: StreamingPlatformId): boolean {
    return !!this.connections()[id];
  }

  displayName(id: StreamingPlatformId): string {
    return this.connections()[id]?.displayName ?? '';
  }

  /**
   * Ask the server for a signed authorize URL and open the provider popup.
   * Pressing it on a connected platform re-authorises and replaces the grant.
   * This is the only popup implementation in the app: Tha Spot's account rows
   * and the Lab's GO LIVE preflight both wait on `connectAndWait`.
   */
  async connect(id: StreamingPlatformId): Promise<void> {
    const platform = this.platformFor(id);
    if (!platform) return;
    if (!platform.connectable) {
      this.snackbar.info(`${platform.label} CONNECT IS NOT AVAILABLE YET`);
      return;
    }
    this.connecting.set(id);
    try {
      const connected = await this.connectAndWait(id);
      if (connected) {
        await this.load();
        this.snackbar.success(`${platform.label} CONNECTED`);
      }
    } finally {
      this.connecting.set(null);
    }
  }

  /**
   * Run the provider OAuth flow and resolve once the popup reports back.
   * Resolves false on an unavailable URL, a blocked popup, a provider refusal,
   * a closed popup or a five-minute timeout; the caller decides whether that
   * aborts a GO LIVE attempt.
   *
   * Cancelling is round-based: a newer authorization (or an explicit stop)
   * abandons the older popup so a late callback cannot resume stale work.
   */
  async connectAndWait(id: StreamingPlatformId): Promise<boolean> {
    const platform = this.platformFor(id);
    if (!platform?.connectable) return false;
    const round = ++this.authRound;

    let authorizeUrl = '';
    try {
      const response = await firstValueFrom(
        this.http.post<AuthorizeResponse>(this.endpoint(`/${id}/authorize`), {}, {
          headers: this.headers(),
        }),
      );
      authorizeUrl =
        typeof response?.authorizeUrl === 'string' ? response.authorizeUrl : '';
    } catch (error) {
      // A stop/new attempt may have cancelled this round while the request was
      // in flight; do not report a stale failure into the new flow.
      if (this.authRound !== round) return false;
      this.snackbar.error(this.describe(error, platform.label));
      return false;
    }
    // Cancellation can land while the authorize request is pending. Never open
    // a popup for a round the host already abandoned.
    if (this.authRound !== round) return false;
    if (!authorizeUrl) {
      this.snackbar.warning(`${platform.label} AUTH UNAVAILABLE — TRY AGAIN`);
      return false;
    }
    if (typeof window === 'undefined') return false;

    const width = 500;
    const height = 640;
    const left = window.screen.width / 2 - width / 2;
    const top = window.screen.height / 2 - height / 2;
    let popup: Window | null = null;

    const expectedType = `${id.toUpperCase()}_AUTH_SUCCESS`;
    const failedType = `${id.toUpperCase()}_AUTH_FAILED`;
    let apiOrigin = window.location.origin;
    try {
      apiOrigin = new URL(APP_SECURITY_CONFIG.api_url).origin;
    } catch {
      /* keep the page origin */
    }

    return new Promise<boolean>((resolve) => {
      let settled = false;
      let watch: ReturnType<typeof setInterval> | null = null;
      let timeout: ReturnType<typeof setTimeout> | null = null;
      const cleanup = () => {
        window.removeEventListener('message', handler);
        if (watch !== null) clearInterval(watch);
        if (timeout !== null) clearTimeout(timeout);
      };
      const finish = (ok: boolean, reason?: string) => {
        if (settled) return;
        settled = true;
        cleanup();
        if (!ok && reason) this.snackbar.warning(reason);
        resolve(ok);
      };
      const handler = (event: MessageEvent) => {
        if (this.authRound !== round) return;
        if (
          event.origin !== apiOrigin &&
          event.origin !== window.location.origin
        ) {
          return;
        }
        if (typeof event.data !== 'object' || !event.data) return;
        const data = event.data as { type?: string; message?: string };
        if (data.type === expectedType) {
          finish(true);
          return;
        }
        if (data.type === failedType) {
          finish(
            false,
            typeof data.message === 'string' && data.message
              ? data.message.toUpperCase()
              : `${platform.label} AUTH FAILED`,
          );
        }
      };
      // Listen before opening: a fast provider callback must never beat the
      // listener and leave the picker stuck in AUTH PENDING.
      window.addEventListener('message', handler);
      popup = window.open(
        authorizeUrl,
        `${id} Auth`,
        `width=${width},height=${height},left=${left},top=${top}`,
      );
      if (!popup) {
        finish(false, 'POPUP BLOCKED — ALLOW POPUPS TO CONNECT');
        return;
      }
      watch = setInterval(() => {
        if (this.authRound !== round) {
          // The host stopped or started another attempt: take the stale
          // provider window down with the listener instead of orphaning it.
          popup?.close?.();
          finish(false);
          return;
        }
        if (popup?.closed) finish(false, 'AUTH CANCELLED');
      }, 700);
      // A forgotten popup must not hold the caller in AUTH PENDING forever.
      timeout = setTimeout(
        () => finish(false, 'AUTH TIMED OUT'),
        5 * 60_000,
      );
    });
  }

  /** Abandon any popup still waiting for a provider callback. */
  cancelPendingAuthorization(): void {
    this.authRound++;
  }

  /**
   * Re-confirm every linked account with the provider and reload the list.
   * Returns false when the read failed, so a caller refreshing several panels
   * can report one honest result instead of two competing toasts.
   */
  async sync(options: { silent?: boolean } = {}): Promise<boolean> {
    this.syncing.set(true);
    try {
      const result = await firstValueFrom(
        this.http.post<SyncResponse>(this.endpoint('/sync'), {}, {
          headers: this.headers(),
        }),
      );
      this.apply(result?.connections ?? []);
      const dropped = (result?.disconnected ?? []).map((id) => id.toUpperCase());
      if (dropped.length) {
        this.snackbar.warning(
          `${dropped.join(', ')} NEEDS TO BE RECONNECTED`,
        );
        return true;
      }
      if (!options.silent) {
        const count = this.connectedCount();
        this.snackbar.info(
          count === 0
            ? 'NO STREAMING PLATFORMS CONNECTED YET'
            : `SYNCED — ${count} PLATFORM${count === 1 ? '' : 'S'} CONNECTED`,
        );
      }
      return true;
    } catch (error) {
      this.snackbar.error(this.describe(error, 'SYNC'));
      return false;
    } finally {
      this.syncing.set(false);
    }
  }

  /** Read the Pages behind the Facebook grant; silent when it fails. */
  async loadFacebookPages(): Promise<void> {
    if (!this.isConnected('facebook')) {
      this.facebookPages.set([]);
      this.facebookPagesError.set(null);
      return;
    }
    this.loadingFacebookPages.set(true);
    this.facebookPagesError.set(null);
    try {
      const response = await firstValueFrom(
        this.http.get<FacebookPagesResponse>(this.endpoint('/facebook/pages'), {
          headers: this.headers(),
        }),
      );
      this.facebookPages.set(this.readFacebookPages(response?.pages));
    } catch (error) {
      // The linked Page still receives the broadcast; the picker keeps its last
      // list and says why it could not refresh instead of hiding the failure.
      this.facebookPagesError.set(
        this.describe(error, 'FACEBOOK PAGES'),
      );
    } finally {
      this.loadingFacebookPages.set(false);
    }
  }

  /**
   * Point the Live Video at another Page the grant manages. Returns false when
   * the server refused, so the picker can put itself back on the live choice.
   */
  async selectFacebookPage(pageId: string): Promise<boolean> {
    const wanted = String(pageId || '').trim();
    if (!wanted || this.selectingFacebookPage()) return false;
    this.selectingFacebookPage.set(true);
    try {
      const response = await firstValueFrom(
        this.http.put<FacebookPagesResponse>(
          this.endpoint('/facebook/page'),
          { pageId: wanted },
          { headers: this.headers() },
        ),
      );
      const pages = this.readFacebookPages(response?.pages);
      this.facebookPages.set(pages);
      this.facebookPagesError.set(null);
      const page = pages.find((entry) => entry.selected);
      if (page) {
        // Mirror the server's new display name without a second round trip.
        this.connections.update((current) =>
          current.facebook
            ? {
                ...current,
                facebook: { ...current.facebook, displayName: page.name },
              }
            : current,
        );
      }
      this.snackbar.success(
        `FACEBOOK PAGE — ${page?.name ?? wanted}`.toUpperCase(),
      );
      return true;
    } catch (error) {
      this.snackbar.error(this.describe(error, 'FACEBOOK PAGE'));
      return false;
    } finally {
      this.selectingFacebookPage.set(false);
    }
  }

  async disconnect(id: StreamingPlatformId): Promise<void> {
    const platform = this.platformFor(id);
    if (!platform) return;
    try {
      await firstValueFrom(
        this.http.delete(this.endpoint(`/${id}`), { headers: this.headers() }),
      );
      this.connections.update((current) => {
        const next = { ...current };
        delete next[id];
        return next;
      });
      this.snackbar.info(`${platform.label} DISCONNECTED`);
    } catch (error) {
      this.snackbar.error(this.describe(error, platform.label));
    }
  }

  private platformFor(id: StreamingPlatformId): StreamingPlatform | undefined {
    return this.platforms.find((platform) => platform.id === id);
  }

  /** Silent read: a failed load keeps whatever the last good one showed. */
  private async load(): Promise<void> {
    try {
      const response = await firstValueFrom(
        this.http.get<ConnectionsResponse>(this.endpoint(), {
          headers: this.headers(),
        }),
      );
      this.apply(response?.connections ?? []);
    } catch {
      // Offline or signed out: stale counts are better than a false "none".
    }
  }

  private apply(rows: PlatformConnectionDto[]): void {
    const next: Partial<Record<StreamingPlatformId, PlatformConnection>> = {};
    for (const row of rows) {
      const id = String(row?.platform ?? '').toLowerCase() as StreamingPlatformId;
      if (!this.platforms.some((platform) => platform.id === id)) continue;
      next[id] = {
        displayName: row.displayName ?? id.toUpperCase(),
        connectedAt: row.connectedAt ?? new Date().toISOString(),
        lastSyncedAt: row.lastSyncedAt ?? new Date().toISOString(),
      };
    }
    this.connections.set(next);
    this.syncedAt.set(Date.now());
    if (next.facebook) void this.loadFacebookPages();
    else {
      this.facebookPages.set([]);
      this.facebookPagesError.set(null);
    }
  }

  private readFacebookPages(
    rows: FacebookPagesResponse['pages'],
  ): FacebookPage[] {
    return (rows ?? [])
      .filter(
        (row) => typeof row?.id === 'string' && typeof row?.name === 'string',
      )
      .map((row) => ({
        id: row.id as string,
        name: row.name as string,
        selected: row.selected === true,
      }));
  }

  /** The server's own message is more useful than a status code. */
  private describe(error: unknown, label: string): string {
    const body = (error as { error?: { error?: unknown } } | null)?.error;
    const message = typeof body?.error === 'string' ? body.error.trim() : '';
    return message ? message.toUpperCase() : `${label} REQUEST FAILED`;
  }

  private endpoint(path = ''): string {
    return `${APP_SECURITY_CONFIG.api_url}/stream-accounts${path}`;
  }

  private headers(): Record<string, string> {
    const token = this.tokenService.jwtToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }
}
