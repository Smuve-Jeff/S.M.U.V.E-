import { Injectable, inject, signal } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { firstValueFrom } from "rxjs";
import { Socket } from "socket.io-client";
import { APP_SECURITY_CONFIG } from "../app.security";
import { SocialNetworkingService } from "./social-networking.service";
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
  source: "cloudflare" | "static" | "none";
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
}

type SocketPayload = Record<string, any>;

const FALLBACK_ICE_SERVERS: RTCIceServer[] = [
  { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
];
const SOCKET_WAIT_MS = 8_000;
const HOST_MEDIA_WAIT_MS = 8_000;
const VIEWER_OFFER_TIMEOUT_MS = 15_000;
const VIEWER_POLL_MS = 12_000;
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

  private onViewerJoined = (data: SocketPayload) => {
    if (!this.hostToken || data?.streamToken !== this.hostToken) return;
    const socketId = typeof data?.socketId === "string" ? data.socketId : "";
    if (!socketId || this.hostPeers.has(socketId)) return;
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
    };
    this.hostPeers.set(socketId, entry);
    this.upsertViewerConnection({
      socketId,
      name: this.viewerNames.get(socketId) ?? null,
      state: "connecting",
      rttMs: null,
      kbps: null,
    });
    media.getTracks().forEach((track) => pc.addTrack(track, media));

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
    this.isMuted.set(true);

    const socket = await this.waitForSocket();
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
    if (this.viewerPc) return;
    const sdp = data?.sdp;
    if (!sdp || sdp.type !== "offer" || typeof sdp.sdp !== "string") return;
    void this.acceptOffer(sdp);
  };

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
      const stream = event.streams[0] ?? new MediaStream([event.track]);
      this.remoteStream.set(stream);
      this.status.set("live");
      this.clearViewerTimeout();
      stream
        .getAudioTracks()
        .forEach((track) => (track.enabled = !this.isMuted()));
    };
    pc.onicecandidate = (event) => {
      if (!event.candidate || !this.boundSocket) return;
      this.boundSocket.emit("live_webrtc_ice", {
        token: this.viewerToken,
        candidate: event.candidate.toJSON(),
      });
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "failed") {
        this.failViewer(
          "FEED BLOCKED BY NETWORK — A TURN RELAY MAY BE REQUIRED",
        );
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
    } catch (err) {
      console.error("[LiveVideo] Could not answer the host feed", err);
      this.failViewer("COULD NOT NEGOTIATE THE HOST FEED");
    }
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
    this.clearViewerPoll();
    this.viewerPc?.close();
    this.viewerPc = undefined;
    this.viewerPendingIce = [];
    this.remoteStream.set(null);
    this.viewerToken = null;
    this.watchingToken.set(null);
    this.status.set(status);
    this.feedError.set(message);
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
    socket.on("live_stream_viewer_joined", this.onViewerJoined);
    socket.on("live_stream_viewer_left", this.onViewerLeft);
    socket.on("live_webrtc_offer", this.onOffer);
    socket.on("live_webrtc_answer", this.onAnswer);
    socket.on("live_webrtc_ice", this.onIce);
    socket.on("live_stream_watch_ok", this.onWatchOk);
    socket.on("live_stream_watch_failed", this.onWatchFailed);
    socket.on("live_stream_feed_unavailable", this.onFeedUnavailable);
    socket.on("live_stream_ended", this.onStreamEnded);
    socket.on("connect", this.onSocketConnect);
  }

  private unbindSocket(): void {
    const socket = this.boundSocket;
    if (!socket) return;
    socket.off("live_stream_viewer_joined", this.onViewerJoined);
    socket.off("live_stream_viewer_left", this.onViewerLeft);
    socket.off("live_webrtc_offer", this.onOffer);
    socket.off("live_webrtc_answer", this.onAnswer);
    socket.off("live_webrtc_ice", this.onIce);
    socket.off("live_stream_watch_ok", this.onWatchOk);
    socket.off("live_stream_watch_failed", this.onWatchFailed);
    socket.off("live_stream_feed_unavailable", this.onFeedUnavailable);
    socket.off("live_stream_ended", this.onStreamEnded);
    socket.off("connect", this.onSocketConnect);
    this.boundSocket = undefined;
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
