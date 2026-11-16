import {
  applyH264Preference,
  h264Only,
  WhipPublisher,
  type VideoCodec,
} from './whip-publisher';

const capability = (mimeType: string, profile?: string): VideoCodec =>
  ({
    mimeType,
    clockRate: 90000,
    ...(profile
      ? { sdpFmtpLine: `profile-level-id=${profile};packetization-mode=1` }
      : {}),
  }) as VideoCodec;

describe('h264Only', () => {
  it('drops every codec the relay cannot mux', () => {
    const result = h264Only([
      capability('video/VP8'),
      capability('video/H264', '42e01f'),
      capability('video/VP9'),
      capability('video/AV1'),
    ]);

    expect(result).toEqual([capability('video/H264', '42e01f')]);
  });

  it('orders constrained baseline ahead of main and high', () => {
    const result = h264Only([
      capability('video/H264', '64001f'),
      capability('video/H264', '4d001f'),
      capability('video/H264', '42e01f'),
    ]);

    expect(result?.map((codec) => codec.sdpFmtpLine)).toEqual([
      'profile-level-id=42e01f;packetization-mode=1',
      'profile-level-id=4d001f;packetization-mode=1',
      'profile-level-id=64001f;packetization-mode=1',
    ]);
  });

  it('reports a browser with no H.264 encoder instead of guessing', () => {
    expect(h264Only([capability('video/VP8'), capability('video/AV1')])).toBeNull();
  });
});

describe('applyH264Preference', () => {
  const sender = { id: 'video' } as unknown as RTCRtpSender;
  // The publisher finds the transceiver by sender identity, so the stub has to
  // hold the same object it is given.
  const pcWith = (setCodecPreferences: jest.Mock) =>
    ({
      getTransceivers: () => [{ sender, setCodecPreferences }],
    }) as unknown as RTCPeerConnection;

  const withCapabilities = (codecs: VideoCodec[]) => {
    (global as unknown as { RTCRtpSender: unknown }).RTCRtpSender = {
      getCapabilities: () => ({ codecs }),
    };
  };

  afterEach(() => {
    delete (global as unknown as { RTCRtpSender?: unknown }).RTCRtpSender;
  });

  it('sets only the H.264 capabilities on the video transceiver', () => {
    withCapabilities([capability('video/VP8'), capability('video/H264', '42e01f')]);
    const setCodecPreferences = jest.fn();

    const problem = applyH264Preference(pcWith(setCodecPreferences), sender);

    expect(problem).toBeNull();
    expect(setCodecPreferences).toHaveBeenCalledWith([
      capability('video/H264', '42e01f'),
    ]);
  });

  it('refuses the push when the browser has no H.264 encoder', () => {
    withCapabilities([capability('video/VP8')]);
    const setCodecPreferences = jest.fn();

    expect(applyH264Preference(pcWith(setCodecPreferences), sender)).toBe(
      'THIS BROWSER HAS NO H.264 ENCODER — THE RELAY CANNOT CARRY ANOTHER CODEC'
    );
    expect(setCodecPreferences).not.toHaveBeenCalled();
  });

  it('leaves a browser without setCodecPreferences working as before', () => {
    withCapabilities([capability('video/H264', '42e01f')]);
    const pc = {
      getTransceivers: () => [{ sender }],
    } as unknown as RTCPeerConnection;

    expect(applyH264Preference(pc, sender)).toBeNull();
  });
});

describe('WhipPublisher.start', () => {
  class FakePeerConnection {
    localDescription: { sdp: string } | null = { sdp: 'v=0' };
    iceGatheringState: RTCIceGatheringState = 'complete';
    videoSender = { id: 'video', replaceTrack: jest.fn(async () => undefined) };
    audioSender = { id: 'audio', replaceTrack: jest.fn(async () => undefined) };
    addTrack = jest.fn((track: { kind?: string }) =>
      track?.kind === 'audio' ? this.audioSender : this.videoSender
    );
    createOffer = jest.fn(async () => ({ type: 'offer', sdp: 'v=0' }));
    setLocalDescription = jest.fn(async () => undefined);
    setRemoteDescription = jest.fn(async () => undefined);
    close = jest.fn();
    addEventListener = jest.fn();
    removeEventListener = jest.fn();
    getTransceivers = jest.fn(() => [
      { sender: this.videoSender, setCodecPreferences: jest.fn() },
    ]);

    constructor() {
      lastPc = this;
    }
  }

  const stream = {
    getVideoTracks: () => [{ kind: 'video' }],
    getAudioTracks: () => [],
  } as unknown as MediaStream;

  let lastPc: FakePeerConnection;
  let fetchMock: jest.Mock;
  let originalPc: unknown;

  beforeEach(() => {
    originalPc = (global as unknown as { RTCPeerConnection?: unknown })
      .RTCPeerConnection;
    (global as unknown as { RTCPeerConnection: unknown }).RTCPeerConnection =
      FakePeerConnection;
    fetchMock = jest.fn();
    (global as unknown as { fetch: unknown }).fetch = fetchMock;
  });

  afterEach(() => {
    (global as unknown as { RTCPeerConnection: unknown }).RTCPeerConnection =
      originalPc;
    delete (global as unknown as { RTCRtpSender?: unknown }).RTCRtpSender;
  });

  it('never reaches the network when no H.264 capability exists', async () => {
    (global as unknown as { RTCRtpSender: unknown }).RTCRtpSender = {
      getCapabilities: () => ({ codecs: [capability('video/VP8')] }),
    };
    const publisher = new WhipPublisher();

    const started = await publisher.start('https://relay.test/s/whip', stream);

    expect(started).toBe(false);
    expect(publisher.state()).toBe('error');
    expect(publisher.error()).toContain('NO H.264 ENCODER');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('publishes when H.264 is available', async () => {
    (global as unknown as { RTCRtpSender: unknown }).RTCRtpSender = {
      getCapabilities: () => ({
        codecs: [capability('video/VP8'), capability('video/H264', '42e01f')],
      }),
    };
    fetchMock.mockResolvedValue({
      ok: true,
      headers: { get: () => 'https://relay.test/s/whip/abc' },
      text: async () => 'v=0',
    });
    const publisher = new WhipPublisher();

    const started = await publisher.start('https://relay.test/s/whip', stream);

    expect(started).toBe(true);
    expect(publisher.state()).toBe('live');
    expect(publisher.error()).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('mixes mic and screen sound into the one audio track WHIP can carry', async () => {
    const mic = { kind: 'audio', id: 'mic' };
    const system = { kind: 'audio', id: 'system' };
    const mixed = { kind: 'audio', id: 'mixed', stop: jest.fn() };
    const screenStream = {
      getVideoTracks: () => [{ kind: 'video' }],
      getAudioTracks: () => [mic, system],
    } as unknown as MediaStream;
    const mediaStream = installAudioMixer(mixed);
    installH264();
    fetchMock.mockResolvedValue({
      ok: true,
      headers: { get: () => 'https://relay.test/s/whip/abc' },
      text: async () => 'v=0',
    });
    const publisher = new WhipPublisher();

    try {
      await publisher.start('https://relay.test/s/whip', screenStream);

      expect(lastPc.addTrack).toHaveBeenNthCalledWith(
        1,
        screenStream.getVideoTracks()[0],
        screenStream
      );
      expect(lastPc.addTrack).toHaveBeenNthCalledWith(2, mixed, screenStream);
      expect(lastPc.addTrack).not.toHaveBeenCalledWith(mic, screenStream);
      expect(lastPc.addTrack).not.toHaveBeenCalledWith(system, screenStream);
      expect(mediaStream.context.createMediaStreamSource).toHaveBeenCalledTimes(
        2
      );
    } finally {
      await publisher.stop();
      mediaStream.restore();
    }
  });

  it('keeps the AudioContext primed by the click through the async start', async () => {
    const mic = { kind: 'audio', id: 'mic' };
    const system = { kind: 'audio', id: 'system' };
    const mixed = { kind: 'audio', id: 'mixed', stop: jest.fn() };
    const screenStream = {
      getVideoTracks: () => [{ kind: 'video' }],
      getAudioTracks: () => [mic, system],
    } as unknown as MediaStream;
    const mediaStream = installAudioMixer(mixed);
    mediaStream.context.state = 'suspended';
    installH264();
    fetchMock.mockResolvedValue({
      ok: true,
      headers: { get: () => 'https://relay.test/s/whip/abc' },
      text: async () => 'v=0',
    });
    const publisher = new WhipPublisher();

    try {
      publisher.primeAudioContext();
      const primed = (publisher as unknown as { audioContext: unknown })
        .audioContext;
      expect(mediaStream.context.resume).toHaveBeenCalled();

      await publisher.start('https://relay.test/s/whip', screenStream);

      expect((publisher as unknown as { audioContext: unknown }).audioContext).toBe(
        primed
      );
      expect(mediaStream.context.close).not.toHaveBeenCalled();
      expect(lastPc.addTrack).toHaveBeenNthCalledWith(2, mixed, screenStream);
    } finally {
      await publisher.stop();
      expect(mediaStream.context.close).toHaveBeenCalled();
      mediaStream.restore();
    }
  });

  it('rebuilds the audio mix when the host switches camera ↔ screen', async () => {
    const mic = { kind: 'audio', id: 'mic' };
    const system = { kind: 'audio', id: 'system' };
    const mixed = { kind: 'audio', id: 'mixed', stop: jest.fn() };
    const cameraStream = {
      getVideoTracks: () => [{ kind: 'video', id: 'cam' }],
      getAudioTracks: () => [mic],
    } as unknown as MediaStream;
    const screenStream = {
      getVideoTracks: () => [{ kind: 'video', id: 'screen' }],
      getAudioTracks: () => [mic, system],
    } as unknown as MediaStream;
    const mediaStream = installAudioMixer(mixed);
    installH264();
    fetchMock.mockResolvedValue({
      ok: true,
      headers: { get: () => 'https://relay.test/s/whip/abc' },
      text: async () => 'v=0',
    });
    const publisher = new WhipPublisher();

    try {
      await publisher.start('https://relay.test/s/whip', cameraStream);
      expect(lastPc.addTrack).toHaveBeenLastCalledWith(mic, cameraStream);

      publisher.replaceTracks(screenStream);
      expect(lastPc.audioSender.replaceTrack).toHaveBeenLastCalledWith(mixed);
      expect(mediaStream.context.createMediaStreamSource).toHaveBeenCalledTimes(
        2
      );

      publisher.replaceTracks(cameraStream);
      expect(lastPc.audioSender.replaceTrack).toHaveBeenLastCalledWith(mic);
      expect(mixed.stop).toHaveBeenCalled();
    } finally {
      await publisher.stop();
      mediaStream.restore();
    }
  });

  function installH264(): void {
    (global as unknown as { RTCRtpSender: unknown }).RTCRtpSender = {
      getCapabilities: () => ({
        codecs: [capability('video/H264', '42e01f')],
      }),
    };
  }

  function installAudioMixer(mixed: MediaStreamTrack) {
    const originalMediaStream = (globalThis as { MediaStream?: unknown })
      .MediaStream;
    const originalAudioContext = (globalThis as { AudioContext?: unknown })
      .AudioContext;
    const source = () => ({
      connect: jest.fn(),
      disconnect: jest.fn(),
    });
    const context = {
      state: 'running',
      resume: jest.fn(async () => undefined),
      close: jest.fn(async () => undefined),
      createMediaStreamDestination: jest.fn(() => ({
        stream: {
          getAudioTracks: () => [mixed],
          getTracks: () => [mixed],
        },
      })),
      createMediaStreamSource: jest.fn(source),
    };
    (globalThis as { MediaStream?: unknown }).MediaStream = class {
      constructor(public tracks: MediaStreamTrack[] = []) {}
    };
    (globalThis as { AudioContext?: unknown }).AudioContext = jest.fn(
      () => context
    );
    return {
      context,
      restore: () => {
        (globalThis as { MediaStream?: unknown }).MediaStream =
          originalMediaStream;
        if (originalAudioContext === undefined) {
          delete (globalThis as { AudioContext?: unknown }).AudioContext;
        } else {
          (globalThis as { AudioContext?: unknown }).AudioContext =
            originalAudioContext;
        }
      },
    };
  }
});
