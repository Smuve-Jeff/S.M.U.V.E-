import { unzipArchive, type InflateFn } from "./zip-read.util";
import type {
  DawprojectAudio,
  DawprojectClip,
  DawprojectNote,
  DawprojectProject,
  DawprojectTrack,
} from "./dawproject-export";

/**
 * DAWproject import — the reverse of `dawproject-export.ts`.
 *
 * Real exporters (Bitwig, Cubasis, Studio One) all write the same ZIP +
 * `project.xml` shape, but each leans on different corners: missing
 * `Transport`, audio referenced but not embedded (Studio One unless the
 * user copied the files in), tempo/meter automation we do not apply,
 * clip-launcher scenes, and plugin devices we cannot host. The parser
 * reads what the studio can materialize (tracks, clips, notes, audio,
 * tempo, meter) and reports everything it skipped in `warnings` instead
 * of failing the import or silently dropping it.
 */

export interface DawprojectImportResult {
  project: DawprojectProject;
  warnings: string[];
}

const STEPS_PER_BEAT = 4;

function attr(element: Element | null, name: string): string | null {
  return element?.getAttribute(name) ?? null;
}

function num(value: string | null, fallback: number): number {
  if (value === null) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function bool(value: string | null): boolean {
  return value === "true" || value === "1";
}

function childElements(parent: Element, tag: string): Element[] {
  return Array.from(parent.children).filter(
    (child) => child.tagName === tag,
  );
}

function firstChild(parent: Element | null, tag: string): Element | null {
  if (!parent) return null;
  const found = childElements(parent, tag);
  return found.length > 0 ? found[0] : null;
}

/** Beats for a time value in the given lane unit (header tempo for seconds). */
function toBeats(value: number, unit: string, tempo: number): number {
  if (unit === "seconds") return (value * Math.max(1, tempo)) / 60;
  return value;
}

interface ChannelMix {
  gain: number;
  pan: number;
  muted: boolean;
  soloed: boolean;
  instrumentName?: string;
}

function parseDbToLinear(db: number): number {
  return Math.pow(10, Math.max(-60, Math.min(12, db)) / 20);
}

/**
 * A TempoAutomation block is a static tempo for us, but its first point is
 * a better guess than the header when a song ramps: adopt it and say so.
 */
function applyTempoAutomation(
  arrangement: Element,
  headerTempo: number,
  warnings: string[],
): number {
  const automation = firstChild(arrangement, "TempoAutomation");
  if (!automation) return headerTempo;
  const point =
    childElements(automation, "RealPoint")[0] ??
    childElements(automation, "Point")[0];
  const value = num(attr(point, "value"), NaN);
  if (point && Number.isFinite(value) && value >= 20 && value <= 300) {
    const adopted = Math.round(value * 10) / 10;
    if (adopted !== headerTempo) {
      warnings.push(
        `Tempo automation is not applied; using its first point (${adopted} BPM) instead of the header tempo.`,
      );
    }
    return adopted;
  }
  warnings.push("Tempo automation is not applied; the header tempo is used.");
  return headerTempo;
}

function parseChannel(track: Element): ChannelMix {
  const mix: ChannelMix = { gain: 1, pan: 0, muted: false, soloed: false };
  const channel = firstChild(track, "Channel");
  if (!channel) return mix;
  mix.soloed = bool(attr(channel, "solo"));
  const mute = firstChild(channel, "Mute");
  if (mute) mix.muted = bool(attr(mute, "value"));
  const pan = firstChild(channel, "Pan");
  if (pan) {
    const value = num(attr(pan, "value"), 0);
    mix.pan =
      attr(pan, "unit") === "normalized"
        ? Math.max(-1, Math.min(1, value))
        : value / 50;
  }
  const volume = firstChild(channel, "Volume");
  if (volume) {
    const value = num(attr(volume, "value"), 1);
    const unit = attr(volume, "unit") ?? "linear";
    // Some serializers write a dB number while stamping unit="linear"
    // (negative linear gain is physically meaningless), so treat any
    // negative linear value as dB. Bitwig/Studio One write dB properly.
    mix.gain =
      unit === "db" || value < 0 ? parseDbToLinear(value) : Math.max(0, value);
  }
  // Only an instrument-role device lends its name: FX chains (EQ,
  // compressors) must not masquerade as the track instrument.
  // Materialization still maps to a stock instrument, so this is
  // provenance, not a promise.
  const devices = firstChild(channel, "Devices");
  if (devices) {
    for (const device of Array.from(devices.children)) {
      const role = device.getAttribute("deviceRole") ?? device.getAttribute("role");
      const name =
        device.getAttribute("deviceName") ?? device.getAttribute("name");
      if (name && role === "instrument") {
        mix.instrumentName = name;
        break;
      }
    }
  }
  return mix;
}

function parseNote(note: Element, toSteps: (value: number) => number): DawprojectNote | null {
  const time = num(attr(note, "time"), NaN);
  const duration = num(attr(note, "duration"), NaN);
  const key = Math.round(num(attr(note, "key"), NaN));
  if (!Number.isFinite(time) || !Number.isFinite(duration) || !Number.isFinite(key)) {
    return null;
  }
  return {
    step: Math.max(0, toSteps(time)),
    length: Math.max(0.001, toSteps(duration)),
    midi: Math.max(0, Math.min(127, key)),
    velocity: Math.max(0, Math.min(1, num(attr(note, "vel"), 0.8))),
  };
}

function parseClip(
  clip: Element,
  toContentSteps: (value: number) => number,
  toLaneBars: (value: number) => number,
  newAudioId: () => string,
): { clip: DawprojectClip; audioPath: string | null; audioId: string | null } {
  const start = toLaneBars(num(attr(clip, "time"), 0));
  const length = Math.max(0, toLaneBars(num(attr(clip, "duration"), 0)));
  const name = attr(clip, "name") ?? "";
  const notesEl = firstChild(clip, "Notes");
  if (notesEl) {
    const notes: DawprojectNote[] = [];
    for (const noteEl of childElements(notesEl, "Note")) {
      const parsed = parseNote(noteEl, toContentSteps);
      if (!parsed) continue;
      // Absolute on the studio grid; clips that spill past their edge keep
      // their events (the exporter clamps, other DAWs do not).
      notes.push({
        ...parsed,
        step: parsed.step + start * 16,
      });
    }
    return { clip: { name, start, length, notes }, audioPath: null, audioId: null };
  }
  const audioEl = firstChild(clip, "Audio");
  if (audioEl) {
    const file = firstChild(audioEl, "File");
    const path = attr(file, "path");
    if (!path) return { clip: { name, start, length, notes: [] }, audioPath: null, audioId: null };
    const audioId = attr(audioEl, "id") ?? newAudioId();
    return {
      clip: { name, start, length, audioId, notes: [] },
      audioPath: path.replace(/^\.\//, "").replace(/^\//, ""),
      audioId,
    };
  }
  return { clip: { name, start, length, notes: [] }, audioPath: null, audioId: null };
}

/** Parse `project.xml` into the studio model (audio bytes joined by the caller). */
export function parseDawprojectXml(xml: string): DawprojectImportResult {
  const warnings: string[] = [];
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.querySelector("parsererror")) {
    throw new Error("project.xml is not valid XML.");
  }
  const root = doc.documentElement;
  if (!root || root.tagName !== "Project") {
    throw new Error("project.xml has no Project root.");
  }

  const transport = firstChild(root, "Transport");
  let tempo = num(attr(firstChild(transport, "Tempo"), "value"), 120);
  const meter = firstChild(transport, "TimeSignature");
  const numerator = Math.max(1, Math.round(num(attr(meter, "numerator"), 4)));
  const denominator = num(attr(meter, "denominator"), 4);

  // The Arrangement carries the song title; Application names the DAW that
  // wrote the file (S.M.U.V.E. writes both, Bitwig the same way).
  const name =
    attr(firstChild(root, "Arrangement"), "name") ??
    attr(firstChild(root, "Application"), "name") ??
    "Imported project";

  const structure = firstChild(root, "Structure");
  const trackEls = structure ? childElements(structure, "Track") : [];
  if (trackEls.length === 0) warnings.push("No tracks found in Structure.");

  const arrangement = firstChild(root, "Arrangement");
  // Lanes may nest (track groups); index every Lanes by its track reference.
  const lanesByTrack = new Map<string, Element[]>();
  const untrackedClips: Element[] = [];
  if (arrangement) {
    const walk = (lanes: Element) => {
      for (const child of Array.from(lanes.children)) {
        // Flat serializers attach Clips directly, with no per-track Lanes
        // wrapper around them (dawproject-py, and some device exporters).
        if (child.tagName === "Clips") {
          const ref = child.getAttribute("track");
          if (ref) {
            const list = lanesByTrack.get(ref) ?? [];
            list.push(child);
            lanesByTrack.set(ref, list);
          } else {
            untrackedClips.push(...childElements(child, "Clip"));
          }
          continue;
        }
        if (child.tagName !== "Lanes") continue;
        const ref = child.getAttribute("track");
        const clips = firstChild(child, "Clips");
        if (ref && clips) {
          const list = lanesByTrack.get(ref) ?? [];
          list.push(child);
          lanesByTrack.set(ref, list);
        } else if (clips && !ref) {
          untrackedClips.push(...childElements(clips, "Clip"));
        }
        walk(child);
      }
    };
    for (const lanes of childElements(arrangement, "Lanes")) walk(lanes);
    tempo = applyTempoAutomation(arrangement, tempo, warnings);
    if (firstChild(arrangement, "TimeSignatureAutomation")) {
      warnings.push("Meter automation is not applied; the header meter is used.");
    }
  } else {
    warnings.push("No Arrangement found; importing the track structure only.");
  }
  if (firstChild(root, "Scenes")) {
    warnings.push("Clip-launcher scenes are not imported.");
  }

  let audioCounter = 0;
  const newAudioId = (): string => `imported-audio-${++audioCounter}`;
  const audio: DawprojectAudio[] = [];
  const audioPaths: string[] = [];

  const tracks: DawprojectTrack[] = trackEls.flatMap((trackEl, index) => {
    const id = attr(trackEl, "id") ?? `track-${index}`;
    const contentType = attr(trackEl, "contentType") ?? "";
    const types = contentType.split(",").map((t) => t.trim());
    const isAudio = types.includes("audio");
    const mix = parseChannel(trackEl);
    const trackName = attr(trackEl, "name") ?? `Track ${index + 1}`;
    // Mixer routing tracks (master/bus) hold no playable content; carrying
    // them in as silent MIDI channels would only litter the project.
    const role = firstChild(trackEl, "Channel")?.getAttribute("role");
    if (role === "master" || role === "bus") {
      warnings.push(
        `Skipped the "${trackName}" ${role} track: mixer routing has no playable mapping.`,
      );
      return [];
    }
    const track: DawprojectTrack = {
      id,
      name: trackName,
      type: isAudio ? "audio" : "midi",
      color: attr(trackEl, "color") ?? undefined,
      instrumentName: mix.instrumentName,
      gain: mix.gain,
      pan: mix.pan,
      muted: mix.muted,
      soloed: mix.soloed,
      notes: [],
      clips: [],
    };
    if (
      types.some(
        (t) => t !== "" && t !== "notes" && t !== "audio",
      )
    ) {
      warnings.push(
        `Track "${track.name}" has content this import skips (${types.join(", ")}).`,
      );
    }

    const laneEls = lanesByTrack.get(id) ?? [];
    // Bitwig-style files reference lanes by track id; files that do not can
    // still carry clips directly under an unscoped Lanes block.
    const clipEls =
      laneEls.length > 0
        ? laneEls.flatMap((lanes) => {
            const clips =
              lanes.tagName === "Clips" ? lanes : firstChild(lanes, "Clips");
            return clips ? childElements(clips, "Clip") : [];
          })
        : index === 0
          ? untrackedClips
          : [];
    for (const clipEl of clipEls) {
      const laneUnit =
        clipEl.closest("Lanes")?.getAttribute("timeUnit") ?? "beats";
      // The clip's own content can run on a different clock than the lane
      // (third-party files mix seconds lanes with beats content).
      const contentUnit =
        clipEl.getAttribute("contentTimeUnit") ?? laneUnit;
      const parsed = parseClip(
        clipEl,
        (value) => toBeats(value, contentUnit, tempo) * STEPS_PER_BEAT,
        (value) => toBeats(value, laneUnit, tempo) / 4,
        newAudioId,
      );
      track.clips.push(parsed.clip);
      track.notes.push(...(parsed.clip.notes ?? []));
      if (parsed.audioPath && parsed.audioId) {
        audioPaths.push(parsed.audioPath);
        audio.push({
          id: parsed.audioId,
          path: parsed.audioPath,
          data: new Uint8Array(0),
        });
      }
    }
    return track;
  });

  // Deterministic ids for the archive join: duplicate audio references share
  // one entry each (exporters sometimes reference the same file twice).
  const seenPaths = new Set<string>();
  const dedupedAudio = audio.filter((entry) => {
    if (seenPaths.has(entry.path)) return false;
    seenPaths.add(entry.path);
    return true;
  });

  return {
    project: {
      name,
      tempo: Number.isFinite(tempo) && tempo > 0 ? tempo : 120,
      numerator,
      denominator: [2, 4, 8, 16].includes(denominator) ? denominator : 4,
      tracks,
      audio: dedupedAudio,
    },
    warnings: [...new Set(warnings)],
  };
}

/**
 * Import a full `.dawproject` archive: unzip, parse `project.xml`, and join
 * the referenced audio bytes. Missing audio (Studio One references files it
 * did not embed unless the user copied them in) warns instead of failing.
 */
export async function importDawprojectArchive(
  input: Uint8Array | ArrayBuffer,
  inflate?: InflateFn,
): Promise<DawprojectImportResult> {
  const entries = await unzipArchive(input, inflate);
  const xmlEntry =
    entries.find((entry) => entry.name === "project.xml") ??
    entries.find((entry) => entry.name.endsWith("/project.xml"));
  if (!xmlEntry) throw new Error("No project.xml in this .dawproject file.");
  const xml = new TextDecoder("utf-8").decode(xmlEntry.data);
  const result = parseDawprojectXml(xml);
  const byName = new Map(entries.map((entry) => [entry.name, entry.data]));
  const missing: string[] = [];
  for (const ref of result.project.audio) {
    const data =
      byName.get(ref.path) ??
      byName.get(`audio/${ref.path.split("/").pop()}`) ??
      [...byName.entries()].find(([name]) =>
        name.endsWith(`/${ref.path.split("/").pop()}`),
      )?.[1];
    if (data) {
      ref.data = data;
    } else {
      missing.push(ref.path);
    }
  }
  if (missing.length > 0) {
    const missingPaths = new Set(missing);
    const droppedIds = new Set(
      result.project.audio
        .filter((ref) => missingPaths.has(ref.path))
        .map((ref) => ref.id),
    );
    result.project.audio = result.project.audio.filter(
      (ref) => !missingPaths.has(ref.path),
    );
    for (const track of result.project.tracks) {
      for (const clip of track.clips) {
        if (clip.audioId && droppedIds.has(clip.audioId)) {
          delete clip.audioId;
        }
      }
    }
    result.warnings.push(
      `Audio not embedded and skipped: ${missing.join(", ")}.`,
    );
  }
  return result;
}
