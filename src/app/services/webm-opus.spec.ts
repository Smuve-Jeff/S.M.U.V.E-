import { extractWebmOpus } from './webm-opus';

const ID = {
  segment: [0x18, 0x53, 0x80, 0x67],
  info: [0x15, 0x49, 0xa9, 0x66],
  timecodeScale: [0x2a, 0xd7, 0xb1],
  tracks: [0x16, 0x54, 0xae, 0x6b],
  trackEntry: [0xae],
  trackNumber: [0xd7],
  trackType: [0x83],
  codecId: [0x86],
  audio: [0xe1],
  samplingFrequency: [0xb5],
  channels: [0x9f],
  cluster: [0x1f, 0x43, 0xb6, 0x75],
  clusterTimecode: [0xe7],
  simpleBlock: [0xa3],
};

const uintBytes = (value: number): number[] => {
  const bytes: number[] = [];
  let remaining = value;
  do {
    bytes.unshift(remaining & 0xff);
    remaining = Math.floor(remaining / 256);
  } while (remaining > 0);
  return bytes;
};

const element = (id: number[], payload: number[]): number[] => {
  if (payload.length >= 0x80) throw new Error('test fixture too large');
  return [...id, 0x80 | payload.length, ...payload];
};

const unknownElement = (id: number[], payload: number[]): number[] => [
  ...id,
  0x01,
  0xff,
  0xff,
  0xff,
  0xff,
  0xff,
  0xff,
  0xff,
  ...payload,
];

const stringElement = (id: number[], value: string): number[] =>
  element(id, [...new TextEncoder().encode(value)]);

const floatElement = (id: number[], value: number): number[] => {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setFloat32(0, value);
  return element(id, [...bytes]);
};

const simpleBlock = (
  track: number,
  relativeMs: number,
  flags: number,
  data: number[],
): number[] => {
  const time = new Uint8Array(2);
  new DataView(time.buffer).setInt16(0, relativeMs);
  return element(ID.simpleBlock, [
    0x80 | track,
    ...time,
    flags,
    ...data,
  ]);
};

function audioWebm(options: { laced?: boolean; unknownSize?: boolean } = {}): ArrayBuffer {
  const track = element(ID.trackEntry, [
    ...element(ID.trackNumber, uintBytes(1)),
    ...element(ID.trackType, uintBytes(2)),
    ...stringElement(ID.codecId, 'A_OPUS'),
    ...element(ID.audio, [
      ...floatElement(ID.samplingFrequency, 48000),
      ...element(ID.channels, uintBytes(2)),
    ]),
  ]);
  const clusterBuilder = options.unknownSize ? unknownElement : element;
  const cluster = clusterBuilder(ID.cluster, [
    ...element(ID.clusterTimecode, uintBytes(100)),
    ...simpleBlock(1, 0, options.laced ? 0x82 : 0x80, [1, 2, 3]),
    ...simpleBlock(1, 20, 0x80, [4, 5, 6]),
  ]);
  const segmentBuilder = options.unknownSize ? unknownElement : element;
  const segment = segmentBuilder(ID.segment, [
    ...element(ID.info, [
      ...element(ID.timecodeScale, uintBytes(1_000_000)),
    ]),
    ...element(ID.tracks, track),
    ...cluster,
  ]);
  return new Uint8Array(segment).buffer;
}

describe('extractWebmOpus', () => {
  it('reads the audio format and strips the block headers from every packet', () => {
    const audio = extractWebmOpus(audioWebm());

    expect(audio).not.toBeNull();
    expect(audio!.codecId).toBe('A_OPUS');
    expect(audio!.sampleRate).toBe(48000);
    expect(audio!.channels).toBe(2);
    expect(audio!.packets).toHaveLength(2);
    expect(audio!.packets[0].timestampUs).toBe(100_000);
    expect(audio!.packets[0].data).toEqual(new Uint8Array([1, 2, 3]));
    expect(audio!.packets[1].timestampUs).toBe(120_000);
    expect(audio!.packets[1].data).toEqual(new Uint8Array([4, 5, 6]));
  });

  it('reads the unknown-size Segment and Cluster MediaRecorder streams', () => {
    const audio = extractWebmOpus(audioWebm({ unknownSize: true }));

    expect(audio).not.toBeNull();
    expect(audio!.packets).toHaveLength(2);
    expect(audio!.packets[0].timestampUs).toBe(100_000);
  });

  it('refuses laced blocks rather than treating frames as one packet', () => {
    expect(extractWebmOpus(audioWebm({ laced: true }))).toBeNull();
  });

  it('returns null for bytes that are not a WebM audio track', () => {
    expect(extractWebmOpus(new Uint8Array([1, 2, 3, 4]).buffer)).toBeNull();
  });
});
