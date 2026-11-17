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

  const whipResponse = (location: string | null = null) => ({
    ok: true,
    headers: { get: () => location },
    text: async () => 'v=0',
  });

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

  it('keeps a newer session when an older start is still tearing down', async () => {
    installH264();
    let finishDelete!: (response: Response) => void;
    const pendingDelete = new Promise<Response>((resolve) => {
      finishDelete = resolve;
    });
    fetchMock
      .mockResolvedValueOnce(whipResponse('https://relay.test/s/whip/old'))
      .mockImplementationOnce(() => pendingDelete)
      .mockResolvedValueOnce(whipResponse('https://relay.test/s/whip/new'))
      .mockResolvedValue(whipResponse());
    const publisher = new WhipPublisher();

    expect(await publisher.start('https://relay.test/s/whip/old', stream)).toBe(
      true
    );
    const oldPc = lastPc;

    const staleStart = publisher.start('https://relay.test/s/whip/stale', stream);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(oldPc.close).toHaveBeenCalled();

    expect(await publisher.start('https://relay.test/s/whip/new', stream)).toBe(
      true
    );
    const newerPc = lastPc;

    finishDelete({ ok: true } as Response);
    expect(await staleStart).toBe(false);

    expect(publisher.state()).toBe('live');
    expect(lastPc).toBe(newerPc);
    expect(newerPc.close).not.toHaveBeenCalled();
    await publisher.stop();
  });

  it('does not post SDP from a start that loses the round while gathering ICE', async () => {
    installH264();
    class GatheringPeerConnection extends FakePeerConnection {
      iceGatheringState: RTCIceGatheringState = 'gathering';
    }
    (global as unknown as { RTCPeerConnection: unknown }).RTCPeerConnection =
      GatheringPeerConnection;
    fetchMock.mockResolvedValue(whipResponse('https://relay.test/s/whip/new'));
    const publisher = new WhipPublisher();

    const staleStart = publisher.start('https://relay.test/s/whip/stale', stream);
    for (let i = 0; i < 10; i++) await Promise.resolve();
    const stalePc = lastPc;
    expect(stalePc.addEventListener).toHaveBeenCalled();

    (global as unknown as { RTCPeerConnection: unknown }).RTCPeerConnection =
      FakePeerConnection;
    expect(await publisher.start('https://relay.test/s/whip/new', stream)).toBe(
      true
    );
    const newerPc = lastPc;

    stalePc.iceGatheringState = 'complete';
    const onGathering = stalePc.addEventListener.mock.calls[0][1] as () => void;
    onGathering();

    expect(await staleStart).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(publisher.state()).toBe('live');
    expect(newerPc.close).not.toHaveBeenCalled();
    await publisher.stop();
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

  it('closes the primed context and records the error when RTCPeerConnection construction fails', async () => {
    const mixed = { kind: 'audio', id: 'mixed', stop: jest.fn() };
    const mediaStream = installAudioMixer(mixed);
    const publisher = new WhipPublisher();

    try {
      publisher.primeAudioContext();
      expect(mediaStream.context.close).not.toHaveBeenCalled();
      (global as unknown as { RTCPeerConnection: unknown }).RTCPeerConnection =
        jest.fn(() => {
          throw new Error('WebRTC unavailable');
        });

      expect(await publisher.start('https://relay.test/s/whip', stream)).toBe(
        false
      );

      expect(mediaStream.context.close).toHaveBeenCalled();
      expect(publisher.state()).toBe('error');
      expect(publisher.error()).toBe('WebRTC unavailable');
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      mediaStream.restore();
    }
  });

  it('does not tear down a newer session when an older start fails', async () => {
    installH264();
    let rejectOld!: (error: Error) => void;
    const oldRequest = new Promise<Response>((_, reject) => {
      rejectOld = reject;
    });
    fetchMock
      .mockImplementationOnce(() => oldRequest)
      .mockResolvedValueOnce({
        ok: true,
        headers: { get: () => 'https://relay.test/s/whip/new' },
        text: async () => 'v=0',
      });
    const publisher = new WhipPublisher();

    const oldStart = publisher.start('https://relay.test/s/whip/old', stream);
    for (let i = 0; i < 10 && fetchMock.mock.calls.length === 0; i++) {
      await Promise.resolve();
    }
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const olderPc = lastPc;

    expect(await publisher.start('https://relay.test/s/whip/new', stream)).toBe(
      true
    );
    const newerPc = lastPc;
    olderPc.close.mockClear();

    rejectOld(new Error('old network failure'));
    expect(await oldStart).toBe(false);

    expect(olderPc.close).toHaveBeenCalledTimes(1);
    expect(publisher.state()).toBe('live');
    expect(publisher.error()).toBeNull();
    expect(newerPc.close).not.toHaveBeenCalled();
    await publisher.stop();
  });

  it('closes a stale attempt that resolves after a newer session starts', async () => {
    installH264();
    let resolveOld!: (response: Response) => void;
    const oldRequest = new Promise<Response>((resolve) => {
      resolveOld = resolve;
    });
    fetchMock
      .mockImplementationOnce(() => oldRequest)
      .mockResolvedValueOnce(whipResponse('https://relay.test/s/whip/new'))
      .mockResolvedValue(whipResponse());
    const publisher = new WhipPublisher();

    const oldStart = publisher.start('https://relay.test/s/whip/old', stream);
    for (let i = 0; i < 10 && fetchMock.mock.calls.length === 0; i++) {
      await Promise.resolve();
    }
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const stalePc = lastPc;

    expect(await publisher.start('https://relay.test/s/whip/new', stream)).toBe(
      true
    );
    const newerPc = lastPc;
    stalePc.close.mockClear();

    resolveOld(whipResponse('https://relay.test/s/whip/stale'));
    expect(await oldStart).toBe(false);

    expect(stalePc.close).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://relay.test/s/whip/stale',
      { method: 'DELETE' }
    );
    expect(publisher.state()).toBe('live');
    expect(newerPc.close).not.toHaveBeenCalled();
    await publisher.stop();
  });

  it('closes a context primed for a push that never reaches WHIP', () => {
    const mixed = { kind: 'audio', id: 'mixed', stop: jest.fn() };
    const mediaStream = installAudioMixer(mixed);
    const publisher = new WhipPublisher();

    try {
      publisher.primeAudioContext();
      expect(mediaStream.context.close).not.toHaveBeenCalled();

      publisher.state.set('live');
      publisher.closePrimedAudioContext();
      expect(mediaStream.context.close).not.toHaveBeenCalled();

      publisher.state.set('idle');
      publisher.closePrimedAudioContext();
      expect(mediaStream.context.close).toHaveBeenCalled();
    } finally {
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
