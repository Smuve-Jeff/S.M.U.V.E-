import { TestBed } from '@angular/core/testing';
import {
  MusicManagerService,
  TrackModel,
  GlobalChord,
  SongSection,
} from '../music-manager.service';
import { AudioEngineService } from '../audio-engine.service';
import { InstrumentsService } from '../instruments.service';
import { UserProfileService } from '../user-profile.service';
import { LoggingService } from '../logging.service';
import { FileLoaderService } from '../file-loader.service';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { signal } from '@angular/core';

describe('PianoRoll & ChannelRack Upgrades', () => {
  let service: MusicManagerService;
  let instruments: InstrumentsService;

  beforeEach(() => {
    const mockEngine = {
      tempo: signal(120),
      loopStart: signal(0),
      loopEnd: signal(16),
      ensureTrack: jest.fn(),
      updateTrack: jest.fn(),
      onScheduleStep: null,
      isPlaying: () => false,
      ctx: {},
      playBuffer: jest.fn(),
      playSynth: jest.fn(),
      triggerAttack: jest.fn(),
      triggerSampler: jest.fn(),
      calculatePlaybackRate: () => 1,
      getContext: () => ({
        destination: {},
        currentTime: 0,
        createGain: () => ({
          gain: { setValueAtTime: () => {} },
          connect: () => {},
        }),
      }),
    };

    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        MusicManagerService,
        { provide: AudioEngineService, useValue: mockEngine },
        InstrumentsService,
        { provide: UserProfileService, useValue: { profile: () => ({}) } },
        LoggingService,
        FileLoaderService,
      ],
    });
    service = TestBed.inject(MusicManagerService);
    instruments = TestBed.inject(InstrumentsService);
  });

  it('should support audio tracks and track coloring', () => {
    const id = service.ensureTrack('synth-lead');
    service.setTrackColor(id, '#FF0000');

    const track = service.tracks().find((t) => t.id === id);
    expect(track?.color).toBe('#FF0000');
    expect(track?.type).toBe('midi');
  });

  it('should reorder tracks correctly', () => {
    service.ensureTrack('grand-piano-v2');
    service.ensureTrack('analog-warmth');
    const tracksBefore = [...service.tracks()];

    service.reorderTrack(0, 1);
    const tracksAfter = service.tracks();

    expect(tracksAfter[0].id).toBe(tracksBefore[1].id);
    expect(tracksAfter[1].id).toBe(tracksBefore[0].id);
  });

  it('should initialize with signals for structure and chords', () => {
    expect(service.structure().length).toBe(4);
    expect(service.chords()).toEqual([]);
  });

  it('stores track quality and per-step velocity accents', () => {
    const id = service.ensureTrack('synth-lead');
    service.setTrackQualityMode(id, 'performance');
    service.setStepVelocity(id, 3, 1.2);
    const track = service.tracks().find((t) => t.id === id);
    expect(track?.qualityMode).toBe('performance');
    expect(track?.stepVelocities?.[3]).toBe(1.2);
  });

  it('creates and recalls pattern slots with version snapshots', () => {
    const id = service.ensureTrack('analog-warmth');
    service.toggleStep(id, 0);
    service.createPatternSlot(id, 'Main');
    const track = service.tracks().find((t) => t.id === id);
    const mainSlot = track?.patternSlots?.find((s) => s.name === 'Main');
    expect(mainSlot).toBeTruthy();
    if (!mainSlot) return;

    service.toggleStep(id, 1);
    service.snapshotPatternVersion(id, mainSlot.id, 'V1');
    service.clearPatternLane(id);
    service.recallPatternSlot(id, mainSlot.id);

    const recalledTrack = service.tracks().find((t) => t.id === id);
    expect(
      recalledTrack?.patternSlots?.find((s) => s.name === 'Main')?.versions
        .length
    ).toBe(2);
    expect(recalledTrack?.steps[0]).toBe(true);
    expect(recalledTrack?.steps[1]).toBe(true);
  });

  it("stamps new clips with the track's active pattern", () => {
    const id = service.addTrack('Keys', 'analog-warmth', 'midi');
    service.addNoteToTrack(id, {
      id: 'n1',
      midi: 60,
      step: 0,
      length: 1,
      velocity: 0.8,
    });
    service.addClipToTrack(id, { start: 0, length: 4, type: 'midi' });
    const track = service.tracks().find((t) => t.id === id);
    expect(track?.clips[0]?.patternSlotId).toBe(track?.activePatternSlotId);
  });

  it('keeps a clip audible after a second pattern is created', () => {
    const id = service.addTrack('Keys', 'analog-warmth', 'midi');
    service.addNoteToTrack(id, {
      id: 'live-note',
      midi: 60,
      step: 0,
      length: 1,
      velocity: 0.8,
    });
    service.addClipToTrack(id, { start: 0, length: 4, type: 'midi' });
    service.createPatternSlot(id, 'Verse');

    const track = service.tracks().find((t) => t.id === id)!;
    // The clip is pinned to the slot that was active when it was drawn...
    expect(track.clips[0].patternSlotId).toBe('slot-0');
    // ...and switching patterns snapshot that slot, so the clip still sounds.
    const triggerSpy = jest.spyOn(service.engine, 'triggerAttack');
    service.playStep(0, 0, 0.125);
    expect(triggerSpy).toHaveBeenCalled();
  });

  it('mutes a clip whose referenced pattern holds nothing', () => {
    const id = service.addTrack('Keys', 'analog-warmth', 'midi');
    service.addNoteToTrack(id, {
      id: 'live-note',
      midi: 60,
      step: 0,
      length: 1,
      velocity: 0.8,
    });
    service.addClipToTrack(id, { start: 0, length: 4, type: 'midi' });
    const emptySlot = service.createPatternSlot(id, 'Empty');
    // Wipe the live pattern, snapshot it, then point the clip at that slot.
    service.replaceTrackNotes(id, []);
    service.snapshotPatternVersion(id, emptySlot!, 'cleared');
    const clipId = service.tracks()[0].clips[0].id;
    service.setClipPattern(id, clipId, emptySlot!);

    const triggerSpy = jest.spyOn(service.engine, 'triggerAttack');
    service.playStep(0, 0, 0.125);
    expect(triggerSpy).not.toHaveBeenCalled();
  });

  it('re-points a clip at another pattern and the change is undoable', () => {
    const id = service.addTrack('Keys', 'analog-warmth', 'midi');
    service.addClipToTrack(id, { start: 0, length: 4, type: 'midi' });
    const clipId = service.tracks()[0].clips[0].id;
    const originalSlot = service.tracks()[0].clips[0].patternSlotId;

    const slotA = service.createPatternSlot(id, 'A')!;
    service.createPatternSlot(id, 'B');
    const activeBefore = service.tracks()[0].activePatternSlotId;

    service.setClipPattern(id, clipId, slotA);
    const pointed = service.tracks().find((t) => t.id === id)!;
    expect(pointed.clips[0].patternSlotId).toBe(slotA);
    expect(pointed.activePatternSlotId).toBe(slotA);

    service.history.undo();
    const undone = service.tracks().find((t) => t.id === id)!;
    expect(undone.clips[0].patternSlotId).toBe(originalSlot);
    expect(undone.activePatternSlotId).toBe(activeBefore);
  });

  it('deep-clones a channel with notes, steps and pattern slots', () => {
    const id = service.addTrack('Keys', 'analog-warmth', 'midi');
    service.addNoteToTrack(id, {
      id: 'orig-note',
      midi: 64,
      step: 2,
      length: 1,
      velocity: 0.9,
    });
    service.addClipToTrack(id, { start: 0, length: 2, type: 'midi' });
    const clonedId = service.cloneTrack(id)!;
    expect(clonedId).toBeTruthy();
    expect(clonedId).not.toBe(id);

    const original = service.tracks().find((t) => t.id === id)!;
    const clone = service.tracks().find((t) => t.id === clonedId)!;
    expect(clone.name).toContain('(Copy)');
    expect(clone.notes).toHaveLength(1);
    expect(clone.notes[0].midi).toBe(64);
    expect(clone.notes[0].id).not.toBe(original.notes[0].id);
    expect(clone.clips).toHaveLength(1);
    expect(clone.clips[0].id).not.toBe(original.clips[0].id);
    expect(clone.patternSlots?.length).toBe(original.patternSlots?.length);
    expect(clone.muted).toBe(false);
    expect(clone.soloed).toBe(false);
  });

  it('gives a drum-type track the canonical drum id once, never twice', () => {
    const first = service.addTrack('Drums', 'trap-808-elite', 'drum');
    expect(first).toBe('track_drums_100');
    const second = service.addTrack('Perc', 'steel-drum-island', 'drum');
    expect(second).not.toBe('track_drums_100');
    expect(service.tracks().filter((t) => t.id === 'track_drums_100'))
      .toHaveLength(1);
  });

  it('gates playback in steps so a mid-bar clip starts on time', () => {
    const id = service.addTrack('Keys', 'analog-warmth', 'midi');
    service.addNoteToTrack(id, {
      id: 'half-note',
      midi: 72,
      step: 0,
      length: 1,
      velocity: 0.8,
    });
    // Clip drawn at bar 8.5 → starts on step 136.
    service.addClipToTrack(id, {
      start: 8.5,
      length: 2,
      type: 'midi',
    } as never);
    const triggerSpy = jest.spyOn(service.engine, 'triggerAttack');

    service.playStep(128, 0, 0.125); // bar 8: BEFORE the clip — silent
    expect(triggerSpy).not.toHaveBeenCalled();
    service.playStep(136, 0, 0.125); // bar 8.5: clip start — plays
    expect(triggerSpy).toHaveBeenCalled();
  });

  it('provides instrument quality metadata and fallback for sample presets', () => {
    const grandPiano = instruments
      .getPresets()
      .find((p) => p.id === 'grand-piano');
    expect(grandPiano?.sampleQuality).toBe('high');
    expect(grandPiano?.fallbackPresetId).toBe('stage-piano');
    expect(grandPiano?.zones?.[0]?.velLayers?.length).toBeGreaterThan(0);
  });
});
