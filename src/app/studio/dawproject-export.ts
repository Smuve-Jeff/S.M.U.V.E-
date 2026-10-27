import { buildZip, type ZipEntry } from "./zip.util";

/**
 * DAWproject export — the open exchange format Bitwig and PreSonus publish
 * (Cubasis 3.7+, Studio One, Bitwig and others read it).
 *
 * A `.dawproject` is a ZIP containing `project.xml` plus any referenced audio.
 * The XML is authored against the format's published `Project.xsd`:
 *
 *  - `Project` → `Application`, `Transport`, `Structure`, `Arrangement`
 *  - `Track` is a `lane`, so its name/colour are ATTRIBUTES, not child elements
 *  - `Channel` children must be ordered `Devices`, `Mute`, `Pan`, `Sends`,
 *    `Volume`
 *  - a `Clip` holds ONE child (`Notes` or `Audio`) inside its optional choice
 *  - `Audio` needs `duration`, `channels` and `sampleRate`, plus a `File` child
 *
 * Time is written in BEATS (`timeUnit="beats"`): the studio stores arrangement
 * clips in bars and notes in 16th steps, so both are converted once here rather
 * than leaving a reader to guess.
 */

export interface DawprojectNote {
  /** Absolute step on the studio's 16-steps-per-bar grid. */
  step: number;
  /** Length in steps. */
  length: number;
  /** MIDI note number 0-127. */
  midi: number;
  velocity: number;
}

export interface DawprojectClip {
  name: string;
  /** Start in bars. */
  start: number;
  /** Length in bars. */
  length: number;
  /** Set for rendered/recorded clips that have audio attached. */
  audioId?: string;
}

export interface DawprojectTrack {
  id: string;
  name: string;
  /** "midi" | "drum" | "audio" | "bus" */
  type: string;
  color?: string;
  instrumentName?: string;
  gain: number;
  pan: number;
  muted: boolean;
  soloed: boolean;
  notes: DawprojectNote[];
  clips: DawprojectClip[];
}

export interface DawprojectAudio {
  /** Cache id the clip references. */
  id: string;
  /** Path inside the archive, e.g. `audio/take-1.wav`. */
  path: string;
  /** Encoded WAV bytes. */
  data: Uint8Array;
}

export interface DawprojectProject {
  name: string;
  tempo: number;
  numerator: number;
  denominator: number;
  tracks: DawprojectTrack[];
  audio: DawprojectAudio[];
  /** Shown as the application version in project.xml. */
  appVersion?: string;
}

const STEPS_PER_BEAT = 4;

const escapeXml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

/** XML `xs:ID` values must start with a letter and contain no spaces. */
export function xmlId(prefix: string, value: string): string {
  const safe = value.replace(/[^A-Za-z0-9_-]/g, "_");
  return `${prefix}_${/^[A-Za-z]/.test(safe) ? safe : "x" + safe}`;
}

const beats = (steps: number): string => {
  const value = (Number.isFinite(steps) ? steps : 0) / STEPS_PER_BEAT;
  return (Math.round(value * 1e6) / 1e6).toString();
};

const barBeats = (bars: number): string => {
  const value = (Number.isFinite(bars) ? bars : 0) * 4;
  return (Math.round(value * 1e6) / 1e6).toString();
};

const clampPan = (value: number): string =>
  (Math.max(-1, Math.min(1, Number.isFinite(value) ? value : 0))).toString();

function trackChannelXml(track: DawprojectTrack): string {
  const lines: string[] = [];
  lines.push(
    `      <Channel role="regular" solo="${track.soloed ? "true" : "false"}">`,
  );
  if (track.instrumentName) {
    lines.push(`        <Devices>`);
    lines.push(
      `          <BuiltinDevice deviceName="${escapeXml(track.instrumentName)}" deviceRole="instrument" loaded="true"/>`,
    );
    lines.push(`        </Devices>`);
  }
  lines.push(`        <Mute value="${track.muted ? "true" : "false"}"/>`);
  lines.push(`        <Pan value="${clampPan(track.pan)}" unit="normalized"/>`);
  lines.push(
    `        <Volume value="${Number.isFinite(track.gain) ? track.gain : 1}" unit="linear"/>`,
  );
  lines.push(`      </Channel>`);
  return lines.join("\n");
}

function clipXml(
  clip: DawprojectClip,
  track: DawprojectTrack,
  tempo: number,
  audioPaths: Map<string, string>,
): string {
  const attrs = `time="${barBeats(clip.start)}" duration="${barBeats(clip.length)}" name="${escapeXml(clip.name)}"`;
  if (clip.audioId) {
    const seconds = (clip.length * 4 * 60) / Math.max(1, tempo);
    return [
      `          <Clip ${attrs}>`,
      `            <Audio id="${xmlId("audio", clip.audioId)}" duration="${seconds.toFixed(6)}" channels="2" sampleRate="44100" timeUnit="seconds">`,
      `              <File path="${escapeXml(audioPaths.get(clip.audioId) ?? `audio/${xmlId("clip", clip.audioId)}.wav`)}"/>`,
      `            </Audio>`,
      `          </Clip>`,
    ].join("\n");
  }

  const notes = track.notes
    .filter((note) => {
      const noteBar = note.step / 16;
      return noteBar >= clip.start && noteBar < clip.start + clip.length;
    })
    .map((note) => {
      const local = note.step - clip.start * 16;
      return `            <Note time="${beats(local)}" duration="${beats(Math.max(1, note.length))}" channel="0" key="${Math.max(0, Math.min(127, Math.round(note.midi)))}" vel="${Math.max(0, Math.min(1, note.velocity)).toFixed(3)}"/>`;
    });

  if (notes.length === 0) {
    return `          <Clip ${attrs}/>`;
  }
  return [
    `          <Clip ${attrs}>`,
    `            <Notes>`,
    ...notes,
    `            </Notes>`,
    `          </Clip>`,
  ].join("\n");
}

/** Render `project.xml` for a DAWproject archive. */
export function buildDawprojectXml(project: DawprojectProject): string {
  const audioPaths = new Map<string, string>();
  for (const audio of project.audio) audioPaths.set(audio.id, audio.path);

  const tempo = Number.isFinite(project.tempo) ? project.tempo : 120;
  const lines: string[] = [];
  lines.push(`<?xml version="1.0" encoding="UTF-8"?>`);
  lines.push(`<Project version="1.0">`);
  lines.push(
    `  <Application name="S.M.U.V.E." version="${escapeXml(project.appVersion ?? "2.0")}"/>`,
  );
  lines.push(`  <Transport>`);
  lines.push(`    <Tempo value="${tempo}" unit="bpm"/>`);
  lines.push(
    `    <TimeSignature numerator="${project.numerator}" denominator="${project.denominator}"/>`,
  );
  lines.push(`  </Transport>`);

  lines.push(`  <Structure>`);
  for (const track of project.tracks) {
    const contentType = track.type === "audio" ? "audio" : "notes";
    lines.push(
      `    <Track contentType="${contentType}" loaded="true" id="${xmlId("track", track.id)}" name="${escapeXml(track.name)}"${track.color ? ` color="${escapeXml(track.color)}"` : ""}>`,
    );
    lines.push(trackChannelXml(track));
    lines.push(`    </Track>`);
  }
  lines.push(`  </Structure>`);

  lines.push(`  <Arrangement id="arrangement" name="${escapeXml(project.name)}">`);
  lines.push(`    <Lanes id="arrangement_lanes" timeUnit="beats">`);
  for (const track of project.tracks) {
    lines.push(
      `      <Lanes id="${xmlId("lanes", track.id)}" track="${xmlId("track", track.id)}" timeUnit="beats">`,
    );
    lines.push(`        <Clips>`);
    for (const clip of track.clips) {
      lines.push(clipXml(clip, track, tempo, audioPaths));
    }
    lines.push(`        </Clips>`);
    lines.push(`      </Lanes>`);
  }
  lines.push(`    </Lanes>`);
  lines.push(`  </Arrangement>`);
  lines.push(`</Project>`);
  return lines.join("\n");
}

/** Build the `.dawproject` ZIP (project.xml + referenced audio). */
export function buildDawproject(project: DawprojectProject): Blob {
  const xml = buildDawprojectXml(project);
  const entries: ZipEntry[] = [
    { name: "project.xml", data: new TextEncoder().encode(xml) },
  ];
  for (const audio of project.audio) {
    entries.push({ name: audio.path, data: audio.data });
  }
  return buildZip(entries);
}
