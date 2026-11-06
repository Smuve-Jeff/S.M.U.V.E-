import { separateIntoStems } from "./stem-separation.dsp";

const SAMPLE_RATE = 44100;
const AMPLITUDE = 0.5;

function tone(freq: number, seconds = 0.5, phase = 0): Float32Array {
  const data = new Float32Array(Math.round(SAMPLE_RATE * seconds));
  for (let i = 0; i < data.length; i++) {
    data[i] = AMPLITUDE * Math.sin((2 * Math.PI * freq * i) / SAMPLE_RATE + phase);
  }
  return data;
}

function energy(data: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
  return sum;
}

function ratio(part: Float32Array, total: Float32Array): number {
  const whole = energy(total);
  return whole === 0 ? 0 : energy(part) / whole;
}

function maxError(a: Float32Array, b: Float32Array): number {
  let worst = 0;
  for (let i = 0; i < a.length; i++) worst = Math.max(worst, Math.abs(a[i] - b[i]));
  return worst;
}

describe("separateIntoStems", () => {
  it("builds stems that add back up to the input", async () => {
    const left = tone(220);
    const right = tone(660, 0.5, 0.7);
    const stems = await separateIntoStems([left, right], SAMPLE_RATE);

    for (const [channel, mix] of [left, right].entries()) {
      const sum = new Float32Array(mix.length);
      for (const stem of [stems.vocals, stems.bass, stems.drums, stems.other]) {
        const part = stem[channel];
        for (let i = 0; i < sum.length; i++) sum[i] += part[i];
      }
      expect(maxError(sum, mix)).toBeLessThan(1e-5);
    }
  });

  it("keeps a low tone in bass and out of the vocals", async () => {
    const low = tone(100);
    const stems = await separateIntoStems([low, low], SAMPLE_RATE);

    expect(ratio(stems.bass[0], low)).toBeGreaterThan(0.8);
    expect(ratio(stems.vocals[0], low)).toBeLessThan(0.01);
  });

  it("keeps the top octave in drums and out of the vocals", async () => {
    const high = tone(8000);
    const stems = await separateIntoStems([high, high], SAMPLE_RATE);

    expect(ratio(stems.drums[0], high)).toBeGreaterThan(0.8);
    expect(ratio(stems.vocals[0], high)).toBeLessThan(0.01);
  });

  it("takes a centred mid-band tone out of the accompaniment", async () => {
    const centre = tone(1000);
    const stems = await separateIntoStems([centre, centre], SAMPLE_RATE);

    expect(ratio(stems.vocals[0], centre)).toBeGreaterThan(0.8);
    expect(ratio(stems.instrumental[0], centre)).toBeLessThan(0.05);
  });

  it("never turns side-only content into vocals", async () => {
    const left = tone(1000);
    const right = tone(1000, 0.5, Math.PI); // same tone, inverted = pure side
    const stems = await separateIntoStems([left, right], SAMPLE_RATE);

    expect(energy(stems.vocals[0]) / energy(left)).toBeLessThan(1e-6);
    // Side content belongs to the accompaniment, not to the centre band.
    expect(ratio(stems.instrumental[0], left)).toBeGreaterThan(0.9);
  });

  it("reports monotonic progress that finishes at 100", async () => {
    const updates: { stage: string; progress: number }[] = [];
    await separateIntoStems([tone(1000, 0.3)], SAMPLE_RATE, (update) => {
      updates.push({ stage: update.stage, progress: update.progress });
    });

    expect(updates.length).toBeGreaterThan(2);
    expect(updates.at(-1)!.progress).toBe(100);
    for (let i = 1; i < updates.length; i++) {
      expect(updates[i].progress).toBeGreaterThanOrEqual(updates[i - 1].progress);
    }
    expect(updates.some((update) => update.stage === "centre")).toBe(true);
    expect(updates.some((update) => update.stage === "bass")).toBe(true);
    expect(updates.some((update) => update.stage === "drums")).toBe(true);
  });

  it("handles mono input without inventing a second channel", async () => {
    const mono = tone(1000);
    const stems = await separateIntoStems([mono], SAMPLE_RATE);

    expect(stems.vocals.length).toBe(1);
    expect(ratio(stems.vocals[0], mono)).toBeGreaterThan(0.8);
  });
});
