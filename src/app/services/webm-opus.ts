/**
 * Extract the Opus packets MediaRecorder already encoded inside an audio WebM.
 *
 * The frame-locked video is encoded by WebCodecs, which has no way to combine
 * a canvas stream with the Studio's Web Audio graph. MediaRecorder is used for
 * audio, then its already-encoded Opus blocks are read back out and added to
 * the same WebM muxer as the video. That keeps audio in the normal WebM
 * delivery without a second encode or an FFmpeg round-trip.
 *
 * Only the EBML subset MediaRecorder emits is handled. A file the parser does
 * not understand returns null; the caller can then fall back to FFmpeg rather
 * than shipping a malformed audio track.
 */
export interface WebmOpusPacket {
  data: Uint8Array;
  /** Presentation timestamp in microseconds, matching WebCodecs chunks. */
  timestampUs: number;
}

export interface WebmOpusAudio {
  codecId: string;
  sampleRate: number;
  channels: number;
  packets: WebmOpusPacket[];
}

const ID = {
  segment: 0x18538067,
  info: 0x1549a966,
  timecodeScale: 0x2ad7b1,
  tracks: 0x1654ae6b,
  trackEntry: 0xae,
  trackNumber: 0xd7,
  trackType: 0x83,
  codecId: 0x86,
  audio: 0xe1,
  samplingFrequency: 0xb5,
  channels: 0x9f,
  cluster: 0x1f43b675,
  clusterTimecode: 0xe7,
  simpleBlock: 0xa3,
  blockGroup: 0xa0,
  block: 0xa1,
} as const;

interface Element {
  id: number;
  dataStart: number;
  dataEnd: number;
}

function readVint(
  view: DataView,
  offset: number,
  isId = false,
): { value: number; length: number } {
  if (offset >= view.byteLength) throw new Error('EBML read past end');
  const first = view.getUint8(offset);
  let mask = 0x80;
  let length = 1;
  while (length <= 8 && (first & mask) === 0) {
    mask >>= 1;
    length += 1;
  }
  if (length > 8) throw new Error('Invalid EBML vint');
  let value = isId ? first : first & (mask - 1);
  for (let index = 1; index < length; index += 1) {
    value = value * 256 + view.getUint8(offset + index);
  }
  return { value, length };
}

function readElement(
  view: DataView,
  offset: number,
  parentEnd: number,
): Element {
  const id = readVint(view, offset, true);
  const size = readVint(view, offset + id.length);
  const dataStart = offset + id.length + size.length;
  // MediaRecorder streams Segment and its Cluster with the EBML "unknown
  // size" marker (all data bits set). Those elements run to the end of their
  // parent; a known-size reader rejects the file outright.
  const unknownSize = size.value === 2 ** (7 * size.length) - 1;
  const dataEnd = unknownSize ? parentEnd : dataStart + size.value;
  if (dataEnd > view.byteLength) throw new Error('EBML element overruns file');
  return { id: id.value, dataStart, dataEnd };
}

function children(view: DataView, start: number, end: number): Element[] {
  const out: Element[] = [];
  let offset = start;
  while (offset < end) {
    const item = readElement(view, offset, end);
    out.push(item);
    offset = item.dataEnd;
  }
  return out;
}

function uintAt(view: DataView, item: Element): number {
  let value = 0;
  for (let index = item.dataStart; index < item.dataEnd; index += 1) {
    value = value * 256 + view.getUint8(index);
  }
  return value;
}

function floatAt(view: DataView, item: Element): number {
  const length = item.dataEnd - item.dataStart;
  if (length === 4) return view.getFloat32(item.dataStart);
  if (length === 8) return view.getFloat64(item.dataStart);
  return 0;
}

function stringAt(view: DataView, item: Element): string {
  let out = '';
  for (let index = item.dataStart; index < item.dataEnd; index += 1) {
    out += String.fromCharCode(view.getUint8(index));
  }
  return out.replace(/\0+$/, '');
}

/** Split a simple block's payload after its track/timecode/flags header. */
function blockPayload(
  view: DataView,
  block: Element,
): { track: number; relative: number; flags: number; dataStart: number } {
  const track = readVint(view, block.dataStart);
  const relative = view.getInt16(block.dataStart + track.length);
  const flags = view.getUint8(block.dataStart + track.length + 2);
  return {
    track: track.value,
    relative,
    flags,
    dataStart: block.dataStart + track.length + 3,
  };
}

export function extractWebmOpus(buffer: ArrayBuffer): WebmOpusAudio | null {
  try {
    const view = new DataView(buffer);
    const segment = children(view, 0, view.byteLength).find(
      (item) => item.id === ID.segment,
    );
    if (!segment) return null;

    const segmentChildren = children(view, segment.dataStart, segment.dataEnd);
    let timecodeScale = 1_000_000;
    let audioTrack = -1;
    let codecId = '';
    let sampleRate = 48_000;
    let channels = 2;

    for (const item of segmentChildren) {
      if (item.id === ID.info) {
        const scale = children(view, item.dataStart, item.dataEnd).find(
          (child) => child.id === ID.timecodeScale,
        );
        if (scale) timecodeScale = uintAt(view, scale);
      }
      if (item.id === ID.tracks) {
        for (const entry of children(view, item.dataStart, item.dataEnd)) {
          if (entry.id !== ID.trackEntry) continue;
          const fields = children(view, entry.dataStart, entry.dataEnd);
          const number = fields.find((child) => child.id === ID.trackNumber);
          const type = fields.find((child) => child.id === ID.trackType);
          const codec = fields.find((child) => child.id === ID.codecId);
          const audio = fields.find((child) => child.id === ID.audio);
          if (!number || !type || uintAt(view, type) !== 2) continue;
          audioTrack = uintAt(view, number);
          codecId = codec ? stringAt(view, codec) : '';
          if (audio) {
            const audioFields = children(view, audio.dataStart, audio.dataEnd);
            const rate = audioFields.find(
              (child) => child.id === ID.samplingFrequency,
            );
            const channelCount = audioFields.find(
              (child) => child.id === ID.channels,
            );
            if (rate) sampleRate = Math.round(floatAt(view, rate)) || sampleRate;
            if (channelCount) channels = uintAt(view, channelCount) || channels;
          }
        }
      }
    }

    if (audioTrack < 0 || !/OPUS/i.test(codecId)) return null;

    const packets: WebmOpusPacket[] = [];
    for (const cluster of segmentChildren) {
      if (cluster.id !== ID.cluster) continue;
      const clusterFields = children(view, cluster.dataStart, cluster.dataEnd);
      const clusterTimecode = clusterFields.find(
        (child) => child.id === ID.clusterTimecode,
      );
      const clusterMs = clusterTimecode ? uintAt(view, clusterTimecode) : 0;
      for (const child of clusterFields) {
        const block =
          child.id === ID.simpleBlock
            ? child
            : child.id === ID.blockGroup
              ? children(view, child.dataStart, child.dataEnd).find(
                  (nested) => nested.id === ID.block,
                )
              : null;
        if (!block) continue;
        const payload = blockPayload(view, block);
        if (payload.track !== audioTrack) continue;
        // Laced blocks hold several packets in one frame. MediaRecorder's
        // Opus output is un-laced; refuse an unexpected layout instead of
        // feeding concatenated frames to the muxer as one packet.
        if ((payload.flags & 0x06) !== 0) return null;
        const data = new Uint8Array(
          buffer,
          payload.dataStart,
          block.dataEnd - payload.dataStart,
        );
        packets.push({
          data: data.slice(),
          timestampUs:
            ((clusterMs + payload.relative) * timecodeScale) / 1_000,
        });
      }
    }

    if (packets.length === 0) return null;
    packets.sort((a, b) => a.timestampUs - b.timestampUs);
    return { codecId, sampleRate, channels, packets };
  } catch {
    return null;
  }
}
