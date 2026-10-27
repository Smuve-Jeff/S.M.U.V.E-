import type { TrackModel } from "../services/music-manager.service";
import {
  buildFrozenTrack,
  frozenClipBars,
  frozenClipGain,
  isTrackFrozen,
  restoreFrozenTrack,
} from "./track-freeze.util";

function makeTrack(overrides: Partial<TrackModel> = {}): TrackModel {
  return {
    id: "track_1",
    name: "Bass",
    type: "midi",
    instrumentId: "subtractive-elite",
    muted: false,
    soloed: false,
    volume: 0.8,
    gain: 0.5,
    pan: 0,
    clips: [
      { id: "clip_a", name: "A", start: 0, length: 4, type: "midi" } as any,
    ],
    notes: [
      { id: "n1", midi: 36, step: 0, length: 2, velocity: 0.9 },
      { id: "n2", midi: 43, step: 8, length: 1, velocity: 0.7 },
    ],
    steps: [true, false, true],
    activePatternSlotId: "slot-0",
    ...overrides,
  } as TrackModel;
}

describe("track freeze helpers", () => {
  it("rounds clip length up to a quarter bar", () => {
    // 120 BPM → 2 s per bar.
    expect(frozenClipBars(2, 120)).toBe(1);
    expect(frozenClipBars(2.1, 120)).toBe(1.25);
    expect(frozenClipBars(3.9, 120)).toBe(2);
    expect(frozenClipBars(0, 120)).toBe(0.25);
  });

  it("compensates the fader so a baked track is not gained twice", () => {
    // The bounce already rendered through gain 0.5.
    expect(frozenClipGain(0.5)).toBe(2);
    expect(frozenClipGain(1)).toBe(1);
    // A near-silent fader is clamped instead of producing an enormous clip gain.
    expect(frozenClipGain(0)).toBe(20);
  });

  it("replaces the pattern with one audio clip and keeps a backup", () => {
    const track = makeTrack();
    const frozen = buildFrozenTrack(track, {
      clipId: "frozen_1",
      durationSeconds: 2,
      tempo: 120,
      now: 1000,
    });

    expect(isTrackFrozen(frozen)).toBe(true);
    expect(frozen.notes).toEqual([]);
    expect(frozen.steps.every((step) => step === false)).toBe(true);
    expect(frozen.clips).toHaveLength(1);
    expect(frozen.clips[0]).toMatchObject({
      id: "frozen_1",
      type: "audio",
      start: 0,
      length: 1,
      audioRefId: "frozen_1",
      clipGain: 2,
    });
    expect(frozen.frozenBackup?.notes).toHaveLength(2);
    expect(frozen.frozenBackup?.clips).toHaveLength(1);
    expect(frozen.frozenBackup?.bakedAt).toBe(1000);
  });

  it("restores notes, clips and the pattern slot on thaw", () => {
    const track = makeTrack();
    const frozen = buildFrozenTrack(track, {
      clipId: "frozen_1",
      durationSeconds: 2,
      tempo: 120,
      now: 1,
    });
    const thawed = restoreFrozenTrack(frozen);

    expect(isTrackFrozen(thawed)).toBe(false);
    expect(thawed.notes).toEqual(track.notes);
    expect(thawed.clips).toEqual(track.clips);
    expect(thawed.steps).toEqual(track.steps);
    expect(thawed.activePatternSlotId).toBe("slot-0");
    expect((thawed as any).frozenBackup).toBeUndefined();
  });

  it("is idempotent: freezing a frozen track and thawing a live one are no-ops", () => {
    const track = makeTrack();
    const frozen = buildFrozenTrack(track, {
      clipId: "frozen_1",
      durationSeconds: 2,
      tempo: 120,
      now: 1,
    });
    expect(
      buildFrozenTrack(frozen, {
        clipId: "frozen_2",
        durationSeconds: 4,
        tempo: 120,
        now: 2,
      }),
    ).toBe(frozen);
    expect(restoreFrozenTrack(track)).toBe(track);
  });
});
