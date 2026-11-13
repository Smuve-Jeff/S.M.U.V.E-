import { TestBed } from "@angular/core/testing";
import { HttpClient } from "@angular/common/http";
import { of } from "rxjs";
import { LiveVideoService } from "./live-video.service";
import { DEFAULT_VIEWER_HEALTH } from "./viewer-health";
import { SocialNetworkingService } from "./social-networking.service";
import type { LiveStreamRecord } from "./live-stream.service";

class FakeSocket {
  connected = true;
  id = "host-socket";
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

  addTrack(track: any): void {
    this.tracks.push(track);
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

const makeTrack = (kind: "audio" | "video") => ({
  kind,
  enabled: true,
  stop: jest.fn(),
});

describe("LiveVideoService", () => {
  let service: LiveVideoService;
  let socket: FakeSocket;
  let social: {
    getSocket: jest.Mock;
    localStream: jest.Mock;
    streamError: jest.Mock;
    socketConnected: jest.Mock;
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
      socketConnected: jest.fn(() => true),
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
    expect(pc.tracks).toEqual([videoTrack, audioTrack]);
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

    pc.ontrack?.({ streams: [remoteMedia], track: videoTrack });
    expect(service.remoteStream()).toBe(remoteMedia);
    expect(service.status()).toBe("live");

    service.toggleMute();
    expect(service.isMuted()).toBe(false);
    expect(remoteAudio.enabled).toBe(true);
    service.toggleMute();
    expect(service.isMuted()).toBe(true);
    expect(remoteAudio.enabled).toBe(false);
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
});
