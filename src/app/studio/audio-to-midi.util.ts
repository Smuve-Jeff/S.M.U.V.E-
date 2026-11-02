/**
 * Monophonic audio-to-MIDI.
 *
 * A pragmatic transcription for a single voice or hummed line: autocorrelation
 * per frame, a clarity gate, median smoothing, then note segmentation. It is
 * deliberately not a polyphonic transcriber — chords and drums need a spectral
 * model, and pretending otherwise would produce worse notes than no notes.
 */

export interface TranscribedNote {
  /** MIDI note number (rounded to the nearest semitone). */
  midi: number;
  /** Start in seconds from the beginning of the buffer. */
  startSec: number;
  /** Duration in seconds. */
  durationSec: number;
  /** 0..1, from the frame's RMS relative to the loudest frame. */
  velocity: number;
}

export interface TranscribeOptions {
  /** Lowest MIDI note accepted (default C1 = 24). */
  minMidi?: number;
  /** Highest MIDI note accepted (default C7 = 96). */
  maxMidi?: number;
  /** Normalised autocorrelation threshold (default 0.55). */
  clarityThreshold?: number;
  /** RMS below this is silence (default 0.005). */
  silenceThreshold?: number;
}

const DEFAULT_OPTIONS: Required<TranscribeOptions> = {
  minMidi: 24,
  maxMidi: 96,
  clarityThreshold: 0.55,
  silenceThreshold: 0.005,
};

/** Autocorrelation pitch for one frame; null when the frame is unvoiced. */
export function detectPitch(
  frame: Float32Array,
  sampleRate: number,
  options: TranscribeOptions = {},
): number | null {
  const { clarityThreshold, silenceThreshold } = {
    ...DEFAULT_OPTIONS,
    ...options,
  };
  if (!frame.length || sampleRate <= 0) return null;

  // Remove DC and measure level first: autocorrelation on silence is noise.
  let mean = 0;
  for (let i = 0; i < frame.length; i++) mean += frame[i];
  mean /= frame.length;

  let energy = 0;
  const centred = new Float32Array(frame.length);
  for (let i = 0; i < frame.length; i++) {
    centred[i] = frame[i] - mean;
    energy += centred[i] * centred[i];
  }
  const rms = Math.sqrt(energy / frame.length);
  if (rms < silenceThreshold) return null;

  const minLag = Math.max(2, Math.floor(sampleRate / 1200));
  const maxLag = Math.min(
    frame.length - 1,
    Math.floor(sampleRate / 55),
  );
  if (maxLag <= minLag) return null;

  const correlations = new Float32Array(maxLag + 2);
  let bestLag = -1;
  let bestCorrelation = 0;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let correlation = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i + lag < centred.length; i++) {
      correlation += centred[i] * centred[i + lag];
      normA += centred[i] * centred[i];
      normB += centred[i + lag] * centred[i + lag];
    }
    const denominator = Math.sqrt(normA * normB);
    const normalised = denominator > 0 ? correlation / denominator : 0;
    correlations[lag] = normalised;
    if (normalised > bestCorrelation) {
      bestCorrelation = normalised;
      bestLag = lag;
    }
  }

  if (bestLag < 0 || bestCorrelation < clarityThreshold) return null;

  // Pick the FIRST local peak that is nearly as strong as the global one.
  // A periodic signal correlates just as well at 2×, 3× and 4× the true lag,
  // and taking the global maximum reports the pitch an octave or two low.
  const nearBest = bestCorrelation * 0.9;
  for (let lag = minLag; lag <= bestLag; lag++) {
    const value = correlations[lag];
    if (
      value >= nearBest &&
      value >= correlations[lag - 1] &&
      value >= correlations[lag + 1]
    ) {
      bestLag = lag;
      bestCorrelation = value;
      break;
    }
  }
  const frequency = sampleRate / bestLag;
  if (!Number.isFinite(frequency) || frequency < 55 || frequency > 1200) {
    return null;
  }
  return frequency;
}

/** Frequency in Hz → nearest MIDI note. */
export function frequencyToMidi(frequency: number): number {
  return Math.round(69 + 12 * Math.log2(frequency / 440));
}

/**
 * Transcribe a monophonic AudioBuffer into notes.
 *
 * Analysis runs at roughly 12 kHz (a box-filtered decimation of the source),
 * which keeps the autocorrelation cost bounded on a phone. The frame hop is
 * 10 ms at that rate, responsive enough for vocals without inventing a note
 * for every consonant. Segments shorter than three frames are discarded as
 * breath noise.
 */
export function transcribeMonophonic(
  buffer: AudioBuffer,
  options: TranscribeOptions = {},
): TranscribedNote[] {
  if (!buffer || buffer.length === 0) return [];
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const sourceRate = buffer.sampleRate;
  const source = buffer.getChannelData(0);

  // Pitch information sits below 1.2 kHz, so analysing at ~12 kHz loses no
  // note while cutting the lag search by 4× versus a 48 kHz frame.
  const decimation = Math.max(1, Math.round(sourceRate / 12_000));
  const sampleRate = sourceRate / decimation;
  let data = source;
  if (decimation > 1) {
    const downsampled = new Float32Array(Math.floor(source.length / decimation));
    for (let i = 0; i < downsampled.length; i++) {
      const base = i * decimation;
      let sum = 0;
      for (let j = 0; j < decimation; j++) sum += source[base + j];
      downsampled[i] = sum / decimation;
    }
    data = downsampled;
  }

  const frameSize = Math.max(256, Math.round(sampleRate * 0.043));
  const hop = Math.max(32, Math.round(sampleRate * 0.01));
  const frames: Array<{ midi: number; rms: number } | null> = [];

  let peakRms = 0;
  for (let start = 0; start + frameSize <= data.length; start += hop) {
    const frame = data.subarray(start, start + frameSize);
    let sum = 0;
    for (let i = 0; i < frame.length; i++) sum += frame[i] * frame[i];
    const rms = Math.sqrt(sum / frame.length);
    if (rms > peakRms) peakRms = rms;
    const frequency = detectPitch(frame, sampleRate, opts);
    if (frequency === null) {
      frames.push(null);
      continue;
    }
    const midi = frequencyToMidi(frequency);
    frames.push(
      midi >= opts.minMidi && midi <= opts.maxMidi ? { midi, rms } : null,
    );
  }

  // Median smoothing over five frames removes single-frame octave jumps.
  const smoothed = frames.map((frame, index) => {
    if (!frame) return null;
    const window = frames
      .slice(Math.max(0, index - 2), Math.min(frames.length, index + 3))
      .filter((candidate): candidate is { midi: number; rms: number } =>
        !!candidate,
      )
      .map((candidate) => candidate.midi)
      .sort((a, b) => a - b);
    return { midi: window[Math.floor(window.length / 2)], rms: frame.rms };
  });

  const notes: TranscribedNote[] = [];
  let current: { midi: number; startFrame: number; rms: number } | null = null;

  const flush = (endFrame: number) => {
    if (!current) return;
    const frameCount = endFrame - current.startFrame;
    if (frameCount >= 3) {
      notes.push({
        midi: current.midi,
        startSec: (current.startFrame * hop) / sampleRate,
        durationSec: (frameCount * hop) / sampleRate,
        velocity:
          peakRms > 0
            ? Math.max(0.15, Math.min(1, current.rms / peakRms))
            : 0.6,
      });
    }
    current = null;
  };

  smoothed.forEach((frame, index) => {
    if (!frame) {
      flush(index);
      return;
    }
    if (current && frame.midi === current.midi) {
      current.rms = Math.max(current.rms, frame.rms);
      return;
    }
    flush(index);
    current = { midi: frame.midi, startFrame: index, rms: frame.rms };
  });
  flush(smoothed.length);

  // A pitch transition can leave one or two frames at an in-between pitch.
  // Drop only short notes sandwiched between two different pitches; a real
  // grace note at the start or end of a phrase is preserved.
  return notes.filter((note, index) => {
    if (index === 0 || index === notes.length - 1) return true;
    const betweenDifferent =
      notes[index - 1].midi !== note.midi &&
      notes[index + 1].midi !== note.midi;
    return !(betweenDifferent && note.durationSec < 0.12);
  });
}
