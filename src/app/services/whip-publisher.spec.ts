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
    sender = { id: 'video', replaceTrack: jest.fn() };
    addTrack = jest.fn(() => this.sender);
    createOffer = jest.fn(async () => ({ type: 'offer', sdp: 'v=0' }));
    setLocalDescription = jest.fn(async () => undefined);
    setRemoteDescription = jest.fn(async () => undefined);
    close = jest.fn();
    addEventListener = jest.fn();
    removeEventListener = jest.fn();
    getTransceivers = jest.fn(() => [
      { sender: this.sender, setCodecPreferences: jest.fn() },
    ]);
  }

  const stream = {
    getVideoTracks: () => [{ kind: 'video' }],
    getAudioTracks: () => [],
  } as unknown as MediaStream;

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
});
