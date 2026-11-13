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
 * Mirrors backend LiveStreamPlatform. `smuve` is the native S.M.U.V.E Live
 * destination (share link only, no OAuth popup).
 */
export type LiveStreamPlatform = 'smuve' | 'twitch' | 'kick' | 'youtube';

export const LIVE_STREAM_PLATFORMS: LiveStreamPlatform[] = [
  'smuve',
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
 *
 * The OAuth popup contract page lives at `/api/auth/:platform` and posts
 * back `{ type: '<PLATFORM>_AUTH_SUCCESS', platform: '<lower>' }`.
 *
 * S.M.U.V.E Live (`smuve`) is the native destination and skips the popup
 * entirely; the share link is the broadcast. Every active session is
 * re-read from the server while it runs so the host pill shows real viewer
 * joins and a stream ended elsewhere stops advertising itself locally.
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

  /**
   * Round currently starting: the issue POST for every platform, then the
   * OAuth popup for provider platforms. Null once live, cancelled or failed.
   */
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
      // 2. Start local camera + mic capture so the host preview, quality
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
      // Re-read the row while it is live so viewer joins and a stream ended
      // elsewhere reach this session instead of leaving a stale live pill.
      this.startStreamPoll();
      this.haptic.medium();

      if (opts.platform === 'smuve') {
        // Native S.M.U.V.E Live: there is no third-party popup — the share
        // link IS the broadcast, so the session is live as soon as the row
        // exists. No wedgeable AUTH PENDING state.
        this.pendingGolive.set(null);
        const copied = await this.copyShareUrl(true);
        this.notify.show(
          copied
            ? 'SMUVE_LIVE_STARTED — SHARE LINK COPIED'
            : 'SMUVE_LIVE_STARTED — COPY THE SHARE LINK',
          'success'
        );
        return issued;
      }

      // 4. Open the provider popup. The backend's /auth/:platform stub posts
      //    back *_AUTH_SUCCESS — we capture it and finalize.
      if (!this.openOAuthPopup(opts.platform)) {
        await this.abortGoliveRound('POPUP BLOCKED — ALLOW POPUPS TO GO LIVE');
        return null;
      }
      return issued;
    } catch (e: any) {
      console.error('[LiveStream] golive failed', e);
      this.notify.show(
        e?.status === 401 ? 'LOGIN EXPIRED' : 'GO_LIVE_FAILED',
        'warning'
      );
      // A failure after the row was issued (popup, capture, presence) must
      // not leave a ghost live row or a running camera behind.
      this.pendingGolive.set(null);
      this.clearPopupWatch();
      this.clearStreamPoll();
      this.social.stopStream();
      this.currentStream.set(null);
      this.social.updateStatus({ live: false });
      await this.endServerStreamQuietly();
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
  /** Monotonic id so an abandoned round can never act on a newer one. */
  private goliveRound = 0;
  private popupWatch: ReturnType<typeof setInterval> | null = null;
  private streamPoll: ReturnType<typeof setInterval> | null = null;

  private clearPopupWatch(): void {
    if (this.popupWatch !== null) {
      clearInterval(this.popupWatch);
      this.popupWatch = null;
    }
  }

  private clearStreamPoll(): void {
    if (this.streamPoll !== null) {
      clearInterval(this.streamPoll);
      this.streamPoll = null;
    }
  }

  /**
   * Poll the host's own row while live. This is what turns a viewer redeem
   * into a moving count in the LIVE pill, and what notices a stream ended by
   * the server (admin sweep, last socket disconnect) when no socket event is
   * subscribed on this surface.
   */
  private startStreamPoll(): void {
    this.clearStreamPoll();
    this.streamPoll = setInterval(() => {
      void this.refreshCurrentStream();
    }, 12_000);
  }

  /**
   * Open the provider popup and install its one-shot auth listener.
   * Returns false when the browser refused the popup so the caller can roll
   * the whole round back instead of leaving AUTH PENDING forever.
   */
  private openOAuthPopup(platform: LiveStreamPlatform): boolean {
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
    if (!popup) return false;

    const round = ++this.goliveRound;
    // A previous round's listener (if the user abandoned that auth) must
    // not linger and capture this round's callback with the wrong platform.
    this.goLiveListenerCleanup?.();
    this.goLiveListenerCleanup = null;
    this.clearPopupWatch();
    let apiOrigin = '';
    try {
      apiOrigin = new URL(APP_SECURITY_CONFIG.api_url).origin;
    } catch (e) {
      console.error('[LiveStream] Invalid API URL configuration', APP_SECURITY_CONFIG.api_url, e);
      apiOrigin = window.location.origin;
    }

    const finishRound = () => {
      this.clearPopupWatch();
      this.pendingGolive.set(null);
      this.goLiveListenerCleanup?.();
      this.goLiveListenerCleanup = null;
    };

    const handler = (event: MessageEvent) => {
      if (this.goliveRound !== round) return;
      if (event.origin !== apiOrigin && event.origin !== window.location.origin) {
        return;
      }

      if (typeof event?.data !== 'object' || !event.data) return;
      const t = (event.data as { type?: string }).type;
      if (
        typeof t === 'string' &&
        t === `${platform.toUpperCase()}_AUTH_SUCCESS`
      ) {
        // Finalize — flip the local stream flag, leave the server row
        // untouched (it was already issued).
        const cur = this.currentStream();
        if (cur) {
          this.currentStream.set({ ...cur, active: true });
          void this.copyShareUrl(true).then((copied) => {
            this.notify.show(
              copied
                ? `GO_LIVE_ON_${platform.toUpperCase()} — SHARE LINK COPIED`
                : `GO_LIVE_ON_${platform.toUpperCase()} — COPY THE SHARE LINK`,
              'success'
            );
          });
        }
        finishRound();
      }
    };
    const removeListener = () => window.removeEventListener('message', handler);
    window.addEventListener('message', handler);
    this.goLiveListenerCleanup = removeListener;

    // Closing the popup without authorizing used to leave AUTH PENDING and a
    // ghost live row (plus a running camera) on the server. Watch the popup
    // and roll the round back if it disappears before success.
    this.popupWatch = setInterval(() => {
      if (this.goliveRound !== round) {
        this.clearPopupWatch();
        return;
      }
      if (!popup.closed) return;
      this.clearPopupWatch();
      void this.abortGoliveRound('AUTH CANCELLED — NOT LIVE');
    }, 700);
    return true;
  }

  /**
   * Undo a Go-Live round that never got provider authorization: drop the
   * local session, release the camera/mic, and end the server row so the
   * share link cannot point at a stream that was never authorized.
   */
  private async abortGoliveRound(reason: string): Promise<void> {
    if (!this.pendingGolive()) return;
    this.goliveRound++;
    this.pendingGolive.set(null);
    this.clearPopupWatch();
    this.clearStreamPoll();
    this.goLiveListenerCleanup?.();
    this.goLiveListenerCleanup = null;
    this.social.stopStream();
    this.currentStream.set(null);
    this.social.updateStatus({ live: false });
    await this.endServerStreamQuietly();
    this.notify.show(reason, 'warning');
  }

  /** Best-effort end used by rollback paths where a toast is not wanted. */
  private async endServerStreamQuietly(): Promise<void> {
    const id = this.profileService.profile().id;
    if (!id) return;
    try {
      await firstValueFrom(
        this.http.post(
          `${APP_SECURITY_CONFIG.api_url}/users/${encodeURIComponent(
            id
          )}/live-streams/end`,
          {},
          { headers: this.authHeaders() }
        )
      );
    } catch {
      /* rollback is best-effort — the socket disconnect sweep is the net */
    }
  }

  /**
   * End the host's currently active stream. Clears local state, hits
   * REST, and updates socket presence so peers drop the LIVE indicator.
   */
  async endStream(): Promise<boolean> {
    // Any popup round still in flight is abandoned by an explicit STOP.
    this.goliveRound++;
    this.clearPopupWatch();
    this.clearStreamPoll();
    this.pendingGolive.set(null);
    this.goLiveListenerCleanup?.();
    this.goLiveListenerCleanup = null;
    // Release camera + mic and stop telemetry regardless of REST outcome
    // so the host is never left with a live capture after ending.
    this.social.stopStream();
    this.currentStream.set(null);
    const id = this.profileService.profile().id;
    if (!id) {
      this.social.updateStatus({ live: false });
      return false;
    }
    try {
      const result = await firstValueFrom(
        this.http.post<{ success: boolean; streamId: number | null }>(
          `${APP_SECURITY_CONFIG.api_url}/users/${encodeURIComponent(id)}/live-streams/end`,
          {},
          { headers: this.authHeaders() }
        )
      );
      const confirmed = !!result?.success;
      this.social.updateStatus({ live: false });
      this.notify.show(
        confirmed
          ? 'LIVE_STREAM_ENDED'
          : 'STREAM ENDED LOCALLY — SERVER DID NOT CONFIRM',
        confirmed ? 'info' : 'warning',
      );
      this.haptic.light();
      return confirmed;
    } catch (e: any) {
      // 404 means the row was already ended (last socket disconnect, admin
      // sweep, another tab). That is the desired end state, not a failure.
      if (e?.status === 404) {
        this.social.updateStatus({ live: false });
        this.notify.show('LIVE_STREAM_ALREADY_ENDED', 'info');
        return true;
      }
      console.error('[LiveStream] endStream failed', e);
      // Capture and presence are already stopped above. Keep the local state
      // consistent with that instead of still advertising a live stream.
      this.social.updateStatus({ live: false });
      this.notify.show(
        'STREAM ENDED LOCALLY — SERVER COULD NOT CONFIRM',
        'warning',
      );
      return false;
    }
  }

  // ── Viewer-side: tap-to-join paths ──────────────────────────────

  /** Pull a fresh stream record on demand. Returns only an ACTIVE row. */
  async refreshCurrentStream(): Promise<LiveStreamRecord | null> {
    const id = this.profileService.profile().id;
    if (!id) return null;
    try {
      const row = await firstValueFrom(
        this.http.get<LiveStreamRecord | null>(
          `${APP_SECURITY_CONFIG.api_url}/users/${encodeURIComponent(
            id
          )}/live-streams/current`,
          { headers: this.authHeaders() }
        )
      );
      const active = row && row.active ? row : null;
      if (active) {
        this.currentStream.set(active);
        return active;
      }
      // The server no longer has an active row. If this session thought it was
      // live (for example the last socket disconnected on another device),
      // stop advertising it locally and release the camera.
      if (this.currentStream()) {
        this.currentStream.set(null);
        this.clearStreamPoll();
        this.social.stopStream();
        this.social.updateStatus({ live: false });
        this.notify.show('LIVE STREAM ENDED', 'info');
      }
      return null;
    } catch {
      // Soft-fail: a transient request error must not tear down a live UI.
      return this.currentStream();
    }
  }

  /**
   * Restore a live session after a reload. Without this a host who refreshes
   * the page loses the LIVE pill, the share link, and the only STOP control
   * while their server row keeps advertising the broadcast.
   */
  async restoreActiveStream(): Promise<void> {
    if (this.currentStream()) return;
    const row = await this.refreshCurrentStream();
    if (!row?.active) return;
    void this.social.startStream(row.platform);
    this.startStreamPoll();
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
