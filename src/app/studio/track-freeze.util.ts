import type { TrackModel } from "../services/music-manager.service";

/**
 * Everything needed to thaw a frozen track again. Stored on the track itself so
 * it survives save/load and undo/redo (it is plain JSON — the rendered audio
 * lives in `MusicManagerService.stemAudioCache`, keyed by `clipId`).
 */
export interface FrozenTrackBackup {
  notes: TrackModel["notes"];
  steps: TrackModel["steps"];
  clips: TrackModel["clips"];
  activePatternSlotId: TrackModel["activePatternSlotId"];
  /** Epoch ms the bake was made, shown in the UI. */
  bakedAt: number;
  /** Length of the rendered clip, in bars. */
  bars: number;
  /** Cache key of the rendered AudioBuffer. */
  clipId: string;
}

export interface FreezeOptions {
  clipId: string;
  /** Rendered audio length in seconds (the bounce already includes its tail). */
  durationSeconds: number;
  /** Tempo at bake time — the clip is placed on that tempo's bar grid. */
  tempo: number;
  now: number;
  /** Name to show on the rendered clip. */
  clipName?: string;
}

/**
 * Bars for a rendered clip, rounded UP to a quarter bar because arrangement
 * clips snap to quarter bars — a 3.02-bar render must not be truncated.
 */
export function frozenClipBars(durationSeconds: number, tempo: number): number {
  const safeTempo = Number.isFinite(tempo) && tempo > 0 ? tempo : 120;
  const secondsPerBar = (60 / safeTempo) * 4;
  const rawBars = Math.max(0, durationSeconds) / secondsPerBar;
  return Math.max(0.25, Math.ceil(rawBars * 4) / 4);
}

/**
 * Make the frozen clip unity against the fader that is still live.
 *
 * The offline bounce renders THROUGH the track's channel gain (so a bounce
 * matches what you hear). If that rendered audio then plays through the same
 * fader again the gain is applied twice. Dividing it back out here means the
 * frozen track's fader keeps doing exactly what it did before the freeze.
 */
export function frozenClipGain(trackGain: number | undefined): number {
  const gain = Number.isFinite(trackGain) ? (trackGain as number) : 1;
  return 1 / Math.max(0.05, gain);
}

export function isTrackFrozen(
  track: Pick<TrackModel, "id"> & { frozenBackup?: FrozenTrackBackup },
): boolean {
  return !!track.frozenBackup;
}

/**
 * Replace a MIDI/drum track's pattern with one rendered audio clip.
 *
 * The notes and clips are moved into `frozenBackup` rather than deleted, so
 * thawing is a restore, not a re-generation. `steps` is zeroed so the Channel
 * Rack and drum pads visibly stop showing live pattern data for a baked track.
 */
export function buildFrozenTrack(
  track: TrackModel,
  options: FreezeOptions,
): TrackModel {
  if (track.frozenBackup) return track;
  const bars = frozenClipBars(options.durationSeconds, options.tempo);
  const backup: FrozenTrackBackup = {
    notes: track.notes ?? [],
    steps: track.steps ?? [],
    clips: track.clips ?? [],
    activePatternSlotId: track.activePatternSlotId,
    bakedAt: options.now,
    bars,
    clipId: options.clipId,
  };

  const clip = {
    id: options.clipId,
    name: options.clipName ?? `${track.name} (frozen)`,
    start: 0,
    length: bars,
    type: "audio" as const,
    audioRefId: options.clipId,
    clipGain: frozenClipGain(track.gain),
  } as TrackModel["clips"][number];

  return {
    ...track,
    notes: [],
    steps: new Array(Math.max(1, track.steps?.length ?? 64)).fill(false),
    clips: [clip],
    frozenBackup: backup,
  } as TrackModel;
}

/** Put the original pattern, notes and clips back. */
export function restoreFrozenTrack(track: TrackModel): TrackModel {
  const backup = track.frozenBackup;
  if (!backup) return track;
  const { frozenBackup: _dropped, ...rest } = track;
  return {
    ...(rest as TrackModel),
    notes: backup.notes,
    steps: backup.steps,
    clips: backup.clips,
    activePatternSlotId: backup.activePatternSlotId,
  };
}
