import {
  DEFAULT_TUNER_TOLERANCE_CENTS,
  centsToNeedle,
  frequencyToNote,
  midiToFrequency,
} from "./tuner-pitch.util";

describe("tuner pitch maths", () => {
  it("names concert A exactly", () => {
    const reading = frequencyToNote(440);
    expect(reading).toEqual({
      frequency: 440,
      midi: 69,
      note: "A",
      octave: 4,
      cents: expect.closeTo(0, 5),
      inTune: true,
    });
  });

  it("reports a flat A as cents, not as a different note", () => {
    // A4 −32 cents is a common "tune up" state for a guitar.
    const reading = frequencyToNote(432)!;
    expect(reading.note).toBe("A");
    expect(reading.octave).toBe(4);
    expect(reading.cents).toBeLessThan(-25);
    expect(reading.cents).toBeGreaterThan(-40);
    expect(reading.inTune).toBe(false);
  });

  it("crosses the octave boundary correctly", () => {
    expect(frequencyToNote(midiToFrequency(60))).toMatchObject({
      note: "C",
      octave: 4,
      midi: 60,
    });
    expect(frequencyToNote(midiToFrequency(41))).toMatchObject({
      note: "F",
      octave: 2,
      midi: 41,
    });
    // A quarter tone below C4 is nearer B3 than C4.
    expect(
      frequencyToNote(midiToFrequency(60) * Math.pow(2, -60 / 1200)),
    ).toMatchObject({
      note: "B",
      octave: 3,
    });
  });

  it("rounds to the nearest semitone and clamps the needle", () => {
    const reading = frequencyToNote(466.16)!; // A#4
    expect(reading.note).toBe("A#");
    expect(Math.abs(reading.cents)).toBeLessThan(1);
    expect(reading.cents).toBeGreaterThanOrEqual(-50);
    expect(reading.cents).toBeLessThanOrEqual(50);
  });

  it("honours an alternative concert pitch and tolerance", () => {
    // Concert pitch moved, so the same 415 Hz is now an in-tune A rather than
    // a flat G#.
    const baroque = frequencyToNote(415, { a4: 415 });
    expect(baroque).toMatchObject({ note: "A", octave: 4, inTune: true });

    const strict = frequencyToNote(440 * Math.pow(2, 8 / 1200), {
      toleranceCents: 5,
    });
    expect(strict!.inTune).toBe(false);
    expect(
      frequencyToNote(440 * Math.pow(2, 8 / 1200), { toleranceCents: 10 })!
        .inTune,
    ).toBe(true);
  });

  it("rejects values that cannot name a note", () => {
    expect(frequencyToNote(0)).toBeNull();
    expect(frequencyToNote(-440)).toBeNull();
    expect(frequencyToNote(Number.NaN)).toBeNull();
    expect(frequencyToNote(Number.POSITIVE_INFINITY)).toBeNull();
    expect(frequencyToNote(0.01)).toBeNull(); // below MIDI 0
  });

  it("maps cents onto the meter", () => {
    expect(centsToNeedle(0)).toBe(50);
    expect(centsToNeedle(-50)).toBe(0);
    expect(centsToNeedle(50)).toBe(100);
    expect(centsToNeedle(25)).toBe(75);
    expect(centsToNeedle(500)).toBe(100);
    expect(centsToNeedle(Number.NaN)).toBe(50);
    expect(DEFAULT_TUNER_TOLERANCE_CENTS).toBe(5);
  });
});
