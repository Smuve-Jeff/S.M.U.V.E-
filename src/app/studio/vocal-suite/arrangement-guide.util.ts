/**
 * Turn the audio clips of one arrangement track into a single guide buffer.
 *
 * A track can hold more than one clip, and clips carry a bar start plus the
 * slice of the source they read (`clipOriginSeconds` / `clipLengthSeconds`).
 * Using only the first clip's buffer — or ignoring the starts — put the beat at
 * the wrong place under the vocal. This lays every clip at its own bar into one
 * buffer with silence in the gaps, so the guide the artist sings against matches
 * what the song plays.
 */

export interface GuideClipSource {
  /** Clip start on the arrangement, in bars. */
  startBar: number;
  /** Seconds into the source buffer the clip begins reading. */
  originSeconds: number;
  /** Seconds the clip plays; null/absent means "to the end of the source". */
  lengthSeconds: number | null;
  buffer: AudioBuffer;
}

export interface GuideBuildOptions {
  /** Length of a bar in seconds at the project tempo. */
  secondsPerBar: number;
  createBuffer: (
    channels: number,
    length: number,
    sampleRate: number,
  ) => AudioBuffer;
}

interface PlacedClip {
  clip: GuideClipSource;
  origin: number;
  length: number;
  startSeconds: number;
}

export function buildArrangementGuide(
  clips: GuideClipSource[],
  options: GuideBuildOptions,
): AudioBuffer | null {
  const secondsPerBar =
    Number.isFinite(options.secondsPerBar) && options.secondsPerBar > 0
      ? options.secondsPerBar
      : 2;
  const usable = clips.filter(
    (clip) =>
      clip?.buffer &&
      clip.buffer.length > 0 &&
      Number.isFinite(clip.startBar) &&
      clip.startBar >= 0,
  );
  if (usable.length === 0) return null;

  const placed: PlacedClip[] = usable.map((clip) => {
    const duration = clip.buffer.duration;
    const origin = Math.max(0, Math.min(duration, clip.originSeconds || 0));
    const available = Math.max(0, duration - origin);
    const length =
      typeof clip.lengthSeconds === 'number' && clip.lengthSeconds > 0
        ? Math.min(clip.lengthSeconds, available)
        : available;
    return {
      clip,
      origin,
      length,
      startSeconds: clip.startBar * secondsPerBar,
    };
  });

  // One whole clip starting the song needs no copy at all: it is already the
  // guide, and copying a full take on every picker render would be wasteful.
  if (
    placed.length === 1 &&
    placed[0].startSeconds === 0 &&
    placed[0].origin === 0 &&
    placed[0].length >= placed[0].clip.buffer.duration
  ) {
    return placed[0].clip.buffer;
  }

  const sampleRate = placed[0].clip.buffer.sampleRate;
  const channels = Math.max(
    ...placed.map((entry) => entry.clip.buffer.numberOfChannels),
  );
  const totalSeconds = Math.max(
    ...placed.map((entry) => entry.startSeconds + entry.length),
  );
  const frames = Math.ceil(totalSeconds * sampleRate);
  if (!(frames > 0)) return null;

  const out = options.createBuffer(channels, frames, sampleRate);
  for (const entry of placed) {
    const destinationStart = Math.round(entry.startSeconds * sampleRate);
    const sourceStart = Math.round(entry.origin * sampleRate);
    const requested = Math.round(entry.length * sampleRate);
    if (requested <= 0 || destinationStart >= frames) continue;
    const source = entry.clip.buffer;
    for (let channel = 0; channel < channels; channel++) {
      const data = source.getChannelData(
        Math.min(channel, source.numberOfChannels - 1),
      );
      const destination = out.getChannelData(channel);
      const count = Math.min(
        requested,
        destination.length - destinationStart,
        data.length - sourceStart,
      );
      if (count <= 0) continue;
      destination.set(
        data.subarray(sourceStart, sourceStart + count),
        destinationStart,
      );
    }
  }
  return out;
}
