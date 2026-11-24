import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { APP_SECURITY_CONFIG } from '../app.security';
import { TokenService } from './token.service';
import { UserProfileService } from './user-profile.service';
import { NotificationService } from './notification.service';
import { HapticService } from './haptic.service';
import { SocialNetworkingService } from './social-networking.service';
import {
  BroadcastIngestService,
  type IngestPlatform,
} from './broadcast-ingest.service';
import { StreamingPlatformsService } from './streaming-platforms.service';
import type { Socket } from 'socket.io-client';
import { saveString, deleteSaved } from './guarded-storage';

/**
 * Mirrors backend LiveStreamPlatform. `smuve` is the native S.M.U.V.E Live
 * destination (share link only, no OAuth popup).
 */
export type LiveStreamPlatform =
  | 'smuve'
  | 'twitch'
  | 'kick'
  | 'facebook'
  | 'custom'
  | 'custom2'
  | 'custom3'
  | 'custom4'
  | 'youtube'
  | 'tiktok';

export const LIVE_STREAM_PLATFORMS: LiveStreamPlatform[] = [
  'smuve',
  'twitch',
  'kick',
  'facebook',
  'custom',
  'custom2',
  'custom3',
  'custom4',
  'youtube',
  'tiktok',
];

/**
 * What the Go Live picker may offer today. YouTube's stored grant is
 * read-only and TikTok has no ingest path, so both stay in
 * LIVE_STREAM_PLATFORMS only so old rows still decode. Facebook and the four
 * custom RTMP slots use the manual URL + key saved in Broadcast Push, just
 * like Kick.
 */
export const GO_LIVE_PLATFORMS = [
  'smuve',
  'twitch',
  'kick',
  'facebook',
  'custom',
  'custom2',
  'custom3',
  'custom4',
] as const;
export type GoLivePlatform = (typeof GO_LIVE_PLATFORMS)[number];

/** Per-tab proof that this browser is the one serving the broadcast. */
const HOST_TOKEN_STORAGE_KEY = 'smuve.live.hostToken';

/** Stable share-link viewer key; persisted so a refresh is still one join. */
const LIVE_VIEWER_ID_STORAGE_KEY = 'smuve.live.viewerId';

/** One watchable entry in the discovery directory, from REST or presence. */
export interface LiveDirectoryEntry {
  shareToken: string;
  hostId: string;
  hostName: string;
  platform: string;
  gameId: string | null;
  viewerJoins?: number;
}

export interface LiveDestinationRecord {
  platform: GoLivePlatform;
  status: 'pending' | 'connecting' | 'live' | 'degraded' | 'failed' | 'ended';
  relayId: string | null;
  error: string | null;
}

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
  /** Platforms in this one session; old rows may omit it. */
  destinations?: LiveDestinationRecord[];
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

  /** Server-authoritative active broadcasts (falls back to presence below). */
  readonly activeStreams = signal<LiveStreamRecord[]>([]);

  /** Guards against overlapping directory polls. */
  private loadingActiveStreams = false;
  /** Socket currently wired for live-directory updates. */
  private directorySocket?: Socket;
  /** Tracks socket transitions so a reconnect can trigger one catch-up fetch. */
  private socketStateInitialized = false;
  private socketWasConnected = false;
  /** Coalesces socket signals into one immediate directory refetch. */
  private readonly onDirectoryChanged = () => {
    void this.loadActiveStreams();
  };

  /** Last previewed stream from a `?live=` invite link (viewer mode). */
  readonly inboundPreview = signal<LiveStreamRecord | null>(null);

  /** Convenience computed — used by the inbound prompt. */
  readonly inboundHasLink = computed(() => !!this.inboundPreview());

  /**
   * Platform whose authorization / issue is in flight. Null once live,
   * cancelled or failed.
   */
  readonly pendingGolive = signal<GoLivePlatform | null>(null);

  /**
   * Everything watchable right now. REST covers hosts whose presence event
   * was missed (fresh login, another server instance); presence adds live
   * peers whose identity is fresher than the last directory fetch. Deduped by
   * share token, newest viewer counts first, and never includes this host.
   */
  readonly liveDirectory = computed<LiveDirectoryEntry[]>(() => {
    const selfId = this.profileService.profile().id;
    const blocked = new Set(
      this.social.blockedUsers().map((u) => String(u.userId)),
    );
    const entries = new Map<string, LiveDirectoryEntry>();
    for (const row of this.activeStreams()) {
      if (!row?.active || !row.shareToken) continue;
      if (selfId && String(row.hostId) === String(selfId)) continue;
      if (blocked.has(String(row.hostId))) continue;
      entries.set(row.shareToken, {
        shareToken: row.shareToken,
        hostId: row.hostId,
        hostName: row.hostDisplayName || 'ANONYMOUS',
        platform: row.platform,
        gameId: row.gameId,
        viewerJoins: row.viewerJoins,
      });
    }
    for (const peer of this.social.liveNow()) {
      const token = peer.liveShareToken;
      if (!token || !peer.live || entries.has(token)) continue;
      if (selfId && String(peer.userId) === String(selfId)) continue;
      entries.set(token, {
        shareToken: token,
        hostId: peer.userId,
        hostName: peer.artistName || 'ANONYMOUS',
        platform: peer.livePlatform || 'smuve',
        gameId: peer.liveGameId ?? null,
      });
    }
    return [...entries.values()].sort(
      (a, b) => (b.viewerJoins ?? 0) - (a.viewerJoins ?? 0),
    );
  });

  constructor() {
    // `register_presence` replaces presence metadata wholesale, so a socket
    // reconnect would advertise the host as online but not live. Register the
    // stream identity as a presence extra so every (re)connect carries it.
    this.social.setPresenceExtrasProvider(() => this.livePresenceMetadata());

    // Stream starts/ends arrive over the shared socket (including REST-driven
    // ones via live_directory_changed), so refresh the directory immediately
    // instead of waiting for the next poll. Rebind whenever the socket comes
    // back after a disconnect or a re-login rebuilds it.
    effect(() => {
      const connected = this.social.socketConnected();
      if (connected) this.bindDirectorySocket();
      else this.unbindDirectorySocket();

      // Start/end events are lost while the socket is down. Reconcile once on
      // reconnect; the first run is not a reconnect (opening the surface
      // already loads the directory).
      if (
        this.socketStateInitialized &&
        connected &&
        !this.socketWasConnected
      ) {
        void this.loadActiveStreams();
      }
      this.socketStateInitialized = true;
      this.socketWasConnected = connected;
    });
  }

  private bindDirectorySocket(): void {
    const socket = this.social.getSocket();
    if (!socket || socket === this.directorySocket) return;
    this.unbindDirectorySocket();
    this.directorySocket = socket;
    socket.on('live_stream_started', this.onDirectoryChanged);
    socket.on('live_stream_ended', this.onDirectoryChanged);
    socket.on('live_directory_changed', this.onDirectoryChanged);
  }

  private unbindDirectorySocket(): void {
    const socket = this.directorySocket;
    if (!socket) return;
    socket.off('live_stream_started', this.onDirectoryChanged);
    socket.off('live_stream_ended', this.onDirectoryChanged);
    socket.off('live_directory_changed', this.onDirectoryChanged);
    this.directorySocket = undefined;
  }

  /** Presence fields that make this host discoverable as a live stream. */
  private livePresenceMetadata(): Record<string, unknown> {
    const stream = this.currentStream();
    if (!stream?.active || !this.ownsBroadcast()) return {};
    return {
      live: true,
      livePlatform: stream.platform,
      liveShareToken: stream.shareToken,
      liveGameId: stream.gameId ?? undefined,
    };
  }

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

  private destinationSet(opts: {
    platform: LiveStreamPlatform;
    destinations?: GoLivePlatform[];
  }): GoLivePlatform[] {
    const requested =
      Array.isArray(opts.destinations) && opts.destinations.length
        ? opts.destinations
        : [opts.platform];
    const unique: GoLivePlatform[] = [];
    for (const platform of requested) {
      if (!this.isGoLivePlatform(platform)) {
        throw new Error(
          `${platform.toUpperCase()} IS NOT AVAILABLE FOR GO LIVE YET`,
        );
      }
      if (!unique.includes(platform)) unique.push(platform);
    }
    const primary = opts.platform;
    if (this.isGoLivePlatform(primary) && !unique.includes(primary)) {
      unique.unshift(primary);
    }
    if (unique.length === 0) {
      throw new Error('CHOOSE AT LEAST ONE GO LIVE DESTINATION');
    }
    if (unique.length > 5) {
      throw new Error('CHOOSE AT MOST 5 GO LIVE DESTINATIONS');
    }
    if (unique.filter((value) => value !== 'smuve').length > 4) {
      throw new Error('CHOOSE AT MOST 4 PROVIDER DESTINATIONS');
    }
    return unique;
  }

  private providerPlatforms(destinations: GoLivePlatform[]): IngestPlatform[] {
    return destinations.filter(
      (platform): platform is IngestPlatform =>
        platform === 'twitch' ||
        platform === 'kick' ||
        platform === 'facebook' ||
        platform === 'custom' ||
        platform === 'custom2' ||
        platform === 'custom3' ||
        platform === 'custom4',
    );
  }

  /** Provider outputs for a row, including rows created before destinations. */
  private providerDestinations(
    stream: Pick<LiveStreamRecord, 'platform' | 'destinations'>,
  ): IngestPlatform[] {
    const platforms = stream.destinations?.length
      ? stream.destinations.map((destination) => destination.platform)
      : [stream.platform as GoLivePlatform];
    return this.providerPlatforms(platforms);
  }

  /** Record the relay's per-destination verdict on the live row. */
  private async persistDestinationStatuses(
    relayId: string | null,
    statuses: Partial<Record<GoLivePlatform, LiveDestinationRecord['status']>>,
  ): Promise<void> {
    const id = this.profileService.profile().id;
    if (!id || !relayId) return;
    try {
      await firstValueFrom(
        this.http.patch<LiveStreamRecord>(
          `${APP_SECURITY_CONFIG.api_url}/users/${encodeURIComponent(id)}/live-streams/destinations`,
          { relayId, statuses },
          { headers: this.authHeaders() },
        ),
      );
    } catch {
      // Live local state is already correct; persistence is best effort.
    }
  }

  /**
   * Start a Go-Live session. Issues a server-backed stream row first
   * (so the shareUrl is deterministic), then opens the OAuth popup.
   * The popup's postMessage advances the local stream to ACTIVE.
   */
  async golive(opts: {
    platform: LiveStreamPlatform;
    destinations?: GoLivePlatform[];
    gameId?: string;
    lobbyId?: string;
    payload?: Record<string, unknown>;
  }): Promise<LiveStreamRecord | null> {
    if (this.pendingGolive()) {
      // A double-click must not issue a second row or start a second capture.
      this.notify.show('GO LIVE IS ALREADY STARTING', 'info');
      return null;
    }
    if (this.currentStream()?.active) {
      this.notify.show(
        'ALREADY LIVE — END THE CURRENT BROADCAST FIRST',
        'info',
      );
      return null;
    }
    const platform = opts.platform;
    const token = this.tokenService.jwtToken();
    if (!token) {
      this.notify.show('LOGIN TO GO LIVE', 'info');
      return null;
    }
    if (!this.profileService.profile().id) {
      this.notify.show('PROFILE_NOT_LOADED — cannot go live', 'warning');
      return null;
    }
    if (!this.isGoLivePlatform(platform)) {
      this.notify.show(
        `${platform.toUpperCase()} IS NOT AVAILABLE FOR GO LIVE YET`,
        'warning',
      );
      return null;
    }
    let destinations: GoLivePlatform[];
    try {
      destinations = this.destinationSet(opts);
    } catch (error: any) {
      this.notify.show(String(error?.message ?? error), 'warning');
      return null;
    }
    const providerPlatforms = this.providerPlatforms(destinations);

    // The GO LIVE click is the user gesture that lets the browser start the
    // mixer. Prime before OAuth, destination preflight, or the row request:
    // all of those await, and the WHIP mix is built after them.
    if (providerPlatforms.length) this.ingest.primeAudioContext();

    this.pendingGolive.set(platform);
    let issued: LiveStreamRecord | null = null;
    try {
      // 1. Prove every provider destination before creating a row or turning
      //    on a camera. A cancelled auth used to leave a ghost live row behind.
      await this.ingest.load();
      if (providerPlatforms.includes('twitch')) {
        const authorized = await this.authorizeProvider('twitch');
        if (!authorized) {
          this.pendingGolive.set(null);
          this.ingest.closePrimedAudioContext();
          return null;
        }
        await this.ingest.load();
      }
      const missing = providerPlatforms.find(
        (value) => !this.ingest.ready(value),
      );
      if (missing) {
        this.pendingGolive.set(null);
        this.ingest.closePrimedAudioContext();
        this.notify.show(
          `SAVE YOUR ${missing.toUpperCase()} STREAM URL AND KEY IN SETTINGS → STREAMING FIRST`,
          'warning',
        );
        return null;
      }

      // 2. Issue the row only once the destination is usable.
      issued = await firstValueFrom(
        this.http.post<LiveStreamRecord>(
          `${APP_SECURITY_CONFIG.api_url}${this.hostRoute}`,
          {
            platform,
            destinations,
            gameId: opts.gameId,
            lobbyId: opts.lobbyId,
            payload: opts.payload,
            hostDisplayName:
              this.profileService.profile().artistName || 'Anonymous',
          },
          { headers: this.authHeaders() },
        ),
      );
      // 3. Claim this tab before capture/presence: ownsBroadcast gates both
      //    the host effect and the live presence metadata.
      this.markHostingToken(issued.shareToken);
      this.currentStream.set({ ...issued, active: true });
      const started = await this.social.startStream(platform);
      if (started === false) {
        // STOP or leaving the surface cancelled the capture after the row was
        // issued. Roll the row back instead of advertising a ghost broadcast.
        this.pendingGolive.set(null);
        this.clearStreamPoll();
        this.clearHostingToken();
        this.social.stopStream();
        this.currentStream.set(null);
        this.social.updateStatus({ live: false });
        await this.endServerStreamQuietly();
        return null;
      }
      this.social.updateStatus(this.livePresenceMetadata());
      this.startStreamPoll();
      this.haptic.medium();

      // 4. One relay session fans out to every selected provider. The native
      //    share link is already live; a failed push is reported without
      //    tearing that room down.
      const pushed = providerPlatforms.length
        ? await this.ingest.start(providerPlatforms)
        : true;
      if (providerPlatforms.length) {
        await this.persistDestinationStatuses(
          this.ingest.activeRelayId(),
          Object.fromEntries(
            providerPlatforms.map((value) => [
              value,
              pushed ? 'live' : 'failed',
            ]),
          ) as Partial<Record<GoLivePlatform, 'live' | 'failed'>>,
        );
      }
      this.pendingGolive.set(null);
      const copied = await this.copyShareUrl(true);
      const label = destinations
        .map((value) => value.toUpperCase())
        .join(' + ');
      this.notify.show(
        pushed
          ? `${label} LIVE${copied ? ' — SHARE LINK COPIED' : ' — COPY THE SHARE LINK'}`
          : `${label} PUSH FAILED — SHARE LINK IS STILL LIVE`,
        pushed ? 'success' : 'warning',
      );
      return issued;
    } catch (e: any) {
      console.error('[LiveStream] golive failed', e);
      this.notify.show(
        e?.status === 401 ? 'LOGIN EXPIRED' : 'GO_LIVE_FAILED',
        'warning',
      );
      // A failure after WHIP went live must stop the push too; otherwise the
      // camera would be released while the relay kept publishing. A primed
      // context is only useful until WHIP starts.
      const pushState = this.ingest.state();
      if (pushState === 'live' || pushState === 'connecting') {
        try {
          await this.ingest.stop();
        } catch {
          /* best-effort cleanup */
        }
      } else {
        this.ingest.closePrimedAudioContext();
      }
      // A failure after the row was issued must not leave a ghost live row
      // or a running camera behind.
      this.pendingGolive.set(null);
      this.clearStreamPoll();
      this.clearHostingToken();
      this.social.stopStream();
      this.currentStream.set(null);
      this.social.updateStatus({ live: false });
      if (issued) await this.endServerStreamQuietly();
      return null;
    }
  }
  private streamPoll: ReturnType<typeof setInterval> | null = null;

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

  /** Best-effort end used by rollback paths where a toast is not wanted. */
  private async endServerStreamQuietly(): Promise<void> {
    const id = this.profileService.profile().id;
    if (!id) return;
    try {
      await firstValueFrom(
        this.http.post(
          `${APP_SECURITY_CONFIG.api_url}/users/${encodeURIComponent(
            id,
          )}/live-streams/end`,
          {},
          { headers: this.authHeaders() },
        ),
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
    // Any auth round still in flight is abandoned by an explicit STOP.
    this.platforms.cancelPendingAuthorization();
    this.clearStreamPoll();
    this.pendingGolive.set(null);
    this.clearHostingToken();
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
          { headers: this.authHeaders() },
        ),
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
          `${APP_SECURITY_CONFIG.api_url}/users/${encodeURIComponent(id)}/live-streams/current`,
          { headers: this.authHeaders() },
        ),
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
        this.clearHostingToken();
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
    this.startStreamPoll();
    // A reload in the owning tab restores capture and presence. Any other
    // tab (or a second device) only shows the live pill and the RESUME HERE
    // control; starting capture there would make two hosts compete for the
    // same room and answer every viewer twice.
    if (!this.ownsBroadcast()) return;
    const started = await this.social.startStream(row.platform);
    if (started === false) {
      this.social.updateStatus({ live: false });
      return;
    }
    // Re-announce after a reload: the socket may have registered presence
    // before the session was restored, leaving the host invisible as live.
    this.social.updateStatus(this.livePresenceMetadata());
    // A reload killed the browser's WHIP publisher even though the relay and
    // the server row survived. Re-open the provider push in the owning tab so
    // Twitch/Kick/Facebook do not keep showing a frozen frame after recovery.
    const providers = this.providerDestinations(row);
    if (providers.length) {
      await this.ingest.load();
      await this.ingest.start(providers);
    }
  }

  /**
   * Load the server's active-stream directory. This is additive discovery:
   * a transient failure keeps the last good list (and presence) instead of
   * blanking the NET tab.
   */
  async loadActiveStreams(): Promise<void> {
    if (this.loadingActiveStreams || !this.tokenService.jwtToken()) return;
    this.loadingActiveStreams = true;
    try {
      const rows = await firstValueFrom(
        this.http.get<LiveStreamRecord[]>(
          `${APP_SECURITY_CONFIG.api_url}/live-streams/active`,
          { headers: this.authHeaders() },
        ),
      );
      this.activeStreams.set(
        Array.isArray(rows)
          ? rows.filter((row) => !!row?.active && !!row.shareToken)
          : [],
      );
    } catch {
      // Keep the previous directory; presence still covers online hosts.
    } finally {
      this.loadingActiveStreams = false;
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
            token,
          )}`,
        ),
      );
      this.inboundPreview.set(row);
      return row;
    } catch {
      this.inboundPreview.set(null);
      return null;
    }
  }

  /**
   * Open the viewer surface straight from a share token when the preview
   * lookup could not answer (API hiccup, guest rate limit, cold start).
   *
   * The token is the capability, and the signaling socket re-validates it on
   * join — so a failed REST peek must not leave a viewer with no player at
   * all when the peer-to-peer feed would have worked.
   */
  openInboundFallback(token: string): void {
    if (!token) return;
    const current = this.inboundPreview();
    if (current?.shareToken === token) return;
    this.inboundPreview.set({
      id: 0,
      shareToken: token,
      hostId: '',
      hostDisplayName: null,
      platform: 'smuve',
      gameId: null,
      lobbyId: null,
      payload: null,
      active: true,
      startedAt: new Date().toISOString(),
      endedAt: null,
      viewerJoins: 0,
      shareUrl: '',
    });
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
          `${APP_SECURITY_CONFIG.api_url}/live-streams/join/${encodeURIComponent(token)}/redeem`,
          { viewerId: this.viewerIdentity() },
          { headers: this.authHeaders() },
        ),
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
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
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

  private ingest = inject(BroadcastIngestService);
  /** Owns the provider popup/authorize call so GO LIVE and Tha Spot share it. */
  private platforms = inject(StreamingPlatformsService);

  /**
   * The broadcast token this tab is responsible for. Stored per tab so a
   * reload keeps ownership but a second tab does not silently start a
   * competing camera and host registration.
   */
  private readonly hostingToken = signal<string | null>(
    this.readHostingToken(),
  );
  readonly ownsBroadcast = computed(() => {
    const stream = this.currentStream();
    return (
      !!stream?.active &&
      !!stream.shareToken &&
      this.hostingToken() === stream.shareToken
    );
  });

  /** In-memory fallback when storage is unavailable (private mode, SSR). */
  private fallbackViewerId: string | null = null;

  private readHostingToken(): string | null {
    try {
      return typeof sessionStorage === 'undefined'
        ? null
        : sessionStorage.getItem(HOST_TOKEN_STORAGE_KEY);
    } catch {
      return null;
    }
  }

  private markHostingToken(token: string): void {
    this.hostingToken.set(token);
    saveString(HOST_TOKEN_STORAGE_KEY, token, 'sessionStorage');
  }

  private clearHostingToken(): void {
    this.hostingToken.set(null);
    deleteSaved(HOST_TOKEN_STORAGE_KEY, 'sessionStorage');
  }

  private isGoLivePlatform(
    platform: LiveStreamPlatform,
  ): platform is GoLivePlatform {
    return (GO_LIVE_PLATFORMS as readonly string[]).includes(platform);
  }

  /**
   * GO LIVE and Tha Spot's account rows must run the same provider flow: one
   * authorize request, one popup implementation, one shared connection store.
   */
  private authorizeProvider(provider: 'twitch'): Promise<boolean> {
    return this.platforms.connectAndWait(provider);
  }

  /**
   * Hand the broadcast to this tab. Used by the RESUME HERE control on a tab
   * that restored a live row without owning the capture, and after the server
   * elected another socket and told this one it was replaced.
   */
  async resumeBroadcastHere(): Promise<boolean> {
    const stream = this.currentStream();
    if (!stream?.active || !stream.shareToken) return false;
    // This click can restart the WHIP push; prime before capture/start awaits.
    const providers = this.providerDestinations(stream);
    if (providers.length) this.ingest.primeAudioContext();
    try {
      this.markHostingToken(stream.shareToken);
      const started = await this.social.startStream(stream.platform);
      if (started === false) {
        this.abandonHostingTakeover();
        return false;
      }
      this.social.updateStatus(this.livePresenceMetadata());
      this.startStreamPoll();
      if (providers.length) {
        await this.ingest.load();
        if (providers.includes('twitch') && !this.ingest.ready('twitch')) {
          if (!(await this.authorizeProvider('twitch'))) {
            this.ingest.closePrimedAudioContext();
            this.abandonHostingTakeover();
            return false;
          }
          await this.ingest.load();
        }
        if (!(await this.ingest.start(providers))) {
          this.abandonHostingTakeover();
          return false;
        }
      }
      this.haptic.medium();
      this.notify.show('BROADCAST RESUMED IN THIS TAB', 'success');
      return true;
    } catch (error) {
      const pushState = this.ingest.state();
      if (pushState === 'live' || pushState === 'connecting') {
        try {
          await this.ingest.stop();
        } catch {
          /* best-effort cleanup */
        }
      } else {
        this.ingest.closePrimedAudioContext();
      }
      this.abandonHostingTakeover();
      throw error;
    }
  }

  /** A failed takeover must not leave the host token, camera, or LIVE state. */
  private abandonHostingTakeover(): void {
    this.clearHostingToken();
    this.social.stopStream();
    this.social.updateStatus({ live: false });
  }

  // ── Helpers ─────────────────────────────────────────────────────────

  /**
   * The one viewer identity used by REST and socket redeems: the account id
   * for a signed-in viewer, otherwise a stable browser id. The server strips
   * and re-adds the `guest:` prefix, so both paths produce the same key.
   */
  viewerIdentity(): string {
    const account = this.profileService.profile().id;
    if (account) return `user:${account}`;
    return `guest:${this.guestViewerId()}`;
  }

  private guestViewerId(): string {
    try {
      const existing = localStorage.getItem(LIVE_VIEWER_ID_STORAGE_KEY);
      if (existing) return existing;
      const created =
        typeof globalThis.crypto?.randomUUID === 'function'
          ? globalThis.crypto.randomUUID()
          : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
      saveString(LIVE_VIEWER_ID_STORAGE_KEY, created, 'localStorage');
      return created;
    } catch {
      this.fallbackViewerId ??= `anon-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
      return this.fallbackViewerId;
    }
  }
}
