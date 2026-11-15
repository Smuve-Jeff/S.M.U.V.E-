/**
 * Content-aware clip trimming.
 *
 * Trimming a clip's left edge is not the same as sliding it right: for an audio
 * clip the audio must stay where it was sung, so moving the edge also moves the
 * read position (`offset`, or `clipOriginSeconds` for a streamed clip) by the
 * same amount of time. The old toolbar trim only changed `start`/`length`, which
 * dragged the audio content along with the edge — a vocal trimmed that way slid
 * off its backing track.
 *
 * All clip geometry is in bars; `offset` / `clipOriginSeconds` are in seconds.
 */

export type ClipTrimEdge = "start" | "end";

export interface ClipTrimInput {
  /** Clip kind; only audio clips carry trimmed audio content. */
  type?: string;
  start: number;
  length: number;
  /** Seconds into the decoded buffer (non-streamed audio clips). */
  offset?: number;
  /** Seconds into the streamed source (SampleStreamer clips). */
  clipOriginSeconds?: number;
  /** True when the clip plays through a SampleStreamer. */
  streamed?: boolean;
  /** Decoded length of the clip's audio, when known. */
  audioDurationSeconds?: number;
  /** Length of one bar in seconds. */
  secondsPerBar: number;
  /** Smallest allowed clip length in bars (default ¼ bar). */
  minLengthBars?: number;
}

export interface ClipTrimPatch {
  start: number;
  length: number;
  offset?: number;
  clipOriginSeconds?: number;
}

const DEFAULT_MIN_LENGTH_BARS = 0.25;
const EPSILON = 1e-6;

function positive(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : null;
}

function same(a: number, b: number): boolean {
  return Math.abs(a - b) < EPSILON;
}

/**
 * The patch that trims `deltaBars` off one edge of a clip, or null when the
 * gesture changes nothing.
 *
 * - MIDI clips keep their previous behaviour (geometry only).
 * - Audio clips move their read position with the left edge, so the audio keeps
 *   its place in time; extending past the start of the buffer is refused, and
 *   the right edge cannot run past the end of the known audio.
 */
export function trimClipContent(
  input: ClipTrimInput,
  edge: ClipTrimEdge,
  deltaBars: number,
): ClipTrimPatch | null {
  const minLength = positive(input.minLengthBars) ?? DEFAULT_MIN_LENGTH_BARS;
  const start = Number.isFinite(input.start) ? Math.max(0, input.start) : 0;
  const length = Math.max(minLength, Number.isFinite(input.length) ? input.length : 0);
  const delta = Number.isFinite(deltaBars) ? deltaBars : 0;
  const secondsPerBar = positive(input.secondsPerBar) ?? 2;

  if (input.type !== "audio") {
    if (edge === "start") {
      const nextStart = Math.max(0, start + delta);
      const shift = nextStart - start;
      const nextLength = Math.max(minLength, length - shift);
      if (same(nextStart, start) && same(nextLength, length)) return null;
      return { start: nextStart, length: nextLength };
    }
    const nextLength = Math.max(minLength, length + delta);
    if (same(nextLength, length)) return null;
    return { start, length: nextLength };
  }

  const streamed = input.streamed === true;
  const origin = Math.max(
    0,
    streamed ? (input.clipOriginSeconds ?? 0) : (input.offset ?? 0),
  );
  const audioDuration = positive(input.audioDurationSeconds);

  if (edge === "start") {
    // Content that exists before the read position: the left edge may only move
    // back this far, otherwise it would promise audio the buffer does not hold.
    const earliestShift = -Math.min(start, origin / secondsPerBar);
    const latestShift = length - minLength;
    const shift = Math.min(latestShift, Math.max(earliestShift, delta));
    const nextStart = Math.max(0, start + shift);
    const appliedShift = nextStart - start;
    let nextLength = Math.max(minLength, length - appliedShift);
    let nextOrigin = Math.max(0, origin + appliedShift * secondsPerBar);

    if (audioDuration !== null) {
      // Never stretch the clip past the audio that remains after its origin.
      const maxLength = (audioDuration - nextOrigin) / secondsPerBar;
      nextLength = Math.min(nextLength, Math.max(minLength, maxLength));
      nextOrigin = Math.min(nextOrigin, audioDuration);
    }

    if (
      same(nextStart, start) &&
      same(nextLength, length) &&
      same(nextOrigin, origin)
    ) {
      return null;
    }
    return {
      start: nextStart,
      length: nextLength,
      ...(streamed
        ? { clipOriginSeconds: nextOrigin }
        : { offset: nextOrigin }),
    };
  }

  let nextLength = Math.max(minLength, length + delta);
  if (audioDuration !== null) {
    const maxLength = (audioDuration - origin) / secondsPerBar;
    nextLength = Math.min(nextLength, Math.max(minLength, maxLength));
  }
  if (same(nextLength, length)) return null;
  return { start, length: nextLength };
}
