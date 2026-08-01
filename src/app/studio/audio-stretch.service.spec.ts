import { AudioStretchService } from './audio-stretch.service';

describe('AudioStretchService', () => {
  let service: AudioStretchService;

  /** 440 Hz sine test tone at the given sample rate. */
  function sine(samples: number, freq = 440, sampleRate = 44100): Float32Array {
    const out = new Float32Array(samples);
    for (let i = 0; i < samples; i++) {
      out[i] = Math.sin((2 * Math.PI * freq * i) / sampleRate);
    }
    return out;
  }

  /** Estimate dominant frequency via zero-crossing count. */
  function estimateFreq(buf: Float32Array, sampleRate = 44100): number {
    let crossings = 0;
    for (let i = 1; i < buf.length; i++) {
      if ((buf[i - 1] <= 0 && buf[i] > 0) || (buf[i - 1] >= 0 && buf[i] < 0)) {
        crossings++;
      }
    }
    const duration = buf.length / sampleRate;
    return crossings / 2 / duration;
  }

  beforeEach(() => {
    service = new AudioStretchService();
  });

  it('should create', () => {
    expect(service).toBeTruthy();
  });

  it('should double the length when slowing down by 2x', () => {
    const input = sine(44100); // 1s @ 440Hz
    const out = service.timeStretch(input, 2);
    expect(out.length).toBeGreaterThan(input.length * 1.85);
    expect(out.length).toBeLessThan(input.length * 2.15);
  });

  it('should halve the length when speeding up by 2x', () => {
    const input = sine(44100);
    const out = service.timeStretch(input, 0.5);
    expect(out.length).toBeGreaterThan(input.length * 0.4);
    expect(out.length).toBeLessThan(input.length * 0.6);
  });

  it('should preserve the frequency when time-stretching', () => {
    const input = sine(44100);
    const out = service.timeStretch(input, 1.5);
    const f = estimateFreq(out);
    // Stretch preserves pitch — should stay near 440 Hz (±12%)
    expect(f).toBeGreaterThan(440 * 0.88);
    expect(f).toBeLessThan(440 * 1.12);
  });

  it('should produce no NaN values for any ratio', () => {
    for (const ratio of [0.25, 0.5, 0.75, 1.0, 1.5, 2.0, 4.0]) {
      const out = service.timeStretch(sine(22050), ratio);
      for (const v of out) {
        expect(Number.isNaN(v)).toBe(false);
      }
    }
  });

  it('should double the frequency when pitch-shifting up 12 semitones', () => {
    const input = sine(44100);
    const out = service.pitchShift(input, 12);
    const f = estimateFreq(out);
    // +12 semitones = exactly 2x frequency (880 Hz), duration preserved
    expect(f).toBeGreaterThan(880 * 0.85);
    expect(f).toBeLessThan(880 * 1.15);
    expect(out.length).toBeGreaterThan(input.length * 0.8);
    expect(out.length).toBeLessThan(input.length * 1.2);
  });

  it('should halve the frequency when pitch-shifting down 12 semitones', () => {
    const input = sine(44100);
    const out = service.pitchShift(input, -12);
    const f = estimateFreq(out);
    expect(f).toBeGreaterThan(220 * 0.85);
    expect(f).toBeLessThan(220 * 1.15);
  });

  it('should keep duration constant across pitch shifts', () => {
    const input = sine(44100);
    for (const semis of [-7, -1, 0, 2, 5, 12]) {
      const out = service.pitchShift(input, semis);
      expect(out.length).toBeGreaterThan(input.length * 0.8);
      expect(out.length).toBeLessThan(input.length * 1.2);
    }
  });

  it('should lengthen when tempo-matching a faster source to a slower target', () => {
    const input = sine(44100);
    // 140 bpm source played at 70 bpm = 2x slower
    const out = service.tempoMatch(input, 140, 70);
    expect(out.length).toBeGreaterThan(input.length * 1.85);
    expect(out.length).toBeLessThan(input.length * 2.15);
  });

  it('should shorten when tempo-matching a slower source to a faster target', () => {
    const input = sine(44100);
    const out = service.tempoMatch(input, 60, 120);
    expect(out.length).toBeGreaterThan(input.length * 0.4);
    expect(out.length).toBeLessThan(input.length * 0.6);
  });

  it('should return a copy of the input for degenerate ratios', () => {
    const input = sine(1000);
    expect(service.timeStretch(input, 0).length).toBe(input.length);
    expect(service.timeStretch(input, NaN).length).toBe(input.length);
    expect(service.pitchShift(input, NaN).length).toBe(input.length);
    expect(service.tempoMatch(input, 0, 120).length).toBe(input.length);
    // Input never mutated
    expect(input[0]).toBeCloseTo(Math.sin(0), 10);
  });

  it('should return empty output for empty input', () => {
    const out = service.timeStretch(new Float32Array(0), 2);
    expect(out.length).toBe(0);
  });

  it('should resample shorter when factor > 1 and longer when factor < 1', () => {
    const input = sine(44100);
    expect(service.resample(input, 2).length).toBeLessThan(input.length);
    expect(service.resample(input, 0.5).length).toBeGreaterThan(input.length);
  });
});
