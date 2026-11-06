/**
 * Tempo detection for imported audio.
 *
 * The import editor asked the artist to type the source tempo before it could
 * stretch a file to the project tempo, which made the match button useless to
 * anyone who did not already know the answer. This estimates it from the audio.
 *
 * Method: build an energy onset envelope, then score a beat grid at each
 * candidate tempo by two things — how much of the onset energy the grid
 * explains (coverage) and how many grid lines actually land on a hit (fill).
 * Coverage alone would call a 180 BPM pulse 90 BPM, because every 180 hit also
 * falls on a 90 grid; fill alone would call a 90 BPM pulse 180. Together they
 * prefer the period that hits everything without inventing empty beats.
 *
 * Grid positions are computed from the fractional period, so a 90 BPM loop does
 * not drift off the grid over a ten-second window the way an integer-lag
 * autocorrelation does.
 */

export interface TempoDetection {
  /** Estimated tempo, rounded to one decimal. */
  bpm: number;
  /** 0–1: coverage × fill for the winning grid. */
  confidence: number;
}

export interface TempoDetectOptions {
  minBpm?: number;
  maxBpm?: number;
  /** Only analyse the head of a long file; tempo is usually evident early. */
  windowSeconds?: number;
}

const HOP = 512;
const MIN_FRAMES = 24;
const BPM_STEP = 0.5;
const DEFAULT_MIN_BPM = 50;
const DEFAULT_MAX_BPM = 200;
const DEFAULT_WINDOW_SECONDS = 12;
/** Ties go to the tempo nearest this one: 8th hats must not read as 2x. */
const TEMPO_ANCHOR_BPM = 110;
/** How close a competing grid has to be before the anchor decides. */
const TEMPO_TIE = 0.97;

function bounded(value: number | undefined, fallback: number, min: number, max: number) {
  return Number.isFinite(value) ? Math.max(min, Math.min(max, value as number)) : fallback;
}

/**
 * Estimate the tempo of a percussive or clearly pulsed signal.
 *
 * Returns null when there is not enough audio, no onsets, or no candidate grid
 * inside `minBpm`–`maxBpm` — never a made-up number.
 */
export function detectTempo(
  samples: Float32Array | null | undefined,
  sampleRate: number,
  options: TempoDetectOptions = {},
): TempoDetection | null {
  if (!samples || samples.length === 0 || !(sampleRate > 0)) return null;

  const minBpm = bounded(options.minBpm, DEFAULT_MIN_BPM, 20, 300);
  const maxBpm = bounded(options.maxBpm, DEFAULT_MAX_BPM, minBpm + 1, 300);
  const windowSeconds = bounded(options.windowSeconds, DEFAULT_WINDOW_SECONDS, 2, 60);

  const usable = Math.min(samples.length, Math.floor(sampleRate * windowSeconds));
  const frames = Math.floor(usable / HOP);
  if (frames < MIN_FRAMES) return null;

  // Energy envelope: one RMS value per hop.
  const energy = new Float32Array(frames);
  for (let f = 0; f < frames; f++) {
    const start = f * HOP;
    let sum = 0;
    for (let i = start; i < start + HOP; i++) sum += samples[i] * samples[i];
    energy[f] = Math.sqrt(sum / HOP);
  }

  // Onsets are positive rises only; a decay is not a new hit.
  const onset = new Float32Array(frames);
  for (let f = 1; f < frames; f++) {
    const rise = energy[f] - energy[f - 1];
    if (rise > 0) onset[f] = rise;
  }

  // A three-frame smear gives the grid ±1 frame of tolerance.
  const smooth = new Float32Array(frames);
  let total = 0;
  for (let f = 0; f < frames; f++) {
    const prev = f > 0 ? onset[f - 1] : 0;
    const next = f < frames - 1 ? onset[f + 1] : 0;
    smooth[f] = 0.25 * prev + 0.5 * onset[f] + 0.25 * next;
    total += smooth[f];
  }
  if (total <= 1e-9) return null;

  const framesPerSecond = sampleRate / HOP;
  const hitFloor = (total / frames) * 0.5;

  let bestBpm = 0;
  let bestScore = 0;
  const candidates: { bpm: number; score: number }[] = [];

  for (let bpm = minBpm; bpm <= maxBpm + 1e-9; bpm += BPM_STEP) {
    const period = (60 * framesPerSecond) / bpm;
    if (period < 2 || period > frames - 1) continue;

    let bestCovered = 0;
    let bestFilled = 0;
    let bestSlots = 0;

    for (let phase = 0; phase < Math.round(period); phase++) {
      let covered = 0;
      let filled = 0;
      let slots = 0;
      for (let pos = phase; pos < frames - 1; pos += period) {
        const index = Math.round(pos);
        if (index < 0 || index >= frames) continue;
        // Coverage counts the raw hit and its neighbours, so the ±1 frame
        // smear is not charged against the grid; fill uses the smeared value
        // so a hit one frame early still counts as a filled slot.
        covered +=
          (index > 0 ? onset[index - 1] : 0) +
          onset[index] +
          (index < frames - 1 ? onset[index + 1] : 0);
        slots++;
        if (smooth[index] >= hitFloor) filled++;
      }
      if (slots === 0) continue;
      if (filled > bestFilled || (filled === bestFilled && covered > bestCovered)) {
        bestCovered = covered;
        bestFilled = filled;
        bestSlots = slots;
      }
    }

    if (bestSlots === 0) continue;
    const coverage = Math.min(1, bestCovered / total);
    const fill = bestFilled / bestSlots;
    const score = coverage * fill;
    if (score > 0) candidates.push({ bpm, score });
    if (score > bestScore) {
      bestScore = score;
      bestBpm = bpm;
    }
  }

  if (bestBpm === 0 || bestScore <= 0) return null;

  // A grid at twice the tempo explains the same hits when every subdivision is
  // played, so exact ties prefer the tempo closer to where music usually sits.
  let chosen = bestBpm;
  let chosenDistance = Number.POSITIVE_INFINITY;
  for (const candidate of candidates) {
    if (candidate.score < bestScore * TEMPO_TIE) continue;
    const distance = Math.abs(Math.log2(candidate.bpm / TEMPO_ANCHOR_BPM));
    if (distance < chosenDistance - 1e-9) {
      chosen = candidate.bpm;
      chosenDistance = distance;
    }
  }

  return {
    bpm: Math.round(chosen * 10) / 10,
    confidence: Math.max(0, Math.min(1, bestScore)),
  };
}

/** Convenience wrapper: analyse the first channel of a decoded buffer. */
export function detectTempoFromBuffer(
  buffer: AudioBuffer | null | undefined,
  options: TempoDetectOptions = {},
): TempoDetection | null {
  if (!buffer || buffer.length === 0) return null;
  return detectTempo(buffer.getChannelData(0), buffer.sampleRate, options);
}
