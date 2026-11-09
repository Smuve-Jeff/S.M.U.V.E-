/**
 * Onset (transient) detection for the cinema audio bed.
 *
 * The AI effect recipes can pulse on a tempo, but a real cut needs the hit on
 * the *actual* kick, snare or stab. This module reads a decoded `AudioBuffer`
 * once and returns the times it found, so the renderer can look up "the last
 * onset before this frame" instead of guessing from a BPM.
 *
 * The detector is deliberately lightweight and dependency-free:
 *
 *  - the signal is split into low / mid / high bands with one-pole filters;
 *  - per-frame band energy is measured and its positive change (spectral-flux
 *    style) is summed with a kick-weighted mix;
 *  - an adaptive local threshold picks peaks, a minimum spacing folds double
 *    triggers into one hit, and strengths are normalised to 0..1.
 *
 * It runs on import (not per frame), is deterministic for the same bytes, and
 * accepts any `AudioBuffer`-shaped value so it can be tested without a browser
 * audio context.
 */

export interface AudioBufferLike {
  sampleRate: number;
  length: number;
  numberOfChannels: number;
  duration?: number;
  getChannelData(channel: number): Float32Array;
}

export interface TransientHit {
  /** Seconds from the start of the bed. */
  time: number;
  /** 0..1 — relative loudness/attack of the onset. */
  strength: number;
}

export interface TransientMap {
  hits: TransientHit[];
  /** Bed length in seconds; the renderer wraps a looping bed by this. */
  duration: number;
  sampleRate: number;
}

export interface TransientOptions {
  /** Multiplier over the local mean; higher = fewer, stronger hits. */
  sensitivity?: number;
  /** Two peaks closer than this collapse into the stronger one. */
  minSpacingSeconds?: number;
  /** Hard cap so a dense mix cannot return an unbounded list. */
  maxHits?: number;
}

const DEFAULT_SENSITIVITY = 1.35;
const DEFAULT_MIN_SPACING_SECONDS = 0.075;
const DEFAULT_MAX_HITS = 4000;
/** Analysed band edges — a kick below, presence above. */
const LOW_CUTOFF_HZ = 180;
const HIGH_CUTOFF_HZ = 1800;
/** Frames shorter than this cannot resolve an attack. */
const MIN_FRAME_SECONDS = 0.004;
const MAX_FRAME_SECONDS = 0.02;

function emptyMap(sampleRate: number, duration: number): TransientMap {
  return { hits: [], duration: Math.max(0, duration), sampleRate };
}

function readDuration(buffer: AudioBufferLike, sampleRate: number): number {
  if (Number.isFinite(buffer.duration) && (buffer.duration as number) > 0) {
    return buffer.duration as number;
  }
  return sampleRate > 0 ? buffer.length / sampleRate : 0;
}

/**
 * Detect onsets in a decoded bed.
 *
 * Never throws: a buffer this host cannot read (a mocked record, an unusual
 * channel count) returns an empty map, and the renderer falls back to tempo.
 */
export function analyzeAudioTransients(
  buffer: AudioBufferLike,
  options: TransientOptions = {},
): TransientMap {
  try {
    const sampleRate = Math.max(1, Math.floor(Number(buffer.sampleRate) || 0));
    const length = Math.max(0, Math.floor(Number(buffer.length) || 0));
    const duration = readDuration(buffer, sampleRate);
    if (length < sampleRate * 0.05 || sampleRate <= 0) {
      return emptyMap(sampleRate, duration);
    }

    const channelCount = Math.max(
      1,
      Math.min(2, Math.floor(Number(buffer.numberOfChannels) || 1)),
    );
    const channels: Float32Array[] = [];
    for (let channel = 0; channel < channelCount; channel += 1) {
      const data = buffer.getChannelData(channel);
      if (!data || typeof data.length !== 'number') {
        return emptyMap(sampleRate, duration);
      }
      channels.push(data);
    }

    const frameSeconds = Math.max(
      MIN_FRAME_SECONDS,
      Math.min(MAX_FRAME_SECONDS, sampleRate > 0 ? 512 / sampleRate : 0.01),
    );
    const frameSize = Math.max(32, Math.round(frameSeconds * sampleRate));
    const hop = Math.max(16, Math.round(frameSize / 2));
    const frameCount = Math.ceil(length / hop);
    if (frameCount < 4) return emptyMap(sampleRate, duration);

    const lowAlpha = 1 - Math.exp((-2 * Math.PI * LOW_CUTOFF_HZ) / sampleRate);
    const highAlpha = 1 / (1 + (2 * Math.PI * HIGH_CUTOFF_HZ) / sampleRate);

    const low = new Float32Array(frameCount);
    const mid = new Float32Array(frameCount);
    const high = new Float32Array(frameCount);

    let lowState = 0;
    let highState = 0;
    let previousSample = 0;

    for (let frame = 0; frame < frameCount; frame += 1) {
      const start = frame * hop;
      const end = Math.min(length, start + frameSize);
      const count = Math.max(1, end - start);
      let lowEnergy = 0;
      let midEnergy = 0;
      let highEnergy = 0;

      for (let index = start; index < end; index += 1) {
        let sample = 0;
        for (let channel = 0; channel < channels.length; channel += 1) {
          sample += channels[channel][index] || 0;
        }
        sample /= channels.length;

        lowState += lowAlpha * (sample - lowState);
        highState = highAlpha * (highState + sample - previousSample);
        previousSample = sample;
        const midSample = sample - lowState - highState;

        lowEnergy += lowState * lowState;
        midEnergy += midSample * midSample;
        highEnergy += highState * highState;
      }

      low[frame] = Math.sqrt(lowEnergy / count);
      mid[frame] = Math.sqrt(midEnergy / count);
      high[frame] = Math.sqrt(highEnergy / count);
    }

    // Positive band change is the attack; sustained tone contributes nothing.
    const flux = new Float32Array(frameCount);
    for (let frame = 1; frame < frameCount; frame += 1) {
      flux[frame] =
        Math.max(0, low[frame] - low[frame - 1]) * 1.0 +
        Math.max(0, mid[frame] - mid[frame - 1]) * 0.7 +
        Math.max(0, high[frame] - high[frame - 1]) * 0.4;
    }

    // The loudest attack in the bed sets a floor: a slow fade-in ramps energy
    // from silence and would otherwise register as a hit the moment it clears
    // the numerical noise floor, even though nothing was struck.
    let peakFlux = 0;
    for (let frame = 0; frame < frameCount; frame += 1) {
      if (flux[frame] > peakFlux) peakFlux = flux[frame];
    }
    if (peakFlux <= 0) return emptyMap(sampleRate, duration);

    // Prefix sums make the adaptive local mean O(1) per frame.
    const prefix = new Float64Array(frameCount + 1);
    for (let frame = 0; frame < frameCount; frame += 1) {
      prefix[frame + 1] = prefix[frame] + flux[frame];
    }

    const sensitivity = Math.max(0.5, Number(options.sensitivity) || DEFAULT_SENSITIVITY);
    const windowFrames = Math.max(4, Math.round(0.12 / (hop / sampleRate)));
    const minSpacing = Math.max(
      0.02,
      Number(options.minSpacingSeconds) || DEFAULT_MIN_SPACING_SECONDS,
    );

    const candidates: TransientHit[] = [];
    let peak = 0;
    // Start at 1, not 2: a track that opens on a hit has its only attack in
    // the first hop, and it must not be skipped for want of a left neighbour.
    for (let frame = 1; frame < frameCount - 1; frame += 1) {
      const value = flux[frame];
      if (value <= flux[frame - 1] || value < flux[frame + 1]) continue;
      // An attack must add a meaningful share of the band energy in one hop.
      // A steady tone ripples by a few percent per frame, which would otherwise
      // clear a purely local threshold and read as a hit on every frame.
      const energy = low[frame] + mid[frame] + high[frame];
      if (value < peakFlux * 0.12) continue;
      if (energy <= 1e-6 || value / energy < 0.08) continue;
      const from = Math.max(0, frame - windowFrames);
      const to = Math.min(frameCount, frame + windowFrames + 1);
      const localMean = (prefix[to] - prefix[from]) / Math.max(1, to - from);
      if (value <= localMean * sensitivity + 1e-4) continue;
      candidates.push({ time: (frame * hop) / sampleRate, strength: value });
      if (value > peak) peak = value;
    }
    if (!candidates.length || peak <= 0) return emptyMap(sampleRate, duration);

    for (const candidate of candidates) {
      candidate.strength = Math.max(0, Math.min(1, candidate.strength / peak));
    }

    const spaced: TransientHit[] = [];
    for (const candidate of candidates) {
      const last = spaced[spaced.length - 1];
      if (last && candidate.time - last.time < minSpacing) {
        if (candidate.strength > last.strength) spaced[spaced.length - 1] = candidate;
        continue;
      }
      spaced.push(candidate);
    }

    const maxHits = Math.max(1, Math.floor(Number(options.maxHits) || DEFAULT_MAX_HITS));
    const hits =
      spaced.length > maxHits
        ? [...spaced]
            .sort((a, b) => b.strength - a.strength)
            .slice(0, maxHits)
            .sort((a, b) => a.time - b.time)
        : spaced;

    return { hits, duration, sampleRate };
  } catch {
    return emptyMap(0, 0);
  }
}
