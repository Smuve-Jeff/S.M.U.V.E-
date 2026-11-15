import { Injectable, computed, inject, signal } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { firstValueFrom } from "rxjs";
import { io, type Socket } from "socket.io-client";
import { APP_SECURITY_CONFIG } from "../app.security";
import {
  SocialNetworkingService,
  type HostStreamUpdate,
} from "./social-networking.service";
import type { LiveStreamRecord } from "./live-stream.service";
import type { ViewerHealthThresholds } from "./viewer-health";
import { DEFAULT_VIEWER_HEALTH, isValidViewerHealth } from "./viewer-health";

/**
 * One-way live video for S.M.U.V.E Live.
 *
 * The host already captures camera + mic through `SocialNetworkingService`.
 * This service forwards those tracks to every viewer over a dedicated
 * `RTCPeerConnection`; Socket.IO is used only to exchange SDP and ICE. Media
 * never passes through the API server.
 *
 * Viewers join with the share-link token. The server proves the token is an
 * active stream, tells the host's socket about the viewer, and relays the
 * resulting offer/answer/ICE between just those two sockets.
 */
export type LiveFeedStatus =
  | "idle"
  | "connecting"
  | "waiting"
  | "live"
  | "ended"
  | "unavailable"
  | "error";

export interface LiveTurnHealth {
  configured: boolean;
  managed: boolean;
  available: boolean;
  source: "cloudflare" | "static" | "public" | "none";
}

/** Host-side view of one viewer's media path. */
export interface LiveViewerConnection {
  socketId: string;
  name: string | null;
  state: "connecting" | "direct" | "relay" | "failed";
  /** Round-trip time of the selected pair, in milliseconds. */
  rttMs?: number | null;
  /** Outbound media bitrate averaged over the last stats sample, in kbps. */
  kbps?: number | null;
}

interface IceConfigResponse {
  iceServers?: RTCIceServer[];
  turn?: LiveTurnHealth;
}

interface HostPeer {
  pc: RTCPeerConnection;
  pendingIce: RTCIceCandidateInit[];
  /** Baseline for the per-viewer bitrate delta. */
  lastBytesSent: number | null;
  lastSampleAt: number | null;
  /**
   * One sender per media role. The game + system slots exist from the
   * first peer (silent placeholders) so a later source switch is pure
   * replaceTrack — no re-negotiation, no viewer rejoin.
   */
  senders: Array<{
    sender: RTCRtpSender;
    role: "camera" | "game" | "mic" | "system";
  }>;
}

type SocketPayload = Record<string, any>;

const FALLBACK_ICE_SERVERS: RTCIceServer[] = [
  { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
];
const SOCKET_WAIT_MS = 8_000;
const HOST_MEDIA_WAIT_MS = 8_000;
const VIEWER_OFFER_TIMEOUT_MS = 15_000;
const VIEWER_POLL_MS = 12_000;
// A peer that reports failed/disconnected is replaced rather than kept: the
// host may simply have rebuilt its socket, and the only cure is a new offer.
const VIEWER_ICE_RECOVERY_MS = 6_000;
const VIEWER_REJOIN_MS = 3_000;
// Managed TURN credentials are short-lived; refresh with plenty of headroom.
const ICE_CACHE_MS = 10 * 60_000;
// Stats are sampled rather than streamed: a few seconds is plenty for a
// dashboard and keeps getStats() off the media path.
const STATS_POLL_MS = 4_000;

@Injectable({ providedIn: "root" })
export class LiveVideoService {
  private social = inject(SocialNetworkingService);
  private http = inject(HttpClient);

  /** Remote camera/mic feed while watching. Null when not connected. */
  readonly remoteStream = signal<MediaStream | null>(null);
  readonly status = signal<LiveFeedStatus>("idle");
  readonly feedError = signal<string | null>(null);
  readonly watchingToken = signal<string | null>(null);
  /** Autoplay starts muted; unmuting is an explicit user gesture. */
  readonly isMuted = signal(true);
  /** Which picture the host is showing — the viewer display follows it. */
  readonly hostSharingScreen = signal(false);
  /** True while a dropped inbound feed is being rebuilt (drives the banner). */
  readonly recovering = signal(false);
  /**
   * The host has no live video to send: capture never started, was refused,
   * or its track ended. Every hosting surface warns the host from this, so a
   * broadcast with an empty room is never mistaken for a working one.
   */
  readonly hostFeedMissing = computed(() => {
    const media = this.social.localStream();
    if (!media) return true;
    return !media.getVideoTracks().some((track) => track.readyState === "live");
  });

  /** Why capture failed, when the platform reported a reason. */
  readonly hostFeedError = computed(() => this.social.streamError());

  /**
   * The browser has the camera hard-blocked, so a retry cannot re-prompt.
   * The host has to allow the site in browser settings first.
   */
  readonly hostFeedBlocked = computed(() => this.social.captureBlocked());

  /**
   * One-tap retry behind the host warning: re-ask for camera/mic and offer to
   * any viewer that joined while there was nothing to send. Returns whether
   * capture is producing video now.
   */
  async retryHostFeed(): Promise<boolean> {
    const ok = await this.social.retryHostMedia();
    if (ok) this.flushPendingViewers();
    return ok;
  }

  /**
   * Whether the viewer's own signaling transport is up — the social socket
   * for a signed-in viewer, the token-scoped guest socket for a share-link
   * visitor. A guest has no social socket at all, so presence state is the
   * wrong thing to hang a "connection lost" banner on.
   */
  readonly viewerTransportUp = signal(false);
  /** Whether the host cut their mic from the viewers' mix. */
  readonly hostScreenAudioOnly = signal(false);
  /** TURN relay state reported alongside the ICE configuration. */
  readonly turnHealth = signal<LiveTurnHealth | null>(null);
  /** One entry per connected viewer, with its actual media path. */
  readonly viewerConnections = signal<LiveViewerConnection[]>([]);
  /** Link thresholds from the active delivery preset, or safe defaults. */
  readonly viewerHealthThresholds = signal<ViewerHealthThresholds>({
    ...DEFAULT_VIEWER_HEALTH,
  });
  /** Preset name owning those limits, or "DEFAULT" on unpreset surfaces. */
  readonly viewerHealthLabel = signal("DEFAULT");

  private boundSocket?: Socket;
  private hostSocket?: Socket;
  private guestSocket?: Socket;
  private videoTrackUnsub: (() => void) | null = null;
  private hostToken: string | null = null;
  private hostStreamId: number | null = null;
  private hostPeers = new Map<string, HostPeer>();
  private viewerNames = new Map<string, string | null>();
  private pendingViewers = new Map<string, ReturnType<typeof setTimeout>>();
  private hostMediaTimer: ReturnType<typeof setTimeout> | null = null;
  private statsTimer: ReturnType<typeof setInterval> | null = null;
  private statsInFlight = false;

  private viewerPc?: RTCPeerConnection;
  private viewerToken: string | null = null;
  private viewerPendingIce: RTCIceCandidateInit[] = [];
  private viewerTimeout: ReturnType<typeof setTimeout> | null = null;
  private viewerPoll: ReturnType<typeof setInterval> | null = null;
  private viewerRejoinTimer: ReturnType<typeof setTimeout> | null = null;

  private iceServers: RTCIceServer[] = FALLBACK_ICE_SERVERS;
  private iceConfig?: Promise<void>;
  private iceLoadedAt = 0;

  // ── Host side ───────────────────────────────────────────────────────

  /**
   * Register this browser as the broadcaster for `stream`. Safe to call
   * repeatedly (the Tha Spot / lab effects do): the work is keyed by token.
   */
  startHosting(stream: LiveStreamRecord): void {
    if (!stream?.shareToken) return;
    const socket = this.social.getSocket();
    if (this.hostToken === stream.shareToken) {
      // The socket can be rebuilt after a login/reconnect; re-register it.
      if (socket?.connected && this.hostSocket !== socket) {
        void this.registerHost();
      }
      return;
    }
    this.stopHosting();
    this.hostToken = stream.shareToken;
    this.hostStreamId = stream.id;
    // Camera ↔ screen switches arrive here: every viewer peer's sender
    // tracks swap by role (replaceTrack — no re-negotiation, no rejoin)
    // and every watcher learns which source is live.
    this.videoTrackUnsub?.();
    this.videoTrackUnsub = this.social.onHostStreamReplaced((update) =>
      this.onHostStreamUpdate(update),
    );
    void this.registerHost();
  }

  /** Apply the thresholds that belong to the broadcaster's delivery preset. */
  setViewerHealthThresholds(
    thresholds: ViewerHealthThresholds | null | undefined,
    label = "DEFAULT",
  ): void {
    if (!isValidViewerHealth(thresholds)) {
      this.resetViewerHealthThresholds();
      return;
    }
    this.viewerHealthThresholds.set({ ...thresholds });
    this.viewerHealthLabel.set(label.trim() || "DEFAULT");
  }

  resetViewerHealthThresholds(): void {
    this.viewerHealthThresholds.set({ ...DEFAULT_VIEWER_HEALTH });
    this.viewerHealthLabel.set("DEFAULT");
  }

  /**
   * Camera ↔ screen switch: swap every viewer peer's sender tracks by
   * role in place, then announce the live source to the room. The
   * audience's display follows the cut — camera back to face, screen to
   * the game — while chat and presence stay exactly where they were.
   */
  private onHostStreamUpdate(update: HostStreamUpdate): void {
    this.replaceHostTracks(update.stream);
    this.announceHostSource(update);
  }

  /**
   * Tell the room (and the server's replay cache) which picture is live.
   * Sent on every switch, and again whenever the host socket registers —
   * a broadcast that went live already sharing the game screen never
   * otherwise produces an announcement, so late viewers saw black.
   */
  private announceHostSource(
    update?: Pick<HostStreamUpdate, "videoSource" | "screenAudioOnly">,
  ): void {
    const socket = this.hostSocket;
    const token = this.hostToken;
    if (!socket?.connected || !token) return;
    socket.emit("live_stream_source", {
      token,
      videoSource: update?.videoSource ?? this.social.videoSource(),
      screenAudioOnly: update?.screenAudioOnly ?? this.social.screenAudioOnly(),
    });
  }

  private replaceHostTracks(stream: MediaStream): void {
    const video = stream.getVideoTracks()[0];
    const videoRole =
      this.social.videoSource() === "screen" ? "game" : "camera";
    const audios = stream.getAudioTracks();
    for (const entry of this.hostPeers.values()) {
      if (video) {
        const slot = entry.senders.find((s) => s.role === videoRole);
        if (slot) {
          void slot.sender.replaceTrack(video).catch(() => {
            /* a stale sender keeps the old frame; stats flag the peer */
          });
        }
      }
      for (const track of audios) {
        const role =
          this.social.audioRoleOf(track) === "system" ? "system" : "mic";
        const slot = entry.senders.find((s) => s.role === role);
        if (slot) {
          void slot.sender.replaceTrack(track).catch(() => {
            /* a stale sender keeps the old frame */
          });
        }
      }
    }
  }

  /** Stop accepting viewers and close every peer (camera is owned elsewhere). */
  stopHosting(): void {
    const socket = this.hostSocket;
    const token = this.hostToken;
    if (socket?.connected && token) {
      socket.emit("live_stream_host_leave", { token });
    }
    this.clearHostMediaTimer();
    this.clearStatsPolling();
    this.hostPeers.forEach((peer) => peer.pc.close());
    this.hostPeers.clear();
    this.viewerNames.clear();
    this.viewerConnections.set([]);
    this.pendingViewers.forEach((timer) => clearTimeout(timer));
    this.pendingViewers.clear();
    this.videoTrackUnsub?.();
    this.videoTrackUnsub = null;
    this.hostSocket = undefined;
    this.hostToken = null;
    this.hostStreamId = null;
  }

  private async registerHost(): Promise<void> {
    const token = this.hostToken;
    if (!token) return;
    const socket = await this.waitForSocket();
    if (!socket || this.hostToken !== token) return;
    this.bindSocket(socket);
    this.hostSocket = socket;
    socket.emit("live_stream_host_join", { token });
    this.announceHostSource();
    this.scheduleHostMediaFlush(token);
    this.startStatsPolling();
    // Fetch early so the dashboard can report relay health before the first
    // viewer arrives, and so peer creation reuses the cached credentials.
    void this.ensureIce();
  }

  /**
   * Camera acquisition can finish after the stream row is issued. Poll briefly
   * so viewers who joined during that window get their offer, and tell them
   * when capture failed instead of leaving the player spinning.
   */
  private scheduleHostMediaFlush(token: string): void {
    this.clearHostMediaTimer();
    const startedAt = Date.now();
    const tick = () => {
      if (this.hostToken !== token) return;
      if (this.social.localStream()) {
        this.flushPendingViewers();
        return;
      }
      if (
        this.social.streamError() ||
        Date.now() - startedAt >= HOST_MEDIA_WAIT_MS
      ) {
        this.rejectPendingViewers(
          this.social.streamError() || "HOST_MEDIA_UNAVAILABLE",
        );
        return;
      }
      this.hostMediaTimer = setTimeout(tick, 250);
    };
    tick();
  }

  private clearHostMediaTimer(): void {
    if (this.hostMediaTimer !== null) {
      clearTimeout(this.hostMediaTimer);
      this.hostMediaTimer = null;
    }
  }

  private onSourceChanged = (data: SocketPayload) => {
    if (typeof data?.streamToken !== "string") return;
    if (data.streamToken !== this.viewerToken) return;
    this.hostSharingScreen.set(data?.videoSource === "screen");
    this.hostScreenAudioOnly.set(data?.screenAudioOnly === true);
  };

  private onViewerJoined = (data: SocketPayload) => {
    if (!this.hostToken || data?.streamToken !== this.hostToken) return;
    const socketId = typeof data?.socketId === "string" ? data.socketId : "";
    if (!socketId) return;
    // A viewer that re-joins (recovered peer, rebuilt socket) needs a fresh
    // offer. Skipping it because a stale peer existed is why a recovered
    // viewer never got video back without reloading.
    if (this.hostPeers.has(socketId)) this.closeHostPeer(socketId);
    this.viewerNames.set(
      socketId,
      typeof data?.viewerName === "string" ? data.viewerName : null,
    );
    const media = this.social.localStream();
    if (!media) {
      if (this.pendingViewers.has(socketId)) return;
      const timer = setTimeout(() => {
        this.pendingViewers.delete(socketId);
        this.emitFeedUnavailable(
          socketId,
          this.social.streamError() || "HOST_MEDIA_UNAVAILABLE",
        );
      }, HOST_MEDIA_WAIT_MS);
      this.pendingViewers.set(socketId, timer);
      return;
    }
    void this.createHostPeer(socketId, media);
  };

  private flushPendingViewers(): void {
    const media = this.social.localStream();
    if (!media) return;
    for (const [socketId, timer] of this.pendingViewers) {
      clearTimeout(timer);
      this.pendingViewers.delete(socketId);
      void this.createHostPeer(socketId, media);
    }
  }

  private rejectPendingViewers(reason: string): void {
    for (const [socketId, timer] of this.pendingViewers) {
      clearTimeout(timer);
      this.emitFeedUnavailable(socketId, reason);
    }
    this.pendingViewers.clear();
  }

  private async createHostPeer(
    socketId: string,
    media: MediaStream,
  ): Promise<void> {
    const socket = this.hostSocket;
    const token = this.hostToken;
    if (!socket?.connected || !token) return;
    await this.ensureIce();
    if (this.hostToken !== token || this.hostPeers.has(socketId)) return;

    const pc = new RTCPeerConnection({ iceServers: this.iceServers });
    const entry: HostPeer = {
      pc,
      pendingIce: [],
      lastBytesSent: null,
      lastSampleAt: null,
      senders: [],
    };
    this.hostPeers.set(socketId, entry);
    this.upsertViewerConnection({
      socketId,
      name: this.viewerNames.get(socketId) ?? null,
      state: "connecting",
      rttMs: null,
      kbps: null,
    });
    // Canonical slot order — camera, game, mic, system — no matter which
    // source is live. The audience splits the feed by position, so a
    // broadcast that goes live already sharing the screen must still
    // negotiate the camera m-line first or the two pictures swap places.
    // Roles the host is not publishing ride silent clones, so every later
    // switch is a replaceTrack instead of a re-negotiation.
    const videoTrack = media.getVideoTracks()[0];
    const liveVideoRole: "camera" | "game" =
      this.social.videoSource() === "screen" ? "game" : "camera";
    const audioTracks = media.getAudioTracks();
    const micTrack = audioTracks.find(
      (track) => this.social.audioRoleOf(track) === "mic",
    );
    const systemTrack = audioTracks.find(
      (track) => this.social.audioRoleOf(track) === "system",
    );
    const addSlot = (
      track: MediaStreamTrack,
      role: HostPeer["senders"][number]["role"],
    ): void => {
      entry.senders.push({ sender: pc.addTrack(track, media), role });
    };
    const addSilentSlot = (
      source: MediaStreamTrack | undefined,
      role: HostPeer["senders"][number]["role"],
    ): void => {
      if (!source) return;
      const ghost = source.clone();
      ghost.enabled = false;
      addSlot(ghost, role);
    };

    if (videoTrack) {
      if (liveVideoRole === "camera") {
        addSlot(videoTrack, "camera");
        addSilentSlot(videoTrack, "game");
      } else {
        addSilentSlot(videoTrack, "camera");
        addSlot(videoTrack, "game");
      }
    }
    const audioSource = micTrack ?? audioTracks[0];
    if (micTrack) addSlot(micTrack, "mic");
    else addSilentSlot(audioSource, "mic");
    if (systemTrack) addSlot(systemTrack, "system");
    else addSilentSlot(audioSource, "system");

    pc.onicecandidate = (event) => {
      if (!event.candidate || !this.hostSocket) return;
      this.hostSocket.emit("live_webrtc_ice", {
        token: this.hostToken,
        toSocketId: socketId,
        candidate: event.candidate.toJSON(),
      });
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "failed" || pc.connectionState === "closed") {
        this.closeHostPeer(socketId);
        return;
      }
      void this.samplePeer(socketId, pc);
    };

    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      if (this.hostPeers.get(socketId) !== entry) return;
      const sdp = pc.localDescription?.sdp ?? offer.sdp ?? "";
      if (!sdp) return;
      socket.emit("live_webrtc_offer", {
        token,
        toSocketId: socketId,
        sdp: { type: "offer", sdp },
      });
    } catch (err) {
      console.error("[LiveVideo] Could not create a viewer offer", err);
      this.closeHostPeer(socketId);
    }
  }

  private onAnswer = (data: SocketPayload) => {
    if (!this.hostToken || data?.streamToken !== this.hostToken) return;
    const peer = this.hostPeers.get(data?.fromSocketId);
    if (!peer || !data?.sdp) return;
    void (async () => {
      try {
        await peer.pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
        await this.flushPeerCandidates(peer);
      } catch (err) {
        console.warn("[LiveVideo] Bad answer from a viewer", err);
      }
    })();
  };

  private onViewerLeft = (data: SocketPayload) => {
    if (!this.hostToken) return;
    const socketId = typeof data?.socketId === "string" ? data.socketId : "";
    if (!socketId) return;
    const timer = this.pendingViewers.get(socketId);
    if (timer) {
      clearTimeout(timer);
      this.pendingViewers.delete(socketId);
    }
    this.viewerNames.delete(socketId);
    this.closeHostPeer(socketId);
  };

  private closeHostPeer(socketId: string): void {
    const peer = this.hostPeers.get(socketId);
    if (!peer) return;
    this.hostPeers.delete(socketId);
    this.viewerNames.delete(socketId);
    this.removeViewerConnection(socketId);
    try {
      peer.pc.close();
    } catch {
      /* already closed */
    }
  }

  private upsertViewerConnection(entry: LiveViewerConnection): void {
    this.viewerConnections.update((list) => {
      const index = list.findIndex(
        (viewer) => viewer.socketId === entry.socketId,
      );
      if (index === -1) return [...list, entry];
      const next = list.slice();
      next[index] = { ...next[index], ...entry };
      return next;
    });
  }

  private removeViewerConnection(socketId: string): void {
    this.viewerConnections.update((list) =>
      list.filter((viewer) => viewer.socketId !== socketId),
    );
  }

  private startStatsPolling(): void {
    if (this.statsTimer !== null) return;
    this.statsTimer = setInterval(() => {
      void this.pollHostPeerStats();
    }, STATS_POLL_MS);
  }

  private clearStatsPolling(): void {
    if (this.statsTimer !== null) {
      clearInterval(this.statsTimer);
      this.statsTimer = null;
    }
  }

  private async pollHostPeerStats(): Promise<void> {
    if (this.statsInFlight) return;
    this.statsInFlight = true;
    try {
      await Promise.all(
        Array.from(this.hostPeers.entries()).map(([socketId, peer]) =>
          this.samplePeer(socketId, peer.pc),
        ),
      );
    } finally {
      this.statsInFlight = false;
    }
  }

  /**
   * Read the winning candidate pair, its round-trip time, and the outbound
   * media rate for one viewer, then publish it to the shared relay strip.
   */
  private async samplePeer(
    socketId: string,
    pc: RTCPeerConnection,
  ): Promise<void> {
    const entry = this.hostPeers.get(socketId);
    if (!entry || entry.pc !== pc) return;
    const name = this.viewerNames.get(socketId) ?? null;
    if (pc.connectionState === "failed") {
      this.upsertViewerConnection({
        socketId,
        name,
        state: "failed",
        rttMs: null,
        kbps: null,
      });
      return;
    }
    if (pc.connectionState !== "connected") {
      this.upsertViewerConnection({
        socketId,
        name,
        state: "connecting",
        rttMs: null,
        kbps: null,
      });
      return;
    }

    const sample = await this.readPeerStats(entry);
    if (this.hostPeers.get(socketId)?.pc !== pc) return;
    this.upsertViewerConnection({
      socketId,
      name,
      state: sample.route,
      rttMs: sample.rttMs,
      kbps: sample.kbps,
    });
  }

  private async readPeerStats(entry: HostPeer): Promise<{
    route: "direct" | "relay" | "connecting";
    rttMs: number | null;
    kbps: number | null;
  }> {
    try {
      const stats = await entry.pc.getStats();
      let pair: any = null;
      let busiest: any = null;
      let bytesFromRtp = 0;
      let sawRtp = false;
      stats.forEach((report: any) => {
        if (report.type === "candidate-pair") {
          if (report.state !== "succeeded") return;
          if (report.selected || report.nominated) {
            pair = report;
            return;
          }
          if (!busiest || (report.bytesSent ?? 0) > (busiest.bytesSent ?? 0)) {
            busiest = report;
          }
          return;
        }
        if (
          report.type === "outbound-rtp" &&
          typeof report.bytesSent === "number" &&
          (report.kind === "audio" || report.kind === "video")
        ) {
          bytesFromRtp += report.bytesSent;
          sawRtp = true;
        }
      });
      if (!pair) pair = busiest;
      if (!pair) {
        return { route: "connecting", rttMs: null, kbps: null };
      }

      // Media is relayed when either side of the winning pair is a relay
      // candidate, not only when this host is the one behind TURN.
      const local = pair.localCandidateId
        ? stats.get(pair.localCandidateId)
        : undefined;
      const remote = pair.remoteCandidateId
        ? stats.get(pair.remoteCandidateId)
        : undefined;
      const route =
        local?.candidateType === "relay" || remote?.candidateType === "relay"
          ? "relay"
          : "direct";

      const rttMs =
        typeof pair.currentRoundTripTime === "number"
          ? Math.max(0, pair.currentRoundTripTime * 1000)
          : null;

      // Sum the host's outbound RTP reports for a media bitrate; fall back to
      // the winning pair's byte counter on browsers that omit them.
      const bytesSent = sawRtp
        ? bytesFromRtp
        : typeof pair.bytesSent === "number"
          ? pair.bytesSent
          : null;
      let kbps: number | null = null;
      if (bytesSent !== null) {
        const now = Date.now();
        if (entry.lastBytesSent !== null && entry.lastSampleAt !== null) {
          const seconds = (now - entry.lastSampleAt) / 1000;
          const delta = bytesSent - entry.lastBytesSent;
          if (seconds > 0 && delta >= 0) kbps = (delta * 8) / seconds / 1000;
        }
        entry.lastBytesSent = bytesSent;
        entry.lastSampleAt = now;
      }

      return { route, rttMs, kbps };
    } catch {
      return { route: "connecting", rttMs: null, kbps: null };
    }
  }

  private emitFeedUnavailable(socketId: string, reason: string): void {
    const socket = this.hostSocket;
    if (!socket?.connected || !this.hostToken) return;
    socket.emit("live_stream_feed_unavailable", {
      token: this.hostToken,
      toSocketId: socketId,
      reason,
    });
  }

  private async flushPeerCandidates(peer: HostPeer): Promise<void> {
    const queued = peer.pendingIce;
    peer.pendingIce = [];
    for (const candidate of queued) {
      try {
        await peer.pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch {
        /* stale candidate */
      }
    }
  }

  // ── Viewer side ─────────────────────────────────────────────────────

  /** Join a stream's video room and negotiate a receive-only peer. */
  async watch(token: string): Promise<void> {
    if (!token) return;
    if (
      this.viewerToken === token &&
      ["connecting", "waiting", "live"].includes(this.status())
    ) {
      return;
    }
    this.stopWatching();
    this.viewerToken = token;
    this.watchingToken.set(token);
    this.status.set("connecting");
    this.feedError.set(null);
    this.recovering.set(false);
    this.isMuted.set(true);

    const socket = await this.waitForViewerSocket(token);
    if (!socket) {
      this.failViewer("LIVE CONNECTION UNAVAILABLE");
      return;
    }
    this.bindSocket(socket);
    await this.ensureIce();
    if (this.viewerToken !== token) return;
    socket.emit("live_stream_watch", { token });
    this.startViewerPoll(token);
    this.clearViewerTimeout();
    this.viewerTimeout = setTimeout(() => {
      if (this.status() === "connecting" || this.status() === "waiting") {
        this.failViewer(
          "HOST FEED DID NOT ANSWER — THE BROADCAST MAY HAVE NO MEDIA",
        );
      }
    }, VIEWER_OFFER_TIMEOUT_MS);
  }

  /** Leave the stream room and release the player. */
  stopWatching(): void {
    this.hostSharingScreen.set(false);
    this.hostScreenAudioOnly.set(false);
    const token = this.viewerToken;
    const socket = this.boundSocket;
    if (token && socket?.connected) {
      socket.emit("live_stream_unwatch", { token });
    }
    this.finishViewing("idle", null);
  }

  toggleMute(): void {
    const next = !this.isMuted();
    this.isMuted.set(next);
    this.remoteStream()
      ?.getAudioTracks()
      .forEach((track) => (track.enabled = !next));
  }

  private onWatchOk = (data: SocketPayload) => {
    if (!this.viewerToken || data?.streamToken !== this.viewerToken) return;
    if (this.status() === "connecting") this.status.set("waiting");
    // The switch event is transient; the join reply replays the picture that
    // is live right now so a late viewer never starts on a stale slot.
    if (data?.videoSource === "screen" || data?.videoSource === "camera") {
      this.hostSharingScreen.set(data.videoSource === "screen");
      this.hostScreenAudioOnly.set(data?.screenAudioOnly === true);
    }
  };

  private onWatchFailed = (data: SocketPayload) => {
    if (!this.viewerToken || data?.token !== this.viewerToken) return;
    if (data?.error === "ended") {
      this.finishViewing("ended", "BROADCAST ENDED");
      return;
    }
    this.failViewer(
      data?.error === "stream_full"
        ? "STREAM IS FULL — TRY AGAIN LATER"
        : "BROADCAST UNAVAILABLE",
    );
  };

  private onOffer = (data: SocketPayload) => {
    if (!this.viewerToken || data?.streamToken !== this.viewerToken) return;
    const sdp = data?.sdp;
    if (!sdp || sdp.type !== "offer" || typeof sdp.sdp !== "string") return;
    // A host that reconnected (new socket, new peer) re-offers. Ignoring it
    // because "we already have a peer" is what left viewers frozen on a dead
    // connection for the rest of the broadcast.
    if (this.viewerPc && !this.isViewerPeerDead(this.viewerPc)) return;
    if (this.viewerPc) this.dropViewerPeer("waiting");
    void this.acceptOffer(sdp);
  };

  private isViewerPeerDead(pc: RTCPeerConnection): boolean {
    return (
      pc.connectionState === "failed" ||
      pc.connectionState === "closed" ||
      pc.connectionState === "disconnected"
    );
  }

  /**
   * Release a dead inbound peer but keep the watch session: the room, the
   * token and the source state survive, so the next offer resumes the feed.
   */
  private dropViewerPeer(status: LiveFeedStatus = "connecting"): void {
    this.viewerPc?.close();
    this.viewerPc = undefined;
    this.viewerPendingIce = [];
    this.remoteStream.set(null);
    this.status.set(status);
  }

  /**
   * Ask the host for one fresh offer. `live_stream_watch` is idempotent on the
   * server, and the host replaces the stale peer for this socket.
   */
  private requestFreshOffer(): void {
    const token = this.viewerToken;
    const socket = this.boundSocket;
    if (!token || !socket?.connected) return;
    // The banner should appear the moment the feed dies, not 3s later.
    this.recovering.set(true);
    if (this.viewerRejoinTimer !== null) clearTimeout(this.viewerRejoinTimer);
    this.viewerRejoinTimer = setTimeout(() => {
      this.viewerRejoinTimer = null;
      if (this.viewerToken !== token || !socket.connected) return;
      if (this.viewerPc && !this.isViewerPeerDead(this.viewerPc)) return;
      this.dropViewerPeer("waiting");
      socket.emit("live_stream_watch", { token });
    }, VIEWER_REJOIN_MS);
  }

  /**
   * Manual retry from the reconnect banner: rebuild the inbound peer now
   * instead of waiting for the automatic rejoin, and re-arm the watch if the
   * transport is what dropped.
   */
  retryViewerFeed(): void {
    const token = this.viewerToken;
    const socket = this.boundSocket;
    if (!token) return;
    if (this.viewerRejoinTimer !== null) {
      clearTimeout(this.viewerRejoinTimer);
      this.viewerRejoinTimer = null;
    }
    this.dropViewerPeer("connecting");
    this.recovering.set(true);
    this.feedError.set(null);
    if (!socket?.connected) return;
    socket.emit("live_stream_watch", { token });
  }

  private async acceptOffer(sdp: {
    type: "offer";
    sdp: string;
  }): Promise<void> {
    const token = this.viewerToken;
    if (!token) return;
    await this.ensureIce();
    if (this.viewerToken !== token || this.viewerPc) return;

    const pc = new RTCPeerConnection({ iceServers: this.iceServers });
    this.viewerPc = pc;
    pc.ontrack = (event) => {
      const track = event.track;
      // A camera ↔ screen switch replaces the host's sender track: the
      // receiver unmutes with no new ontrack, so republish on the event.
      const republish = () => this.publishViewerFeed(pc);
      track.addEventListener?.("unmute", republish);
      track.addEventListener?.("mute", republish);
      this.publishViewerFeed(pc);
    };
    pc.onicecandidate = (event) => {
      if (!event.candidate || !this.boundSocket) return;
      this.boundSocket.emit("live_webrtc_ice", {
        token: this.viewerToken,
        candidate: event.candidate.toJSON(),
      });
    };
    pc.onconnectionstatechange = () => {
      if (this.viewerPc !== pc) return;
      if (pc.connectionState === "failed") {
        // Do not strand the viewer on a dead peer: rebuild on a fresh offer.
        this.dropViewerPeer("waiting");
        this.feedError.set("RECONNECTING TO THE HOST FEED…");
        this.requestFreshOffer();
        return;
      }
      if (pc.connectionState === "disconnected") {
        // ICE may recover on its own; only renegotiate if it does not.
        setTimeout(() => {
          if (this.viewerPc === pc && pc.connectionState === "disconnected") {
            this.dropViewerPeer("waiting");
            this.requestFreshOffer();
          }
        }, VIEWER_ICE_RECOVERY_MS);
      }
    };

    try {
      await pc.setRemoteDescription(new RTCSessionDescription(sdp));
      await this.flushViewerCandidates();
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      if (this.viewerPc !== pc) return;
      const answerSdp = pc.localDescription?.sdp ?? answer.sdp ?? "";
      if (!answerSdp) return;
      this.boundSocket?.emit("live_webrtc_answer", {
        token,
        sdp: { type: "answer", sdp: answerSdp },
      });
      // Every m-line exists by now, so the split can be built deterministically
      // even on browsers that fire few (or late) ontrack events.
      this.publishViewerFeed(pc);
    } catch (err) {
      console.error("[LiveVideo] Could not answer the host feed", err);
      this.failViewer("COULD NOT NEGOTIATE THE HOST FEED");
    }
  }

  /**
   * Rebuild the inbound feed from the peer's receivers.
   *
   * `ontrack` fires once per m-line and every host track travels in one
   * remote MediaStream, so setting that stream directly leaves the viewer
   * split stuck on whatever arrived first — a later camera → game switch has
   * nowhere to land. Receivers keep m-line order (camera, game, mic, system),
   * which is exactly the slot contract the player splits on.
   */
  private publishViewerFeed(pc: RTCPeerConnection): void {
    if (this.viewerPc !== pc) return;
    const tracks = pc
      .getReceivers()
      .map((receiver) => receiver.track)
      .filter((track): track is MediaStreamTrack => !!track);
    if (!tracks.length) return;
    this.remoteStream.set(new MediaStream(tracks));
    this.status.set("live");
    this.recovering.set(false);
    this.feedError.set(null);
    this.clearViewerTimeout();
    tracks
      .filter((track) => track.kind === "audio")
      .forEach((track) => (track.enabled = !this.isMuted()));
  }

  private onIce = (data: SocketPayload) => {
    if (!data?.candidate) return;

    if (this.hostToken && data?.streamToken === this.hostToken) {
      const peer = this.hostPeers.get(data?.fromSocketId);
      if (!peer) return;
      if (peer.pc.remoteDescription) {
        void peer.pc
          .addIceCandidate(new RTCIceCandidate(data.candidate))
          .catch(() => undefined);
      } else {
        peer.pendingIce.push(data.candidate);
      }
      return;
    }

    if (
      !this.viewerToken ||
      (data?.streamToken && data.streamToken !== this.viewerToken)
    ) {
      return;
    }
    if (this.viewerPc?.remoteDescription) {
      void this.viewerPc
        .addIceCandidate(new RTCIceCandidate(data.candidate))
        .catch(() => undefined);
    } else {
      this.viewerPendingIce.push(data.candidate);
    }
  };

  private onFeedUnavailable = (data: SocketPayload) => {
    if (
      !this.viewerToken ||
      (data?.streamToken && data.streamToken !== this.viewerToken)
    ) {
      return;
    }
    this.failViewer("HOST IS LIVE BUT THE VIDEO FEED IS UNAVAILABLE");
  };

  private onStreamEnded = (data: SocketPayload) => {
    if (
      !this.viewerToken ||
      (data?.streamToken && data.streamToken !== this.viewerToken)
    ) {
      return;
    }
    this.finishViewing("ended", "BROADCAST ENDED");
  };

  private onSocketConnect = () => {
    const socket = this.boundSocket;
    if (!socket?.connected) return;
    if (this.hostToken) {
      socket.emit("live_stream_host_join", { token: this.hostToken });
      this.announceHostSource();
    }
    const token = this.viewerToken;
    if (token) {
      this.viewerPc?.close();
      this.viewerPc = undefined;
      this.viewerPendingIce = [];
      this.remoteStream.set(null);
      this.status.set("connecting");
      socket.emit("live_stream_watch", { token });
    }
  };

  private async flushViewerCandidates(): Promise<void> {
    const queued = this.viewerPendingIce;
    this.viewerPendingIce = [];
    for (const candidate of queued) {
      try {
        await this.viewerPc?.addIceCandidate(new RTCIceCandidate(candidate));
      } catch {
        /* stale candidate */
      }
    }
  }

  private failViewer(message: string): void {
    this.clearViewerTimeout();
    this.viewerPc?.close();
    this.viewerPc = undefined;
    this.viewerPendingIce = [];
    this.remoteStream.set(null);
    this.status.set("error");
    this.feedError.set(message);
  }

  private finishViewing(status: LiveFeedStatus, message: string | null): void {
    this.clearViewerTimeout();
    if (this.viewerRejoinTimer !== null) {
      clearTimeout(this.viewerRejoinTimer);
      this.viewerRejoinTimer = null;
    }
    this.clearViewerPoll();
    this.viewerPc?.close();
    this.viewerPc = undefined;
    this.viewerPendingIce = [];
    this.remoteStream.set(null);
    this.viewerToken = null;
    this.watchingToken.set(null);
    this.status.set(status);
    this.feedError.set(message);
    this.recovering.set(false);
  }

  private startViewerPoll(token: string): void {
    this.clearViewerPoll();
    this.viewerPoll = setInterval(() => {
      if (this.viewerToken !== token) return;
      firstValueFrom(
        this.http.get(
          `${APP_SECURITY_CONFIG.api_url}/live-streams/join/${encodeURIComponent(
            token,
          )}`,
        ),
      ).catch((err: any) => {
        if (err?.status === 404 || err?.status === 410) {
          this.finishViewing("ended", "BROADCAST ENDED");
        }
      });
    }, VIEWER_POLL_MS);
  }

  private clearViewerPoll(): void {
    if (this.viewerPoll !== null) {
      clearInterval(this.viewerPoll);
      this.viewerPoll = null;
    }
  }

  private clearViewerTimeout(): void {
    if (this.viewerTimeout !== null) {
      clearTimeout(this.viewerTimeout);
      this.viewerTimeout = null;
    }
  }

  // ── Shared socket plumbing ──────────────────────────────────────────

  private bindSocket(socket: Socket): void {
    if (this.boundSocket === socket) return;
    // If the host socket was rebuilt while the old one is still open, leave
    // its live room so the server does not keep routing viewer answers to a
    // socket nobody listens on any more.
    if (
      this.hostToken &&
      this.hostSocket &&
      this.hostSocket !== socket &&
      this.hostSocket.connected
    ) {
      this.hostSocket.emit("live_stream_host_leave", {
        token: this.hostToken,
      });
    }
    this.unbindSocket();
    // Peers belong to the old transport; the caller re-announces this side.
    this.hostPeers.forEach((peer) => peer.pc.close());
    this.hostPeers.clear();
    this.viewerNames.clear();
    this.viewerConnections.set([]);
    this.boundSocket = socket;
    this.viewerTransportUp.set(socket.connected);
    socket.on("connect", this.onViewerTransportUp);
    socket.on("disconnect", this.onViewerTransportDown);
    socket.on("live_stream_viewer_joined", this.onViewerJoined);
    socket.on("live_stream_viewer_left", this.onViewerLeft);
    socket.on("live_webrtc_offer", this.onOffer);
    socket.on("live_webrtc_answer", this.onAnswer);
    socket.on("live_webrtc_ice", this.onIce);
    socket.on("live_stream_watch_ok", this.onWatchOk);
    socket.on("live_stream_watch_failed", this.onWatchFailed);
    socket.on("live_stream_feed_unavailable", this.onFeedUnavailable);
    socket.on("live_stream_source_changed", this.onSourceChanged);
    socket.on("live_stream_ended", this.onStreamEnded);
    socket.on("connect", this.onSocketConnect);
  }

  private unbindSocket(): void {
    const socket = this.boundSocket;
    if (!socket) return;
    socket.off("connect", this.onViewerTransportUp);
    socket.off("disconnect", this.onViewerTransportDown);
    socket.off("live_stream_viewer_joined", this.onViewerJoined);
    socket.off("live_stream_viewer_left", this.onViewerLeft);
    socket.off("live_webrtc_offer", this.onOffer);
    socket.off("live_webrtc_answer", this.onAnswer);
    socket.off("live_webrtc_ice", this.onIce);
    socket.off("live_stream_watch_ok", this.onWatchOk);
    socket.off("live_stream_watch_failed", this.onWatchFailed);
    socket.off("live_stream_feed_unavailable", this.onFeedUnavailable);
    socket.off("live_stream_source_changed", this.onSourceChanged);
    socket.off("live_stream_ended", this.onStreamEnded);
    socket.off("connect", this.onSocketConnect);
    this.boundSocket = undefined;
    this.viewerTransportUp.set(false);
  }

  private onViewerTransportUp = () => {
    this.viewerTransportUp.set(true);
  };

  private onViewerTransportDown = () => {
    this.viewerTransportUp.set(false);
  };

  /**
   * Banner action: bring the viewer's own signaling transport back up. The
   * social socket is preferred when the viewer has an account; a share-link
   * guest reconnects the token-scoped socket instead.
   */
  reconnectViewerTransport(): void {
    const social = this.social.getSocket();
    if (social) {
      // Optional call: a socket the social service has not finished building
      // (and a test double) may not expose connect().
      if (!social.connected) social.connect?.();
      return;
    }
    if (this.guestSocket && !this.guestSocket.connected) {
      this.guestSocket.connect?.();
    }
  }

  /**
   * The viewer's signaling socket. Signed-in viewers reuse the social
   * socket; a share-link visitor with no account gets a token-scoped guest
   * socket, so "anyone with the link" can actually watch.
   */
  private async waitForViewerSocket(token: string): Promise<Socket | null> {
    const socialSocket = this.social.getSocket();
    if (socialSocket) return this.awaitSocket(socialSocket);
    if (this.guestSocket?.connected) return this.guestSocket;
    return this.awaitSocket(this.ensureGuestSocket(token));
  }

  private awaitSocket(socket: Socket, timeoutMs = SOCKET_WAIT_MS): Promise<Socket | null> {
    if (socket.connected) return Promise.resolve(socket);
    const startedAt = Date.now();
    return new Promise((resolve) => {
      const poll = setInterval(() => {
        if (socket.connected) {
          clearInterval(poll);
          resolve(socket);
          return;
        }
        if (Date.now() - startedAt >= timeoutMs) {
          clearInterval(poll);
          resolve(null);
        }
      }, 250);
    });
  }

  /** Guest signaling socket, authenticated by the share token itself. */
  private ensureGuestSocket(token: string): Socket {
    const existing = this.guestSocket;
    if (existing) {
      existing.auth = { liveToken: token };
      if (!existing.connected) existing.connect();
      return existing;
    }
    const created = io(APP_SECURITY_CONFIG.socket_url, {
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1500,
      auth: (cb) => cb({ liveToken: this.viewerToken ?? token }),
    });
    created.on("connect", this.onViewerTransportUp);
    created.on("disconnect", this.onViewerTransportDown);
    if (created.connected) this.viewerTransportUp.set(true);
    this.guestSocket = created;
    return created;
  }

  private async waitForSocket(
    timeoutMs = SOCKET_WAIT_MS,
  ): Promise<Socket | null> {
    const existing = this.social.getSocket();
    if (existing?.connected) return existing;
    const startedAt = Date.now();
    return new Promise((resolve) => {
      const poll = setInterval(() => {
        const socket = this.social.getSocket();
        if (socket?.connected) {
          clearInterval(poll);
          resolve(socket);
          return;
        }
        if (Date.now() - startedAt >= timeoutMs) {
          clearInterval(poll);
          resolve(null);
        }
      }, 250);
    });
  }

  /**
   * Managed TURN credentials are short-lived, so refresh well before they
   * expire. Concurrent callers share one request instead of racing.
   */
  private ensureIce(): Promise<void> {
    if (!this.hostToken && !this.viewerToken) return Promise.resolve();
    if (this.iceConfig && Date.now() - this.iceLoadedAt < ICE_CACHE_MS) {
      return this.iceConfig;
    }
    this.iceLoadedAt = Date.now();
    this.iceConfig = this.fetchIceConfig();
    return this.iceConfig;
  }

  private async fetchIceConfig(): Promise<void> {
    const token = this.hostToken || this.viewerToken;
    if (!token) return;
    try {
      const config = await firstValueFrom(
        this.http.get<IceConfigResponse>(
          `${APP_SECURITY_CONFIG.api_url}/live-streams/ice?token=${encodeURIComponent(
            token,
          )}`,
        ),
      );
      if (Array.isArray(config?.iceServers) && config.iceServers.length > 0) {
        this.iceServers = config.iceServers;
      }
      if (config?.turn) this.turnHealth.set(config.turn);
    } catch {
      // Fall back to public STUN; direct connections still work on most
      // home networks, just not behind symmetric NAT without TURN.
      this.turnHealth.set({
        configured: false,
        managed: false,
        available: false,
        source: "none",
      });
    }
  }
}
