import {
  detectPitch,
  frequencyToMidi,
  transcribeMonophonic,
} from "./audio-to-midi.util";

function sineBuffer(
  frequency: number,
  seconds: number,
  sampleRate = 48000,
): AudioBuffer {
  const length = Math.round(seconds * sampleRate);
  const data = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    data[i] = Math.sin((2 * Math.PI * frequency * i) / sampleRate) * 0.4;
  }
  return {
    numberOfChannels: 1,
    length,
    sampleRate,
    duration: seconds,
    getChannelData: () => data,
  } as unknown as AudioBuffer;
}

describe("audio-to-midi", () => {
  it("maps concert A to MIDI 69", () => {
    expect(frequencyToMidi(440)).toBe(69);
    expect(frequencyToMidi(220)).toBe(57);
  });

  it("detects a 440 Hz frame and rejects silence", () => {
    const frame = new Float32Array(2048);
    for (let i = 0; i < frame.length; i++) {
      frame[i] = Math.sin((2 * Math.PI * 440 * i) / 48000) * 0.4;
    }
    const detected = detectPitch(frame, 48000);
    expect(detected).not.toBeNull();
    expect(frequencyToMidi(detected!)).toBe(69);

    expect(detectPitch(new Float32Array(2048), 48000)).toBeNull();
  });

  it("transcribes a held sine into one note with a real duration", () => {
    const notes = transcribeMonophonic(sineBuffer(440, 0.6));
    expect(notes.length).toBe(1);
    expect(notes[0].midi).toBe(69);
    expect(notes[0].durationSec).toBeGreaterThan(0.4);
    expect(notes[0].startSec).toBeLessThan(0.1);
    expect(notes[0].velocity).toBeGreaterThan(0);
  });

  it("segments two different pitches into two notes", () => {
    const sampleRate = 48000;
    const a = sineBuffer(440, 0.35, sampleRate);
    const b = sineBuffer(523.25, 0.35, sampleRate);
    const aData = a.getChannelData(0);
    const bData = b.getChannelData(0);
    const joined = new Float32Array(aData.length + bData.length);
    joined.set(aData, 0);
    joined.set(bData, aData.length);
    const buffer = {
      numberOfChannels: 1,
      length: joined.length,
      sampleRate,
      duration: joined.length / sampleRate,
      getChannelData: () => joined,
    } as unknown as AudioBuffer;

    const notes = transcribeMonophonic(buffer);
    expect(notes.length).toBe(2);
    expect(notes[0].midi).toBe(69);
    expect(notes[1].midi).toBe(72);
  });

  it("returns no notes for silence", () => {
    const buffer = {
      numberOfChannels: 1,
      length: 48000,
      sampleRate: 48000,
      duration: 1,
      getChannelData: () => new Float32Array(48000),
    } as unknown as AudioBuffer;
    expect(transcribeMonophonic(buffer)).toEqual([]);
  });
});
