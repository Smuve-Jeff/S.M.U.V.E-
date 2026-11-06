import { detectTempo, detectTempoFromBuffer } from "./tempo-detect.util";

const SAMPLE_RATE = 44100;

/** A decaying ping every beat: the simplest thing a loop can be. */
function clickTrain(bpm: number, seconds = 10, sampleRate = SAMPLE_RATE): Float32Array {
  const data = new Float32Array(Math.floor(sampleRate * seconds));
  const period = 60 / bpm;
  for (let beat = 0; beat * period < seconds; beat++) {
    const start = Math.floor(beat * period * sampleRate);
    for (let i = 0; i < 260 && start + i < data.length; i++) {
      const envelope = Math.exp(-i / 45);
      data[start + i] += 0.7 * envelope * Math.sin((2 * Math.PI * 880 * i) / sampleRate);
    }
  }
  return data;
}

function noisy(samples: Float32Array, amount: number): Float32Array {
  const out = new Float32Array(samples.length);
  let seed = 1234567;
  for (let i = 0; i < samples.length; i++) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    const noise = (seed / 0x7fffffff) * 2 - 1;
    out[i] = samples[i] + noise * amount;
  }
  return out;
}

/** A kick/snare/hat pattern, not a metronome: real loops overlap their hits. */
function drumLoop(bpm: number, bars = 5, sampleRate = SAMPLE_RATE): Float32Array {
  const step = 60 / bpm / 4;
  const data = new Float32Array(Math.floor(bars * 16 * step * sampleRate));
  let seed = 987654321;
  const noise = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return (seed / 0x7fffffff) * 2 - 1;
  };
  const place = (stepIndex: number, seconds: number, shape: (i: number) => number) => {
    const start = Math.floor(stepIndex * step * sampleRate);
    const count = Math.floor(seconds * sampleRate);
    for (let i = 0; i < count; i++) {
      const index = start + i;
      if (index < 0 || index >= data.length) break;
      data[index] += shape(i);
    }
  };
  for (let bar = 0; bar < bars; bar++) {
    const base = bar * 16;
    for (const offset of [0, 6, 10]) {
      place(base + offset, 0.16, (i) =>
        0.9 * Math.exp(-i / (0.07 * sampleRate)) * Math.sin((2 * Math.PI * 58 * i) / sampleRate),
      );
    }
    for (const offset of [4, 12]) {
      place(base + offset, 0.11, (i) =>
        (0.4 * noise() + 0.35 * Math.sin((2 * Math.PI * 190 * i) / sampleRate)) *
        Math.exp(-i / (0.045 * sampleRate)),
      );
    }
    for (let offset = 0; offset < 16; offset += 2) {
      const accent = offset % 4 === 0 ? 0.3 : 0.18;
      place(base + offset, 0.035, (i) =>
        accent * noise() * Math.exp(-i / (0.008 * sampleRate)),
      );
    }
  }
  return data;
}

function bufferOf(samples: Float32Array, sampleRate = SAMPLE_RATE): AudioBuffer {
  return {
    length: samples.length,
    sampleRate,
    numberOfChannels: 1,
    duration: samples.length / sampleRate,
    getChannelData: () => samples,
  } as unknown as AudioBuffer;
}

describe("detectTempo", () => {
  it("finds the tempo of a steady pulse", () => {
    for (const bpm of [90, 128, 140]) {
      const result = detectTempo(clickTrain(bpm), SAMPLE_RATE);
      expect(result).not.toBeNull();
      expect(Math.abs(result!.bpm - bpm)).toBeLessThanOrEqual(1);
      expect(result!.confidence).toBeGreaterThan(0.5);
    }
  });

  it("reports the pulse, not its double", () => {
    const result = detectTempo(clickTrain(90), SAMPLE_RATE);
    expect(Math.abs(result!.bpm - 180)).toBeGreaterThan(20);
    expect(Math.abs(result!.bpm - 90)).toBeLessThanOrEqual(1);
  });

  it("reports the pulse, not its half", () => {
    const result = detectTempo(clickTrain(168), SAMPLE_RATE);
    expect(Math.abs(result!.bpm - 84)).toBeGreaterThan(20);
    expect(Math.abs(result!.bpm - 168)).toBeLessThanOrEqual(1);
  });

  it("still finds the pulse under broadband noise", () => {
    const result = detectTempo(noisy(clickTrain(120), 0.05), SAMPLE_RATE);
    expect(result).not.toBeNull();
    expect(Math.abs(result!.bpm - 120)).toBeLessThanOrEqual(2);
  });

  it("returns null for silence rather than guessing", () => {
    expect(detectTempo(new Float32Array(SAMPLE_RATE * 4), SAMPLE_RATE)).toBeNull();
  });

  it("returns null when there is not enough audio", () => {
    expect(detectTempo(new Float32Array(512), SAMPLE_RATE)).toBeNull();
  });

  it("returns null for unusable input", () => {
    expect(detectTempo(null, SAMPLE_RATE)).toBeNull();
    expect(detectTempo(new Float32Array(SAMPLE_RATE), 0)).toBeNull();
  });

  it("honours the requested tempo range", () => {
    const result = detectTempo(clickTrain(128), SAMPLE_RATE, { minBpm: 60, maxBpm: 80 });
    // 128 cannot be represented; the nearest grid inside the range wins.
    expect(result).not.toBeNull();
    expect(result!.bpm).toBeGreaterThanOrEqual(60);
    expect(result!.bpm).toBeLessThanOrEqual(80);
  });

  it("finds the tempo of a kick-snare pattern with eighth-note hats", () => {
    const result = detectTempo(drumLoop(96), SAMPLE_RATE);
    expect(result).not.toBeNull();
    // Eighth-note hats make 96 and 192 literally the same grid, so either
    // reading is honest; anything else means the pattern did not register.
    expect([96, 192].some((bpm) => Math.abs(result!.bpm - bpm) <= 1)).toBe(true);
    expect(result!.confidence).toBeGreaterThan(0.5);
  });

  it("keeps a busy pattern at its own tempo", () => {
    const result = detectTempo(drumLoop(140), SAMPLE_RATE);
    expect(result).not.toBeNull();
    expect(Math.abs(result!.bpm - 140)).toBeLessThanOrEqual(1);
  });

  it("analyses a buffer through its first channel", () => {
    const result = detectTempoFromBuffer(bufferOf(clickTrain(120)));
    expect(result).not.toBeNull();
    expect(Math.abs(result!.bpm - 120)).toBeLessThanOrEqual(1);
    expect(detectTempoFromBuffer(null)).toBeNull();
  });
});
