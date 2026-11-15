jest.mock("socket.io-client", () => ({ io: jest.fn() }));

import { signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { HttpClient } from "@angular/common/http";
import { of } from "rxjs";
import { io } from "socket.io-client";
import { LiveVideoService } from "./live-video.service";
import { DEFAULT_VIEWER_HEALTH } from "./viewer-health";
import { SocialNetworkingService } from "./social-networking.service";
import type { LiveStreamRecord } from "./live-stream.service";

class FakeSocket {
  connected = true;
  id = "host-socket";
  auth: any = {};
  connect = jest.fn(() => {
    this.connected = true;
  });
  disconnect = jest.fn(() => {
    this.connected = false;
  });
  emitted: Array<{ event: string; data?: any }> = [];
  private handlers = new Map<string, Set<(data?: any) => void>>();

  on(event: string, handler: (data?: any) => void): this {
    if (!this.handlers.has(event)) this.handlers.set(event, new Set());
    this.handlers.get(event)!.add(handler);
    return this;
  }

  off(event: string, handler: (data?: any) => void): this {
    this.handlers.get(event)?.delete(handler);
    return this;
  }

  emit(event: string, data?: any): this {
    this.emitted.push({ event, data });
    return this;
  }

  trigger(event: string, data?: any): void {
    this.handlers.get(event)?.forEach((handler) => handler(data));
  }

  listenerCount(event: string): number {
    return this.handlers.get(event)?.size ?? 0;
  }
}

class FakePeerConnection {
  static instances: FakePeerConnection[] = [];
  localDescription: any = null;
  remoteDescription: any = null;
  connectionState = "new";
  closed = false;
  tracks: any[] = [];
  addedCandidates: any[] = [];
  onicecandidate: ((event: any) => void) | null = null;
  ontrack: ((event: any) => void) | null = null;
  onconnectionstatechange: (() => void) | null = null;
  stats: any = { forEach: () => undefined, get: () => undefined };

  constructor(public config?: any) {
    FakePeerConnection.instances.push(this);
  }

  senders: Array<{ track: any; replaceTrack: jest.Mock }> = [];
  receivers: Array<{ track: any }> = [];
  getReceivers(): Array<{ track: any }> {
    return this.receivers;
  }
  addTrack(track: any): { track: any; replaceTrack: jest.Mock } {
    this.tracks.push(track);
    const sender = { track, replaceTrack: jest.fn(async () => undefined) };
    this.senders.push(sender);
    return sender;
  }

  getSenders(): Array<{ track: any; replaceTrack: jest.Mock }> {
    return this.senders;
  }

  async createOffer(): Promise<any> {
    return { type: "offer", sdp: "offer-sdp" };
  }

  async createAnswer(): Promise<any> {
    return { type: "answer", sdp: "answer-sdp" };
  }

  async setLocalDescription(description: any): Promise<void> {
    this.localDescription = description;
  }

  async setRemoteDescription(description: any): Promise<void> {
    this.remoteDescription = description;
  }

  async addIceCandidate(candidate: any): Promise<void> {
    this.addedCandidates.push(candidate);
  }

  async getStats(): Promise<any> {
    return this.stats;
  }

  close(): void {
    this.closed = true;
    this.connectionState = "closed";
  }
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

const makeTrack = (kind: "audio" | "video", role?: string) => {
  const track: any = {
    kind,
    enabled: true,
    stop: jest.fn(),
    __role: role ?? (kind === "audio" ? "mic" : "camera"),
  };
  track.clone = jest.fn(() => makeTrack(kind, track.__role));
  return track;
};

describe("LiveVideoService", () => {
  let service: LiveVideoService;
  let socket: FakeSocket;
  let social: {
    getSocket: jest.Mock;
    localStream: jest.Mock;
    streamError: jest.Mock;
    socketConnected: jest.Mock;
    retryHostMedia: jest.Mock;
  };
  let http: { get: jest.Mock };
  let videoTrack: ReturnType<typeof makeTrack>;
  let audioTrack: ReturnType<typeof makeTrack>;
  let remoteAudio: ReturnType<typeof makeTrack>;
  let media: any;
  let remoteMedia: any;

  const stream = {
    id: 5,
    shareToken: "tok",
    platform: "smuve",
  } as LiveStreamRecord;

  beforeAll(() => {
    (global as any).RTCPeerConnection = FakePeerConnection;
    (global as any).RTCSessionDescription = class {
      constructor(public init: any) {
        Object.assign(this, init);
      }
    };
    (global as any).RTCIceCandidate = class {
      constructor(public init: any) {
        Object.assign(this, init);
      }
    };
    (global as any).MediaStream = class {
      constructor(public tracks: any[] = []) {}
      getTracks() {
        return [...this.tracks];
      }
      getAudioTracks() {
        return this.tracks.filter((t) => t.kind === "audio");
      }
      getVideoTracks() {
        return this.tracks.filter((t) => t.kind === "video");
      }
    };
  });

  beforeEach(() => {
    TestBed.resetTestingModule();
    FakePeerConnection.instances = [];
    socket = new FakeSocket();
    videoTrack = makeTrack("video");
    audioTrack = makeTrack("audio");
    remoteAudio = makeTrack("audio");
    media = {
      getTracks: () => [videoTrack, audioTrack],
      getVideoTracks: () => [videoTrack],
      getAudioTracks: () => [audioTrack],
    };
    remoteMedia = {
      getTracks: () => [remoteAudio],
      getAudioTracks: () => [remoteAudio],
    };
    social = {
      getSocket: jest.fn(() => socket as any),
      localStream: jest.fn(() => media),
      streamError: jest.fn(() => null),
      retryHostMedia: jest.fn(async () => true),
      socketConnected: jest.fn(() => true),
      videoSource: jest.fn(() => "camera"),
      screenAudioOnly: jest.fn(() => false),
      audioRoleOf: jest.fn((t: any) => t.__role ?? "mic"),
      onHostStreamReplaced: jest.fn(() => () => undefined),
    };
    http = {
      get: jest.fn(() =>
        of({
          iceServers: [{ urls: "stun:test" }],
          turn: {
            configured: true,
            managed: true,
            available: true,
            source: "cloudflare",
          },
        }),
      ),
    };

    TestBed.configureTestingModule({
      providers: [
        LiveVideoService,
        { provide: SocialNetworkingService, useValue: social },
        { provide: HttpClient, useValue: http },
      ],
    });
    service = TestBed.inject(LiveVideoService);
  });

  afterEach(() => {
    service.stopWatching();
    service.stopHosting();
  });

  it("exposes the TURN relay health reported by the API", async () => {
    service.startHosting(stream);
    await flush();

    expect(service.turnHealth()).toEqual({
      configured: true,
      managed: true,
      available: true,
      source: "cloudflare",
    });
  });

  it("reports a relayed viewer from the selected candidate pair", async () => {
    service.startHosting(stream);
    await flush();
    socket.trigger("live_stream_viewer_joined", {
      streamToken: "tok",
      socketId: "viewer-1",
      viewerName: "NOVA",
      streamId: 5,
    });
    await flush();

    const pc = FakePeerConnection.instances[0];
    expect(service.viewerConnections()).toEqual([
      {
        socketId: "viewer-1",
        name: "NOVA",
        state: "connecting",
        rttMs: null,
        kbps: null,
      },
    ]);

    const reports = new Map<string, any>([
      [
        "pair-1",
        {
          type: "candidate-pair",
          state: "succeeded",
          selected: true,
          localCandidateId: "local-1",
          currentRoundTripTime: 0.084,
        },
      ],
      ["local-1", { type: "local-candidate", candidateType: "relay" }],
      ["rtp-1", { type: "outbound-rtp", kind: "video", bytesSent: 1_000 }],
      ["rtp-2", { type: "outbound-rtp", kind: "audio", bytesSent: 2_000 }],
    ]);
    pc.stats = {
      forEach: (callback: (value: any) => void) =>
        reports.forEach((value) => callback(value)),
      get: (id: string) => reports.get(id),
    };
    const nowSpy = jest.spyOn(Date, "now").mockReturnValue(1_000_000);
    pc.connectionState = "connected";
    pc.onconnectionstatechange?.();
    await flush();

    expect(service.viewerConnections()).toEqual([
      {
        socketId: "viewer-1",
        name: "NOVA",
        state: "relay",
        rttMs: 84,
        kbps: null,
      },
    ]);

    // The first sample only records a baseline; the next 4s window yields
    // the outbound media bitrate for this viewer.
    (reports.get("rtp-1") as any).bytesSent = 21_000;
    nowSpy.mockReturnValue(1_004_000);
    pc.onconnectionstatechange?.();
    await flush();

    const [connection] = service.viewerConnections();
    expect(connection.rttMs).toBe(84);
    expect(connection.kbps).toBe(40);
    nowSpy.mockRestore();

    service.stopHosting();
    expect(service.viewerConnections()).toEqual([]);
  });

  it("applies delivery preset health thresholds and resets safely", () => {
    const preset = {
      rttFairMs: 90,
      rttPoorMs: 180,
      kbpsFair: 1000,
      kbpsPoor: 250,
    };
    service.setViewerHealthThresholds(preset, "CinemaScope 4K");
    expect(service.viewerHealthThresholds()).toEqual(preset);
    expect(service.viewerHealthLabel()).toBe("CinemaScope 4K");

    service.setViewerHealthThresholds(undefined);
    expect(service.viewerHealthThresholds()).toEqual(DEFAULT_VIEWER_HEALTH);
    expect(service.viewerHealthLabel()).toBe("DEFAULT");
  });

  it("registers the host and offers the captured tracks to a viewer", async () => {
    service.startHosting(stream);
    await flush();

    expect(socket.emitted).toContainEqual({
      event: "live_stream_host_join",
      data: { token: "tok" },
    });

    socket.trigger("live_stream_viewer_joined", {
      streamToken: "tok",
      socketId: "viewer-1",
      streamId: 5,
    });
    await flush();

    const pc = FakePeerConnection.instances[0];
    expect(pc).toBeDefined();
    // Canonical slot order: camera (live), game (silent), mic, system.
    expect(pc.tracks[0]).toBe(videoTrack);
    expect(pc.tracks).toHaveLength(4);
    expect(pc.config.iceServers).toEqual([{ urls: "stun:test" }]);
    const offer = socket.emitted.find(
      (entry) => entry.event === "live_webrtc_offer",
    );
    expect(offer?.data).toMatchObject({
      token: "tok",
      toSocketId: "viewer-1",
      sdp: { type: "offer", sdp: "offer-sdp" },
    });
  });

  it("applies the viewer answer and flushes early ICE candidates", async () => {
    service.startHosting(stream);
    await flush();
    socket.trigger("live_stream_viewer_joined", {
      streamToken: "tok",
      socketId: "viewer-1",
      streamId: 5,
    });
    await flush();
    const pc = FakePeerConnection.instances[0];

    socket.trigger("live_webrtc_ice", {
      streamToken: "tok",
      fromSocketId: "viewer-1",
      candidate: { candidate: "early" },
    });
    await flush();
    expect(pc.addedCandidates).toHaveLength(0);

    socket.trigger("live_webrtc_answer", {
      streamToken: "tok",
      fromSocketId: "viewer-1",
      sdp: { type: "answer", sdp: "answer-sdp" },
    });
    await flush();

    expect(pc.remoteDescription?.sdp).toBe("answer-sdp");
    expect(pc.addedCandidates[0]?.candidate).toBe("early");
  });

  it("does not offer a feed when capture has not produced a track", async () => {
    social.localStream.mockReturnValue(null);
    social.streamError.mockReturnValue("NO CAMERA ACCESS");
    service.startHosting(stream);
    await flush();
    socket.trigger("live_stream_viewer_joined", {
      streamToken: "tok",
      socketId: "viewer-1",
      streamId: 5,
    });
    await flush();

    expect(FakePeerConnection.instances).toHaveLength(0);
    expect(
      socket.emitted.some((entry) => entry.event === "live_webrtc_offer"),
    ).toBe(false);
  });

  it("ignores a viewer registered for a different stream token", async () => {
    service.startHosting(stream);
    await flush();
    socket.trigger("live_stream_viewer_joined", {
      streamToken: "other",
      socketId: "viewer-1",
      streamId: 6,
    });
    await flush();
    expect(FakePeerConnection.instances).toHaveLength(0);
  });

  it("watches a shared stream and plays the host track", async () => {
    await service.watch("tok");
    expect(service.status()).toBe("connecting");
    expect(socket.emitted).toContainEqual({
      event: "live_stream_watch",
      data: { token: "tok" },
    });

    socket.trigger("live_stream_watch_ok", {
      streamToken: "tok",
      streamId: 5,
    });
    expect(service.status()).toBe("waiting");

    socket.trigger("live_webrtc_offer", {
      streamToken: "tok",
      sdp: { type: "offer", sdp: "host-offer" },
    });
    await flush();

    const pc = FakePeerConnection.instances[0];
    expect(pc.remoteDescription?.sdp).toBe("host-offer");
    expect(
      socket.emitted.filter((entry) => entry.event === "live_webrtc_answer"),
    ).toHaveLength(1);

    pc.receivers = [{ track: videoTrack }, { track: remoteAudio }];
    pc.ontrack?.({ streams: [remoteMedia], track: videoTrack });
    expect(service.remoteStream()!.getVideoTracks()).toEqual([videoTrack]);
    expect(service.remoteStream()!.getAudioTracks()).toEqual([remoteAudio]);
    expect(service.status()).toBe("live");

    service.toggleMute();
    expect(service.isMuted()).toBe(false);
    expect(remoteAudio.enabled).toBe(true);
    service.toggleMute();
    expect(service.isMuted()).toBe(true);
    expect(remoteAudio.enabled).toBe(false);
  });

  it("rebuilds the split as later receiver tracks arrive (camera → game)", async () => {
    await service.watch("tok");
    socket.trigger("live_webrtc_offer", {
      streamToken: "tok",
      sdp: { type: "offer", sdp: "host-offer" },
    });
    await flush();
    const pc = FakePeerConnection.instances[0];
    const camera = makeTrack("video", "camera");
    const game = makeTrack("video", "game");

    // All host tracks share one remote MediaStream, so a split that trusted
    // event.streams[0] would stay stuck on whatever arrived first.
    pc.receivers = [{ track: camera }];
    pc.ontrack?.({ streams: [remoteMedia], track: camera });
    expect(service.remoteStream()!.getVideoTracks()).toEqual([camera]);

    pc.receivers.push({ track: game });
    pc.ontrack?.({ streams: [remoteMedia], track: game });
    expect(service.remoteStream()!.getVideoTracks()).toEqual([camera, game]);
  });

  it("replays the host's live picture on the join reply for late viewers", async () => {
    await service.watch("tok");
    expect(service.hostSharingScreen()).toBe(false);

    socket.trigger("live_stream_watch_ok", {
      streamToken: "tok",
      streamId: 5,
      videoSource: "screen",
      screenAudioOnly: true,
    });
    expect(service.hostSharingScreen()).toBe(true);
    expect(service.hostScreenAudioOnly()).toBe(true);
  });

  it("falls back to a token-scoped guest socket when nobody is signed in", async () => {
    const guest = new FakeSocket();
    guest.connected = false;
    (social.getSocket as jest.Mock).mockReturnValue(null);
    // Real socket.io connects on creation; the fake has to do the same.
    (io as jest.Mock).mockImplementation(() => {
      guest.connected = true;
      return guest;
    });

    const watching = service.watch("tok");

    // The handshake proves the share token, never an account.
    const authFn = (io as jest.Mock).mock.calls[0][1].auth;
    const cb = jest.fn();
    authFn(cb);
    expect(cb).toHaveBeenCalledWith({ liveToken: "tok" });

    await watching;
    // The join rides the guest socket, never the (absent) social one.
    expect(guest.emitted).toContainEqual({
      event: "live_stream_watch",
      data: { token: "tok" },
    });
    expect(socket.emitted).toHaveLength(0);
    expect(guest.listenerCount("live_webrtc_offer")).toBeGreaterThan(0);
    (io as jest.Mock).mockReset();
  });

  it("retries the host's capture on demand", async () => {
    await expect(service.retryHostFeed()).resolves.toBe(true);
    expect(social.retryHostMedia).toHaveBeenCalledTimes(1);

    (social.retryHostMedia as jest.Mock).mockResolvedValueOnce(false);
    await expect(service.retryHostFeed()).resolves.toBe(false);
  });

  it("reports a host feed that capture never produced", () => {
    // The real service reads these as signals; a mock function never
    // invalidates the cached computed, so drive a real signal here.
    const media = signal<MediaStream | null>(null);
    (social as unknown as { localStream: typeof media }).localStream = media;

    expect(service.hostFeedMissing()).toBe(true);

    media.set({
      getVideoTracks: () => [{ readyState: "ended" }],
    } as unknown as MediaStream);
    expect(service.hostFeedMissing()).toBe(true);

    media.set({
      getVideoTracks: () => [{ readyState: "live" }],
    } as unknown as MediaStream);
    expect(service.hostFeedMissing()).toBe(false);

    media.set(null);
  });

  it("passes a hard-blocked camera through to the hosting surfaces", () => {
    const blocked = signal(false);
    (social as unknown as { captureBlocked: typeof blocked }).captureBlocked =
      blocked;

    expect(service.hostFeedBlocked()).toBe(false);
    blocked.set(true);
    expect(service.hostFeedBlocked()).toBe(true);
    blocked.set(false);
  });

  it("surfaces the platform's capture failure reason", () => {
    const error = signal<string | null>(
      "CAMERA_OR_MIC_DENIED — CHECK BROWSER PERMISSIONS",
    );
    (social as unknown as { streamError: typeof error }).streamError = error;

    expect(service.hostFeedError()).toContain("CAMERA_OR_MIC_DENIED");
    error.set(null);
  });

  it("reports the viewer transport from the socket it bound", async () => {
    await service.watch("tok");
    expect(service.viewerTransportUp()).toBe(true);

    socket.trigger("disconnect");
    expect(service.viewerTransportUp()).toBe(false);

    socket.trigger("connect");
    expect(service.viewerTransportUp()).toBe(true);
    service.stopWatching();
  });

  it("reconnects a share-link guest's own transport", async () => {
    const guest = new FakeSocket();
    guest.connected = false;
    (social.getSocket as jest.Mock).mockReturnValue(null);
    (io as jest.Mock).mockImplementation(() => {
      guest.connected = true;
      return guest;
    });

    await service.watch("tok");
    // A guest has no social socket; the banner has to follow the guest one.
    expect(service.viewerTransportUp()).toBe(true);

    guest.connected = false;
    guest.trigger("disconnect");
    expect(service.viewerTransportUp()).toBe(false);

    service.reconnectViewerTransport();
    expect(guest.connect).toHaveBeenCalled();
    (io as jest.Mock).mockReset();
  });

  it("announces the live picture when it registers as host", async () => {
    service.startHosting(stream);
    await flush();
    expect(socket.emitted).toContainEqual({
      event: "live_stream_source",
      data: { token: "tok", videoSource: "camera", screenAudioOnly: false },
    });
  });

  it("accepts a fresh offer after the inbound peer dies", async () => {
    await service.watch("tok");
    socket.trigger("live_webrtc_offer", {
      streamToken: "tok",
      sdp: { type: "offer", sdp: "first" },
    });
    await flush();
    const first = FakePeerConnection.instances[0];
    expect(FakePeerConnection.instances).toHaveLength(1);

    // A duplicate offer must not tear down a healthy peer.
    socket.trigger("live_webrtc_offer", {
      streamToken: "tok",
      sdp: { type: "offer", sdp: "duplicate" },
    });
    await flush();
    expect(FakePeerConnection.instances).toHaveLength(1);

    // The host reconnected and re-offered: the dead peer cannot block it.
    first.connectionState = "failed";
    expect(service.status()).toBe("connecting");
    first.onconnectionstatechange?.();
    socket.trigger("live_webrtc_offer", {
      streamToken: "tok",
      sdp: { type: "offer", sdp: "second" },
    });
    await flush();

    expect(FakePeerConnection.instances).toHaveLength(2);
    expect(FakePeerConnection.instances[1].remoteDescription?.sdp).toBe(
      "second",
    );
    service.stopWatching();
  });

  it("asks the host for a fresh offer when the peer fails", async () => {
    await service.watch("tok");
    socket.trigger("live_webrtc_offer", {
      streamToken: "tok",
      sdp: { type: "offer", sdp: "first" },
    });
    await flush();
    const pc = FakePeerConnection.instances[0];
    pc.connectionState = "failed";
    pc.onconnectionstatechange?.();

    await new Promise((resolve) => setTimeout(resolve, 3_300));

    const joins = socket.emitted.filter(
      (entry) => entry.event === "live_stream_watch",
    );
    expect(joins).toHaveLength(2);
    expect(joins[1].data).toEqual({ token: "tok" });
    service.stopWatching();
  }, 10_000);

  it("flags a dropped feed and rebuilds it on demand", async () => {
    await service.watch("tok");
    socket.trigger("live_webrtc_offer", {
      streamToken: "tok",
      sdp: { type: "offer", sdp: "first" },
    });
    await flush();
    const pc = FakePeerConnection.instances[0];
    expect(service.recovering()).toBe(false);

    pc.connectionState = "failed";
    pc.onconnectionstatechange?.();
    expect(service.recovering()).toBe(true);

    // The banner action must not wait out the automatic rejoin delay.
    service.retryViewerFeed();
    const joins = socket.emitted.filter(
      (entry) => entry.event === "live_stream_watch",
    );
    expect(joins).toHaveLength(2);
    // The old peer is gone; the replacement is built from the fresh offer.
    expect(FakePeerConnection.instances[0].connectionState).toBe("closed");

    socket.trigger("live_webrtc_offer", {
      streamToken: "tok",
      sdp: { type: "offer", sdp: "retry" },
    });
    await flush();
    expect(FakePeerConnection.instances).toHaveLength(2);
    const retried = FakePeerConnection.instances[1];
    retried.receivers = [{ track: videoTrack }, { track: remoteAudio }];
    retried.ontrack?.({ streams: [remoteMedia], track: videoTrack });

    expect(service.status()).toBe("live");
    expect(service.recovering()).toBe(false);
    service.stopWatching();
  });

  it("does not rebuild a feed the viewer is not watching", () => {
    service.retryViewerFeed();
    expect(service.recovering()).toBe(false);
    expect(
      socket.emitted.filter((entry) => entry.event === "live_stream_watch"),
    ).toHaveLength(0);
  });

  it("stops watching on an ended broadcast and releases the player", async () => {
    await service.watch("tok");
    socket.trigger("live_webrtc_offer", {
      streamToken: "tok",
      sdp: { type: "offer", sdp: "host-offer" },
    });
    await flush();
    const pc = FakePeerConnection.instances[0];
    pc.ontrack?.({ streams: [remoteMedia], track: videoTrack });

    socket.trigger("live_stream_ended", { streamId: 5 });

    expect(service.status()).toBe("ended");
    expect(service.remoteStream()).toBeNull();
    expect(pc.closed).toBe(true);
  });

  it("reports a feed failure from the host as an error", async () => {
    await service.watch("tok");
    socket.trigger("live_stream_feed_unavailable", {
      streamToken: "tok",
      reason: "NO_CAMERA",
    });
    expect(service.status()).toBe("error");
    expect(service.feedError()).toContain("UNAVAILABLE");
  });

  it("emits unwatch and closes the viewer peer when stopped", async () => {
    await service.watch("tok");
    socket.trigger("live_webrtc_offer", {
      streamToken: "tok",
      sdp: { type: "offer", sdp: "host-offer" },
    });
    await flush();
    const pc = FakePeerConnection.instances[0];

    service.stopWatching();

    expect(socket.emitted).toContainEqual({
      event: "live_stream_unwatch",
      data: { token: "tok" },
    });
    expect(pc.closed).toBe(true);
    expect(service.remoteStream()).toBeNull();
    expect(service.status()).toBe("idle");
  });

  it("re-registers the host after a socket rebuild", async () => {
    service.startHosting(stream);
    await flush();
    socket.trigger("live_stream_viewer_joined", {
      streamToken: "tok",
      socketId: "viewer-1",
      streamId: 5,
    });
    await flush();
    expect(FakePeerConnection.instances).toHaveLength(1);

    const rebuilt = new FakeSocket();
    social.getSocket.mockReturnValue(rebuilt as any);
    service.startHosting({ ...stream });
    await flush();

    expect(
      socket.emitted.some((entry) => entry.event === "live_stream_host_leave"),
    ).toBe(true);
    expect(FakePeerConnection.instances[0].closed).toBe(true);
    expect(rebuilt.emitted).toContainEqual({
      event: "live_stream_host_join",
      data: { token: "tok" },
    });
  });

  it("seeds silent game and system slots on every viewer peer", async () => {
    service.startHosting(stream);
    await flush();
    socket.trigger("live_stream_viewer_joined", {
      streamToken: "tok",
      socketId: "viewer-1",
      viewerName: "NOVA",
      streamId: 5,
    });
    await flush();

    const pc = FakePeerConnection.instances[0];
    // Camera + mic ride the live tracks; game + system start silent so a
    // later switch is replaceTrack, never a re-offer.
    expect(pc.senders).toHaveLength(4);
    expect(
      pc.senders.filter((s) => s.track.kind === "video")
    ).toHaveLength(2);
    expect(
      pc.senders.filter((s) => s.track.kind === "audio")
    ).toHaveLength(2);
  });

  it("keeps the camera slot first when the host goes live already sharing", async () => {
    (social.videoSource as jest.Mock).mockReturnValue("screen");
    // Screen capture: one video track plus the narrating mic.
    const screen = makeTrack("video", "game");
    media = {
      getTracks: () => [screen, audioTrack],
      getVideoTracks: () => [screen],
      getAudioTracks: () => [audioTrack],
    };
    social.localStream.mockReturnValue(media);
    service.startHosting(stream);
    await flush();
    socket.trigger("live_stream_viewer_joined", {
      streamToken: "tok",
      socketId: "viewer-1",
      streamId: 5,
    });
    await flush();

    const slots = (service as any).hostPeers
      .get("viewer-1")
      .senders.map((s: any) => s.role);
    expect(slots).toEqual(["camera", "game", "mic", "system"]);
    const pc = FakePeerConnection.instances[0];
    // The camera m-line carries the disabled placeholder; the game m-line
    // carries the real screen, so the audience split never swaps pictures.
    expect(pc.tracks[0].enabled).toBe(false);
    expect(pc.tracks[1]).toBe(screen);
  });

  it("swaps sender tracks by role and announces the source on switch", async () => {
    service.startHosting(stream);
    await flush();
    socket.trigger("live_stream_viewer_joined", {
      streamToken: "tok",
      socketId: "viewer-1",
      viewerName: "NOVA",
      streamId: 5,
    });
    await flush();

    const screenTrack = makeTrack("video", "game");
    const sysTrack = makeTrack("audio", "system");
    (social.videoSource as jest.Mock).mockReturnValue("screen");
    const listener = (social.onHostStreamReplaced as jest.Mock).mock.calls[0][0];
    listener({
      stream: {
        getVideoTracks: () => [screenTrack],
        getAudioTracks: () => [audioTrack, sysTrack],
      },
      videoSource: "screen",
      screenAudioOnly: true,
    });
    await flush();

    const slot = (role: string) =>
      (service as any).hostPeers
        .get("viewer-1")
        .senders.find((s: any) => s.role === role).sender;
    expect(slot("game").replaceTrack).toHaveBeenCalledWith(screenTrack);
    expect(slot("system").replaceTrack).toHaveBeenCalledWith(sysTrack);
    expect(slot("mic").replaceTrack).toHaveBeenCalledWith(audioTrack);
    expect(socket.emitted).toContainEqual({
      event: "live_stream_source",
      data: { token: "tok", videoSource: "screen", screenAudioOnly: true },
    });
  });

  it("lets the viewer display follow the host source announcement", async () => {
    await service.watch("tok");
    expect(service.hostSharingScreen()).toBe(false);

    socket.trigger("live_stream_source_changed", {
      streamId: 5,
      streamToken: "tok",
      videoSource: "screen",
      screenAudioOnly: true,
    });
    await flush();
    expect(service.hostSharingScreen()).toBe(true);
    expect(service.hostScreenAudioOnly()).toBe(true);

    // A stale announcement for another stream changes nothing.
    socket.trigger("live_stream_source_changed", {
      streamId: 9,
      streamToken: "other",
      videoSource: "screen",
      screenAudioOnly: false,
    });
    socket.trigger("live_stream_source_changed", {
      streamId: 5,
      streamToken: "tok",
      videoSource: "camera",
      screenAudioOnly: false,
    });
    await flush();
    expect(service.hostSharingScreen()).toBe(false);
    expect(service.hostScreenAudioOnly()).toBe(false);
  });

  it("resets the viewer source state when watching stops", async () => {
    await service.watch("tok");
    socket.trigger("live_stream_source_changed", {
      streamId: 5,
      streamToken: "tok",
      videoSource: "screen",
      screenAudioOnly: true,
    });
    expect(service.hostSharingScreen()).toBe(true);

    service.stopWatching();
    expect(service.hostSharingScreen()).toBe(false);
    expect(service.hostScreenAudioOnly()).toBe(false);
  });

  it("releases the source-switch subscription when hosting stops", async () => {
    const unsub = jest.fn();
    (social.onHostStreamReplaced as jest.Mock).mockReturnValueOnce(unsub);
    service.startHosting(stream);
    await flush();

    service.stopHosting();
    expect(unsub).toHaveBeenCalled();
  });
});
