/**
 * MusicXML export for the notation view.
 *
 * The score could be read and edited but never leave the app, which makes it a
 * dead end for a session that needs to hand a chart to a player or open it in
 * MuseScore / Sibelius / Dorico. MusicXML is the interchange format every
 * notation program reads, so this is the smallest honest bridge: pitches,
 * accidentals, rhythm as exact durations, chords, rests and bar splits with
 * ties. It is deliberately not a notation engraver — articulation, dynamics
 * marks and layout are left to the receiving program.
 */

export interface MusicXmlNote {
  midi: number;
  /** 16th-note steps from the start of the session. */
  step: number;
  /** Length in 16th-note steps. */
  length: number;
  /** 0–1; only used to order chord voicing, never written as a dynamic. */
  velocity?: number;
}

export interface MusicXmlPart {
  name: string;
  notes: MusicXmlNote[];
}

/** One meter marker from the transport's meter map. */
export interface MusicXmlMeterPoint {
  /** Step where this meter starts. */
  step: number;
  beats: number;
  unit: number;
}

export interface MusicXmlOptions {
  title?: string;
  bpm?: number;
  /**
   * Steps per bar for a score with no meter map. Used only when `meterMap` is
   * absent; 16 is a 4/4 bar.
   */
  stepsPerBar?: number;
  /** Meter changes from the transport; bar lines and counts follow them. */
  meterMap?: MusicXmlMeterPoint[];
  /** Steps per quarter note; 4 matches the 16th-note grid. */
  divisions?: number;
}

const STEP_NAMES = [
  ["C", 0],
  ["C", 1],
  ["D", 0],
  ["D", 1],
  ["E", 0],
  ["F", 0],
  ["F", 1],
  ["G", 0],
  ["G", 1],
  ["A", 0],
  ["A", 1],
  ["B", 0],
] as const;

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** MIDI note → MusicXML `<step>`/`<alter>`/`<octave>` (sharps preferred). */
export function pitchParts(midi: number): {
  step: string;
  alter: number;
  octave: number;
} {
  const clamped = Math.max(0, Math.min(127, Math.round(midi)));
  const [step, alter] = STEP_NAMES[((clamped % 12) + 12) % 12];
  return { step, alter, octave: Math.floor(clamped / 12) - 1 };
}

/** Exclusive end step of the furthest note across every part. */
function furthestStep(parts: MusicXmlPart[]): number {
  let furthest = 0;
  for (const part of parts) {
    for (const note of part.notes) {
      furthest = Math.max(furthest, note.step + Math.max(1, note.length));
    }
  }
  return furthest;
}

/** 16th-note steps in one bar of a meter (4/4 = 16, 3/4 = 12, 6/8 = 12). */
function stepsForMeter(meter: { beats: number; unit: number }): number {
  return (
    Math.max(1, Math.round(meter.beats)) *
    Math.max(1, Math.round(16 / Math.max(1, Math.round(meter.unit))))
  );
}

/** Meter in force at a step; 4/4 before the first marker. */
function meterAtStep(
  meterMap: MusicXmlMeterPoint[],
  step: number,
): { beats: number; unit: number } {
  let found = { beats: 4, unit: 4 };
  for (const marker of meterMap) {
    if (marker.step <= step) found = marker;
    else break;
  }
  return { beats: found.beats, unit: found.unit };
}

/**
 * Bar boundaries up to `furthest`, following the meter map the way the
 * transport does: a bar is its meter's step count, and a meter marker always
 * starts a new bar even when it lands mid-bar.
 */
function meterBarSpans(
  meterMap: MusicXmlMeterPoint[],
  furthest: number,
): { start: number; steps: number; beats: number; unit: number }[] {
  const spans: { start: number; steps: number; beats: number; unit: number }[] =
    [];
  let start = 0;
  while (start < furthest || spans.length === 0) {
    const meter = meterAtStep(meterMap, start);
    const natural = start + stepsForMeter(meter);
    const next = meterMap.find((marker) => marker.step > start);
    const end = next && next.step < natural ? next.step : natural;
    spans.push({
      start,
      steps: Math.max(1, end - start),
      beats: meter.beats,
      unit: meter.unit,
    });
    start = end;
    if (spans.length > 4096) break;
  }
  return spans;
}

/** Number of bars needed for the material, with a one-bar floor. */
export function musicXmlBarCount(
  parts: MusicXmlPart[],
  stepsPerBar = 16,
  meterMap: MusicXmlMeterPoint[] = [],
): number {
  const furthest = furthestStep(parts);
  if (meterMap.length === 0) {
    return Math.max(1, Math.ceil(furthest / Math.max(1, stepsPerBar)));
  }
  return meterBarSpans(meterMap, furthest).length;
}

interface MeasureEvent {
  onset: number;
  duration: number;
  notes: { midi: number; duration: number }[];
}

/**
 * Group notes starting on the same step into one event (a chord). The event's
 * duration is the longest note in it; the longest note is written first so the
 * measure's running total matches the advanced time.
 */
function groupByOnset(notes: MusicXmlNote[]): MeasureEvent[] {
  const byOnset = new Map<number, MusicXmlNote[]>();
  for (const note of notes) {
    const onset = Math.max(0, Math.round(note.step));
    const list = byOnset.get(onset) ?? [];
    list.push({ ...note, step: onset, length: Math.max(1, note.length) });
    byOnset.set(onset, list);
  }
  return [...byOnset.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([onset, group]) => {
      const voiced = group
        .slice()
        .sort(
          (a, b) =>
            Math.max(1, b.length) - Math.max(1, a.length) || b.midi - a.midi,
        );
      return {
        onset,
        duration: Math.max(1, voiced[0].length),
        notes: voiced.map((note) => ({
          midi: note.midi,
          duration: Math.max(1, note.length),
        })),
      };
    });
}

function noteXml(
  pitch: { step: string; alter: number; octave: number },
  duration: number,
  ties: { start?: boolean; stop?: boolean } = {},
): string {
  const tieTypes = [
    ties.stop ? '<tie type="stop"/>' : "",
    ties.start ? '<tie type="start"/>' : "",
  ].join("");
  return [
    "<note>",
    "<pitch>",
    `<step>${pitch.step}</step>`,
    pitch.alter ? `<alter>${pitch.alter}</alter>` : "",
    `<octave>${pitch.octave}</octave>`,
    "</pitch>",
    `<duration>${duration}</duration>`,
    tieTypes,
    tieTypes ? `<notations>${tieTypes}</notations>` : "",
    "<voice>1</voice>",
    "</note>",
  ].join("");
}

function restXml(duration: number): string {
  return `<note><rest/><duration>${duration}</duration><voice>1</voice></note>`;
}

/**
 * One part's measure. `barIndex` is 0-based; notes are the part's full set and
 * are clipped per bar, with ties marking a note that continues into the next.
 *
 * Two cases make this more than a filter:
 *  - a note that began in an earlier bar is still sounding here, so it is
 *    written at the bar line with a stop tie (and a start tie if it runs on);
 *  - a new note can begin while such a continuation is still sounding, so the
 *    writer rewinds with `<backup>` instead of silently shifting the rhythm.
 */
export function buildMeasureXml(
  notes: MusicXmlNote[],
  barIndex: number,
  stepsPerBar: number,
  attributes = "",
  barStart = barIndex * stepsPerBar,
): string {
  const barEnd = barStart + stepsPerBar;

  const ongoing = notes
    .filter(
      (note) =>
        Math.round(note.step) < barStart &&
        Math.round(note.step) + Math.max(1, note.length) > barStart,
    )
    .map((note) => ({
      onset: barStart,
      duration: Math.min(
        barEnd,
        Math.round(note.step) + Math.max(1, note.length),
      ) - barStart,
      midi: note.midi,
      stopTie: true,
      startTie: Math.round(note.step) + Math.max(1, note.length) > barEnd,
    }));

  const starting = groupByOnset(notes).filter(
    (event) => event.onset >= barStart && event.onset < barEnd,
  );

  const body: string[] = [];
  let cursor = barStart;

  const emit = (onset: number, xml: string) => {
    if (onset < cursor) {
      body.push(`<backup><duration>${cursor - onset}</duration></backup>`);
      cursor = onset;
    } else if (onset > cursor) {
      body.push(restXml(onset - cursor));
      cursor = onset;
    }
    body.push(xml);
  };

  for (const note of ongoing) {
    const duration = Math.max(1, note.duration);
    emit(note.onset, noteXml(pitchParts(note.midi), duration, {
      start: note.startTie,
      stop: note.stopTie,
    }));
    cursor = Math.max(cursor, note.onset + duration);
  }

  for (const event of starting) {
    const available = barEnd - event.onset;
    const clipped = Math.min(event.duration, available);
    const continues = event.onset + event.duration > barEnd;
    const chunks = event.notes.map((note) => {
      const chunk = Math.max(1, Math.min(note.duration, available));
      return noteXml(pitchParts(note.midi), chunk, { start: continues });
    });
    const xml = chunks
      .map((chunk, index) =>
        index === 0 ? chunk : chunk.replace("<note>", "<note><chord/>"),
      )
      .join("");
    emit(event.onset, xml);
    cursor = Math.max(cursor, event.onset + clipped);
  }

  if (cursor < barEnd) body.push(restXml(barEnd - cursor));

  return [
    `<measure number="${barIndex + 1}">`,
    attributes,
    ...body,
    "</measure>",
  ].join("");
}

/** Whole score as a MusicXML 3.1 partwise document. */
export function buildMusicXml(
  parts: MusicXmlPart[],
  options: MusicXmlOptions = {},
): string {
  const stepsPerBar = Math.max(1, options.stepsPerBar ?? 16);
  const divisions = options.divisions ?? 4;
  const title = options.title?.trim() || "Untitled Score";
  const bpm = Math.round(options.bpm ?? 120);
  const meterMap = options.meterMap ?? [];
  const furthest = furthestStep(parts);
  // With a meter map, every bar is measured by the meter in force where it
  // starts; without one the score stays a uniform (default 4/4) grid.
  const spans = meterMap.length
    ? meterBarSpans(meterMap, furthest)
    : Array.from(
        { length: Math.max(1, Math.ceil(furthest / stepsPerBar)) },
        (_, bar) => ({
          start: bar * stepsPerBar,
          steps: stepsPerBar,
          beats: 4,
          unit: 4,
        }),
      );

  const direction = [
    '<direction placement="above">',
    "<direction-type>",
    "<metronome><beat-unit>quarter</beat-unit>",
    `<per-minute>${bpm}</per-minute></metronome>`,
    "</direction-type>",
    "</direction>",
  ].join("");

  /** Divisions/key/clef and the tempo direction open the score; a meter
   * change writes only a new `<time>` on the bar where it starts. */
  const attributesFor = (bar: number): string => {
    const span = spans[bar];
    const previous = spans[bar - 1];
    const first = bar === 0;
    const timeChanged =
      first ||
      !previous ||
      previous.beats !== span.beats ||
      previous.unit !== span.unit;
    const body = [
      first ? `<divisions>${divisions}</divisions>` : "",
      first ? "<key><fifths>0</fifths></key>" : "",
      timeChanged
        ? `<time><beats>${span.beats}</beats><beat-type>${span.unit}</beat-type></time>`
        : "",
      first ? "<clef><sign>G</sign><line>2</line></clef>" : "",
    ].join("");
    return `${body ? `<attributes>${body}</attributes>` : ""}${
      first ? direction : ""
    }`;
  };

  const scoreParts = parts.map((part, index) => {
    const partId = `P${index + 1}`;
    const measures = spans
      .map((span, bar) =>
        buildMeasureXml(
          part.notes,
          bar,
          span.steps,
          attributesFor(bar),
          span.start,
        ),
      )
      .join("");
    return { partId, name: part.name || `Part ${index + 1}`, measures };
  });

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 3.1 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">',
    '<score-partwise version="3.1">',
    "<work>",
    `<work-title>${escapeXml(title)}</work-title>`,
    "</work>",
    "<identification>",
    "<encoding>",
    "<software>S.M.U.V.E. Studio</software>",
    "</encoding>",
    "</identification>",
    "<part-list>",
    ...scoreParts.map(
      ({ partId, name }) =>
        `<score-part id="${partId}"><part-name>${escapeXml(name)}</part-name></score-part>`,
    ),
    "</part-list>",
    ...scoreParts.map(
      ({ partId, measures }) => `<part id="${partId}">${measures}</part>`,
    ),
    "</score-partwise>",
    "",
  ].join("\n");
}

/** Filename-safe title for the downloaded chart. */
export function musicXmlFileName(title: string | undefined): string {
  const base = (title || "score").trim().replace(/[^\w\- ]+/g, "").trim();
  const slug = (base || "score").replace(/\s+/g, "-").toLowerCase();
  return `${slug}.musicxml`;
}
