import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { APP_SECURITY_CONFIG } from '../app.security';
import { TokenService } from './token.service';
import { UserProfileService } from './user-profile.service';
import { NotificationService } from './notification.service';
import { HapticService } from './haptic.service';
import { SocialNetworkingService } from './social-networking.service';

/**
 * Mirrors backend LiveStreamPlatform ("twitch" | "kick" | "youtube").
 * Used to assert UI inputs without importing the backend barrel.
 */
export type LiveStreamPlatform = 'twitch' | 'kick' | 'youtube';

export const LIVE_STREAM_PLATFORMS: LiveStreamPlatform[] = [
  'twitch',
  'kick',
  'youtube',
];

export interface LiveStreamRecord {
  id: number;
  shareToken: string;
  hostId: string;
  hostDisplayName: string | null;
  platform: LiveStreamPlatform;
  gameId: string | null;
  lobbyId: string | null;
  payload: Record<string, unknown> | null;
  active: boolean;
  startedAt: string;
  endedAt: string | null;
  viewerJoins: number;
  shareUrl: string;
}

/**
 * Backed by:
 *  - REST endpoints under `/api/users/:userId/live-streams/*` (host)
 *  - REST endpoints under `/api/live-streams/join/:token` (viewer)
 *  - socket events `live_stream_started | ended | resolved | redeem_ok | failed`
 *
 * The OAuth popup contract page lives at `/api/auth/:platform` and posts
 * back `{ type: '<PLATFORM>_AUTH_SUCCESS', platform: '<lower>' }`.
 */
@Injectable({ providedIn: 'root' })
export class LiveStreamService {
  private http = inject(HttpClient);
  private tokenService = inject(TokenService);
  private profileService = inject(UserProfileService);
  private notify = inject(NotificationService);
  private haptic = inject(HapticService);
  private social = inject(SocialNetworkingService);

  /** Currently active stream for this host (null when offline). */
  readonly currentStream = signal<LiveStreamRecord | null>(null);

  /** Last previewed stream from a `?live=` invite link (viewer mode). */
  readonly inboundPreview = signal<LiveStreamRecord | null>(null);

  /** Convenience computed — used by the inbound prompt. */
  readonly inboundHasLink = computed(() => !!this.inboundPreview());

  /** True while waiting for OAuth popup success. */
  readonly pendingGolive = signal<LiveStreamPlatform | null>(null);

  // ── Host-side lifecycle ────────────────────────────────────────────────

  /** Resolve current-user id for URL paths. Empty when logged out. */
  private get hostRoute(): string {
    const id = this.profileService.profile().id;
    if (!id) return '';
    return `/users/${encodeURIComponent(id)}/live-streams`;
  }

  private authHeaders(): Record<string, string> {
    const t = this.tokenService.jwtToken();
    return t ? { Authorization: `Bearer ${t}` } : {};
  }

  /**
   * Start a Go-Live session. Issues a server-backed stream row first
   * (so the shareUrl is deterministic), then opens the OAuth popup.
   * The popup's postMessage advances the local stream to ACTIVE.
   */
  async golive(opts: {
    platform: LiveStreamPlatform;
    gameId?: string;
    lobbyId?: string;
    payload?: Record<string, unknown>;
  }): Promise<LiveStreamRecord | null> {
    const token = this.tokenService.jwtToken();
    if (!token) {
      this.notify.show('LOGIN TO GO LIVE', 'info');
      return null;
    }
    if (!this.profileService.profile().id) {
      this.notify.show('PROFILE_NOT_LOADED — cannot go live', 'warning');
      return null;
    }
    try {
      this.pendingGolive.set(opts.platform);
      // 1. Issue the server row first so the popup's landing page can
      //    show the share URL immediately.
      const issued = await firstValueFrom(
        this.http.post<LiveStreamRecord>(
          `${APP_SECURITY_CONFIG.api_url}${this.hostRoute}`,
          {
            platform: opts.platform,
            gameId: opts.gameId,
            lobbyId: opts.lobbyId,
            payload: opts.payload,
            hostDisplayName:
              this.profileService.profile().artistName || 'Anonymous',
          },
          { headers: this.authHeaders() }
        )
      );
      this.currentStream.set({ ...issued, active: true });
      // 2. Open the OAuth popup. The backend's /auth/:platform stub
      //    posts back *_AUTH_SUCCESS — we capture it and finalize.
      this.openOAuthPopup(opts.platform, issued.shareUrl);
      // 3. Start local camera + mic capture so the host preview, quality
      //    tiers, and camera/mic toggles are live the moment the stream
      //    row is issued (capture fails gracefully into simulation mode).
      void this.social.startStream(opts.platform);
      // 3. Also tell the social-networking socket that we're going live
      //    so presence broadcasts pick up the LIVE indicator.
      this.social.updateStatus({
        live: true,
        livePlatform: opts.platform,
        liveShareToken: issued.shareToken,
        liveGameId: opts.gameId ?? undefined,
      });
      this.haptic.medium();
      return issued;
    } catch (e: any) {
      console.error('[LiveStream] golive failed', e);
      this.notify.show(
        e?.status === 401 ? 'LOGIN EXPIRED' : 'GO_LIVE_FAILED',
        'warning'
      );
      this.pendingGolive.set(null);
      return null;
    }
  }

  /**
   * Open the platform OAuth popup. The "postMessage listener" is bound
   * ONE TIME per Go-Live round and clears itself after the first match —
   * it captures the CURRENT platform so an abandoned round on platform A
   * can never swallow the auth callback of a later round on platform B.
   */
  private goLiveListenerCleanup: (() => void) | null = null;

  private openOAuthPopup(platform: LiveStreamPlatform, shareUrl: string): void {
    const width = 500;
    const height = 640;
    const left =
      typeof window !== 'undefined'
        ? window.screen.width / 2 - width / 2
        : 0;
    const top =
      typeof window !== 'undefined'
        ? window.screen.height / 2 - height / 2
        : 0;
    const popup = window.open(
      `${APP_SECURITY_CONFIG.api_url}/auth/${platform}`,
      `${platform} Auth`,
      `width=${width},height=${height},left=${left},top=${top}`
    );
    if (!popup) {
      this.notify.show('POPUP BLOCKED — allow popups to go live', 'warning');
      // A blocked popup can never deliver the auth callback — release the
      // caller from the stuck "AUTH PENDING…" state immediately and stop
      // the camera capture that was started for this round.
      this.pendingGolive.set(null);
      this.social.stopStream();
      return;
    }

    // A previous round's listener (if the user abandoned that auth) must
    // not linger and capture this round's callback with the wrong platform.
    this.goLiveListenerCleanup?.();
    let apiOrigin = '';
    try {
      apiOrigin = new URL(APP_SECURITY_CONFIG.api_url).origin;
    } catch (e) {
      console.error('[LiveStream] Invalid API URL configuration', APP_SECURITY_CONFIG.api_url, e);
      apiOrigin = window.location.origin;
    }

    const handler = (event: MessageEvent) => {
      if (event.origin !== apiOrigin && event.origin !== window.location.origin) {
        return;
      }

      if (typeof event?.data !== 'object' || !event.data) return;
      const t = (event.data as { type?: string }).type;
      if (
        typeof t === 'string' &&
        t === `${platform.toUpperCase()}_AUTH_SUCCESS`
      ) {
        // Finalize — flip the local stream flag, leave server row
        // untouched (it was already issued).
        const cur = this.currentStream();
        if (cur) {
          this.currentStream.set({ ...cur, active: true });
          this.notify.show(
            `GO_LIVE_ON_${platform.toUpperCase()} — share link copied!`,
            'success'
          );
          this.copyShareUrl(true);
        }
        this.pendingGolive.set(null);
        this.goLiveListenerCleanup?.();
      }
    };
    const removeListener = () => window.removeEventListener('message', handler);
    window.addEventListener('message', handler);
    this.goLiveListenerCleanup = removeListener;
  }

  /**
   * End the host's currently active stream. Clears local state, hits
   * REST, and updates socket presence so peers drop the LIVE indicator.
   */
  async endStream(): Promise<boolean> {
    // An auth popup that was abandoned must not wedge the picker in
    // "AUTH PENDING…" — ending/resetting the stream releases it too.
    this.pendingGolive.set(null);
    this.goLiveListenerCleanup?.();
    // Release camera + mic and stop telemetry regardless of REST outcome
    // so the host is never left with a live capture after ending.
    this.social.stopStream();
    const id = this.profileService.profile().id;
    if (!id) return false;
    try {
      const result = await firstValueFrom(
        this.http.post<{ success: boolean; streamId: number | null }>(
          `${APP_SECURITY_CONFIG.api_url}/users/${encodeURIComponent(id)}/live-streams/end`,
          {},
          { headers: this.authHeaders() }
        )
      );
      this.currentStream.set(null);
      if (!this.pendingGolive()) {
        this.social.updateStatus({ live: false });
      }
      this.notify.show('LIVE_STREAM_ENDED', 'info');
      this.haptic.light();
      return !!result?.success;
    } catch (e) {
      console.error('[LiveStream] endStream failed', e);
      this.notify.show('FAILED_TO_END_STREAM', 'warning');
      return false;
    }
  }

  // ── Viewer-side: tap-to-join paths ──────────────────────────────

  /** Pull a fresh stream record on demand. */
  async refreshCurrentStream(): Promise<void> {
    const id = this.profileService.profile().id;
    if (!id) return;
    try {
      const row = await firstValueFrom(
        this.http.get<LiveStreamRecord | null>(
          `${APP_SECURITY_CONFIG.api_url}/users/${encodeURIComponent(
            id
          )}/live-streams/current`,
          { headers: this.authHeaders() }
        )
      );
      this.currentStream.set(row ?? null);
    } catch (e) {
      // Soft-fail: leave whatever the user sees intact.
    }
  }

  /**
   * Resolve a viewer's inbound share-link. Returns null if the stream
   * is missing or ended. The caller shows the join-overlay.
   */
  async peekViewerToken(token: string): Promise<LiveStreamRecord | null> {
    try {
      const row = await firstValueFrom(
        this.http.get<LiveStreamRecord>(
          `${APP_SECURITY_CONFIG.api_url}/live-streams/join/${encodeURIComponent(
            token
          )}`
        )
      );
      this.inboundPreview.set(row);
      return row;
    } catch {
      this.inboundPreview.set(null);
      return null;
    }
  }

  /**
   * Viewer taps the inbound join overlay → record the redeem (server
   * increments `viewerJoins`) and return the host + lobby context so the
   * UI can navigate the viewer into the host's split-screen session.
   */
  async redeemViewerToken(token: string): Promise<LiveStreamRecord | null> {
    try {
      const row = await firstValueFrom(
        this.http.post<LiveStreamRecord>(
          `${APP_SECURITY_CONFIG.api_url}/live-streams/join/${encodeURIComponent(
            token
          )}/redeem`,
          {},
          { headers: this.authHeaders() }
        )
      );
      this.inboundPreview.set(row);
      this.haptic.medium();
      this.notify.show('JOINED LIVE STREAM', 'success');
      return row;
    } catch {
      this.notify.show('CANNOT_JOIN_LIVE_STREAM', 'warning');
      return null;
    }
  }

  /** Drop the inbound preview once the user navigates into the host's session. */
  clearInbound(): void {
    this.inboundPreview.set(null);
  }

  // ── Helpers ─────────────────────────────────────────────────────────

  /** Copy the share URL to clipboard without showing the tray modal. */
  async copyShareUrl(silent = false): Promise<boolean> {
    const url = this.currentStream()?.shareUrl;
    if (!url) return false;
    try {
      if (
        typeof navigator !== 'undefined' &&
        navigator.clipboard?.writeText
      ) {
        await navigator.clipboard.writeText(url);
        if (!silent) this.notify.show('SHARE LINK COPIED', 'success');
        return true;
      }
    } catch {
      /* fall through */
    }
    try {
      const ta = document.createElement('textarea');
      ta.value = url;
      ta.setAttribute('readonly', '');
      ta.style.position = 'absolute';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      if (ok && !silent) this.notify.show('SHARE LINK COPIED', 'success');
      return ok;
    } catch {
      return false;
    }
  }
}
