import {
  buildMeasureXml,
  buildMusicXml,
  musicXmlBarCount,
  musicXmlFileName,
  pitchParts,
} from "./score-musicxml.util";

const durations = (xml: string) =>
  [...xml.matchAll(/<duration>(\d+)<\/duration>/g)].map((m) => Number(m[1]));

describe("score MusicXML export", () => {
  it("spells MIDI pitches as step/alter/octave with sharps", () => {
    expect(pitchParts(60)).toEqual({ step: "C", alter: 0, octave: 4 });
    expect(pitchParts(61)).toEqual({ step: "C", alter: 1, octave: 4 });
    expect(pitchParts(69)).toEqual({ step: "A", alter: 0, octave: 4 });
    expect(pitchParts(127)).toEqual({ step: "G", alter: 0, octave: 9 });
    expect(pitchParts(-5)).toEqual({ step: "C", alter: 0, octave: -1 });
  });

  it("counts bars from the furthest note with a one-bar floor", () => {
    expect(musicXmlBarCount([])).toBe(1);
    expect(
      musicXmlBarCount([
        { name: "Piano", notes: [{ midi: 60, step: 0, length: 4 }] },
      ]),
    ).toBe(1);
    expect(
      musicXmlBarCount([
        {
          name: "Piano",
          notes: [{ midi: 60, step: 32, length: 4 }],
        },
      ]),
    ).toBe(3);
  });

  it("fills gaps with rests so every measure is a full 4/4 bar", () => {
    const measure = buildMeasureXml(
      [{ midi: 60, step: 4, length: 4 }],
      0,
      16,
    );
    expect(durations(measure)).toEqual([4, 4, 8]);
    expect(measure).toContain("<rest/>");
    const total = durations(measure).reduce((a, b) => a + b, 0);
    expect(total).toBe(16);
  });

  it("writes simultaneous notes as a chord, longest first", () => {
    const measure = buildMeasureXml(
      [
        { midi: 60, step: 0, length: 2 },
        { midi: 64, step: 0, length: 4 },
      ],
      0,
      16,
    );
    // Longest note drives the clock; the shorter one is a chord member, so the
    // chord's musical length is the first duration (the second is not added).
    expect(durations(measure).filter((_, i) => i < 2)).toEqual([4, 2]);
    expect(measure.match(/<chord\/>/g)).toHaveLength(1);
    expect(durations(measure).slice(2)).toEqual([12]);
    expect(durations(measure)).toEqual([4, 2, 12]);
  });

  it("splits a note across the bar line with a tie pair", () => {
    const notes = [{ midi: 67, step: 12, length: 8 }];
    const bar1 = buildMeasureXml(notes, 0, 16);
    const bar2 = buildMeasureXml(notes, 1, 16);
    expect(bar1).toContain('<tie type="start"/>');
    expect(bar2).toContain('<tie type="stop"/>');
    // Bar 1 holds 12 steps of rest then 4 steps of the note...
    expect(durations(bar1).reduce((a, b) => a + b, 0)).toBe(16);
    // ...and bar 2 opens with the remaining 4, then rests out the bar.
    expect(durations(bar2)).toEqual([4, 12]);
  });

  it("rewinds with backup when a new note starts under a held one", () => {
    const measure = buildMeasureXml(
      [
        // Started in bar 1, held 8 steps into bar 2…
        { midi: 48, step: 12, length: 12 },
        // …and a new note enters while it is still sounding.
        { midi: 72, step: 18, length: 2 },
      ],
      1,
      16,
    );
    expect(measure).toContain('<tie type="stop"/>');
    expect(measure).toContain("<backup><duration>6</duration></backup>");
  });

  it("puts attributes and the tempo direction only in the first measure", () => {
    const xml = buildMusicXml(
      [{ name: "Lead", notes: [{ midi: 60, step: 0, length: 4 }] }],
      { title: "Midnight <Draft>", bpm: 132 },
    );
    expect(xml).toContain('<score-partwise version="3.1">');
    expect(xml).toContain("<work-title>Midnight &lt;Draft&gt;</work-title>");
    expect(xml).toContain("<divisions>4</divisions>");
    expect(xml).toContain("<per-minute>132</per-minute>");
    expect(xml).toContain('<part-name>Lead</part-name>');
    expect(xml.match(/<attributes>/g)).toHaveLength(1);
    expect(xml.match(/<measure /g)).toHaveLength(1);
  });

  it("writes one part per track and no part for silence", () => {
    const xml = buildMusicXml(
      [
        { name: "Piano", notes: [{ midi: 60, step: 0, length: 4 }] },
        { name: "Bass", notes: [{ midi: 40, step: 8, length: 4 }] },
      ],
      { title: "Duet" },
    );
    expect(xml.match(/<part id=/g)).toHaveLength(2);
    expect(xml).toContain('<score-part id="P2"><part-name>Bass</part-name>');
  });

  it("slugifies the download name", () => {
    expect(musicXmlFileName("Midnight Draft")).toBe("midnight-draft.musicxml");
    expect(musicXmlFileName("  ")).toBe("score.musicxml");
    expect(musicXmlFileName(undefined)).toBe("score.musicxml");
    expect(musicXmlFileName("A/B: Test!")).toBe("ab-test.musicxml");
  });
});
