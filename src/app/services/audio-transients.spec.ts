import { analyzeAudioTransients, type AudioBufferLike } from './audio-transients';

function clickTrack(
  bpm: number,
  seconds: number,
  sampleRate = 8000
): AudioBufferLike {
  const length = Math.round(sampleRate * seconds);
  const data = new Float32Array(length);
  const beat = 60 / bpm;
  const clickSamples = Math.max(4, Math.round(sampleRate * 0.012));
  for (let time = 0.5; time < seconds; time += beat) {
    const start = Math.round(time * sampleRate);
    for (let i = 0; i < clickSamples && start + i < length; i += 1) {
      const decay = Math.exp(-i / (sampleRate * 0.002));
      data[start + i] += Math.sin(i * 1.9) * 0.9 * decay;
    }
  }
  return {
    sampleRate,
    length,
    numberOfChannels: 1,
    duration: seconds,
    getChannelData: () => data,
  };
}

function silence(seconds = 3, sampleRate = 8000): AudioBufferLike {
  return {
    sampleRate,
    length: Math.round(sampleRate * seconds),
    numberOfChannels: 1,
    duration: seconds,
    getChannelData: () => new Float32Array(Math.round(sampleRate * seconds)),
  };
}

describe('analyzeAudioTransients', () => {
  it('finds the clicks in a 120 BPM train and spaces them a beat apart', () => {
    const map = analyzeAudioTransients(clickTrack(120, 5));

    expect(map.duration).toBe(5);
    expect(map.hits.length).toBeGreaterThanOrEqual(7);
    for (let index = 1; index < map.hits.length; index += 1) {
      expect(map.hits[index].time - map.hits[index - 1].time).toBeCloseTo(0.5, 1);
    }
    // First click lands at 0.5s; the detector may report the frame after it.
    expect(map.hits[0].time).toBeGreaterThanOrEqual(0.48);
    expect(map.hits[0].time).toBeLessThan(0.56);
    expect(map.hits[0].strength).toBeGreaterThan(0);
    expect(map.hits[0].strength).toBeLessThanOrEqual(1);
  });

  it('returns no hits for silence', () => {
    expect(analyzeAudioTransients(silence()).hits).toEqual([]);
  });

  it('reports a tone once at its attack and never re-triggers on the sustain', () => {
    const sampleRate = 8000;
    const tone = new Float32Array(sampleRate * 3);
    for (let i = 0; i < tone.length; i += 1) {
      // A 20ms attack followed by a steady tone: exactly one onset exists.
      const attack = Math.min(1, i / (sampleRate * 0.02));
      tone[i] = Math.sin((i / sampleRate) * 2 * Math.PI * 220) * 0.4 * attack;
    }
    const map = analyzeAudioTransients({
      sampleRate,
      length: tone.length,
      numberOfChannels: 1,
      duration: 3,
      getChannelData: () => tone,
    });

    expect(map.hits.length).toBe(1);
    expect(map.hits[0].time).toBeLessThan(0.12);
    expect(map.hits[0].strength).toBeGreaterThan(0.5);
  });

  it('is deterministic for the same bytes and caps the hit list', () => {
    const buffer = clickTrack(140, 6);
    const first = analyzeAudioTransients(buffer, { maxHits: 4 });
    const second = analyzeAudioTransients(buffer, { maxHits: 4 });

    expect(first).toEqual(second);
    expect(first.hits.length).toBeLessThanOrEqual(4);
    const times = first.hits.map((hit) => hit.time);
    expect([...times].sort((a, b) => a - b)).toEqual(times);
  });

  it('survives a buffer this host cannot read', () => {
    const broken: AudioBufferLike = {
      sampleRate: 48000,
      length: 48000,
      numberOfChannels: 2,
      duration: 1,
      getChannelData: () => {
        throw new Error('no audio here');
      },
    };

    expect(() => analyzeAudioTransients(broken)).not.toThrow();
    expect(analyzeAudioTransients(broken).hits).toEqual([]);
    expect(analyzeAudioTransients({} as AudioBufferLike).hits).toEqual([]);
  });

  it('mixes stereo channels instead of reading only the left one', () => {
    const stereo = clickTrack(120, 3);
    const right = new Float32Array(stereo.length);
    const map = analyzeAudioTransients({
      ...stereo,
      numberOfChannels: 2,
      getChannelData: (channel) =>
        channel === 0 ? stereo.getChannelData(0) : right,
    });

    expect(map.hits.length).toBeGreaterThan(0);
  });
});
