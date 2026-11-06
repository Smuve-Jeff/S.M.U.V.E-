/**
 * Pitch → note maths for the tuner.
 *
 * Kept apart from the component so the two rules that decide whether an
 * instrument is in tune — the note the frequency lands on, and how far off it
 * is in cents — can be pinned without a microphone or an AudioContext.
 */

export const NOTE_NAMES = [
  "C",
  "C#",
  "D",
  "D#",
  "E",
  "F",
  "F#",
  "G",
  "G#",
  "A",
  "A#",
  "B",
] as const;

export interface TunerReading {
  /** Measured frequency in Hz. */
  frequency: number;
  /** Nearest equal-tempered MIDI note. */
  midi: number;
  /** Pitch class, e.g. "A". */
  note: string;
  /** Scientific octave, e.g. 4 for A4. */
  octave: number;
  /** Offset from the nearest semitone, −50…+50. */
  cents: number;
  /** True when |cents| is inside the tolerance. */
  inTune: boolean;
}

export interface TunerOptions {
  /** Concert pitch. Defaults to 440 Hz. */
  a4?: number;
  /** Cents either side of the note that still counts as in tune. */
  toleranceCents?: number;
}

export const DEFAULT_TUNER_TOLERANCE_CENTS = 5;

/** Equal-tempered frequency of a MIDI note. */
export function midiToFrequency(midi: number, a4 = 440): number {
  return a4 * Math.pow(2, (midi - 69) / 12);
}

/**
 * Nearest note for a measured frequency, or null when the value cannot name a
 * note at all (zero, negative, NaN, or outside the MIDI range).
 */
export function frequencyToNote(
  frequency: number,
  options: TunerOptions = {},
): TunerReading | null {
  const a4 = options.a4 ?? 440;
  const tolerance = options.toleranceCents ?? DEFAULT_TUNER_TOLERANCE_CENTS;
  if (!Number.isFinite(frequency) || frequency <= 0 || !(a4 > 0)) return null;

  const exactMidi = 69 + 12 * Math.log2(frequency / a4);
  if (!Number.isFinite(exactMidi)) return null;
  const midi = Math.round(exactMidi);
  if (midi < 0 || midi > 127) return null;

  const cents = 1200 * Math.log2(frequency / midiToFrequency(midi, a4));
  if (!Number.isFinite(cents)) return null;

  return {
    frequency,
    midi,
    note: NOTE_NAMES[((midi % 12) + 12) % 12],
    octave: Math.floor(midi / 12) - 1,
    cents: Math.max(-50, Math.min(50, cents)),
    inTune: Math.abs(cents) <= tolerance,
  };
}

/**
 * Cents → needle position as a percentage of the meter's width, where 50 is
 * centre. A tuner needle that clips at the edges is normal: ±50 is already a
 * quarter tone away, and anything past that is "wrong note", not "slightly
 * flat".
 */
export function centsToNeedle(cents: number): number {
  if (!Number.isFinite(cents)) return 50;
  return Math.max(0, Math.min(100, 50 + (cents / 50) * 50));
}
