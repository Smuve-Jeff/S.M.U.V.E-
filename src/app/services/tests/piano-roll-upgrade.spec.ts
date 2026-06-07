import { TestBed } from '@angular/core/testing';
<<<<<<< HEAD
import {
  MusicManagerService,
  TrackModel,
  GlobalChord,
  SongSection,
} from '../music-manager.service';
=======
import { MusicManagerService } from '../music-manager.service';
>>>>>>> origin/main
import { AudioEngineService } from '../audio-engine.service';
import { InstrumentsService } from '../instruments.service';
import { UserProfileService } from '../user-profile.service';
import { LoggingService } from '../logging.service';
import { FileLoaderService } from '../file-loader.service';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { signal } from '@angular/core';

describe('PianoRoll & ChannelRack Upgrades', () => {
  let service: MusicManagerService;
<<<<<<< HEAD
  let instruments: InstrumentsService;
=======
>>>>>>> origin/main

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
<<<<<<< HEAD
=======
      getContext: () => ({
        destination: {},
        currentTime: 0,
        createGain: () => ({
          gain: { setValueAtTime: () => {} },
          connect: () => {},
        }),
      }),
>>>>>>> origin/main
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
<<<<<<< HEAD
    instruments = TestBed.inject(InstrumentsService);
=======
>>>>>>> origin/main
  });

  it('should support audio tracks and track coloring', () => {
    const id = service.ensureTrack('synth-lead');
    service.setTrackColor(id, '#FF0000');

    const track = service.tracks().find((t) => t.id === id);
    expect(track?.color).toBe('#FF0000');
    expect(track?.type).toBe('midi');
  });

  it('should reorder tracks correctly', () => {
<<<<<<< HEAD
    service.ensureTrack('Grand Piano');
    service.ensureTrack('Synth Lead');
=======
    service.ensureTrack('grand-piano-v2');
    service.ensureTrack('analog-warmth');
>>>>>>> origin/main
    const tracksBefore = [...service.tracks()];

    service.reorderTrack(0, 1);
    const tracksAfter = service.tracks();

    expect(tracksAfter[0].id).toBe(tracksBefore[1].id);
    expect(tracksAfter[1].id).toBe(tracksBefore[0].id);
  });

  it('should initialize with signals for structure and chords', () => {
<<<<<<< HEAD
    expect(service.structure()).toEqual([]);
=======
    expect(service.structure().length).toBe(4);
>>>>>>> origin/main
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
<<<<<<< HEAD
    const id = service.ensureTrack('synth-lead');
    service.toggleStep(id, 0);
    service.createPatternSlot(id, 'Main');
    const firstSlot = service.tracks().find((t) => t.id === id)
      ?.patternSlots?.[0];
    expect(firstSlot).toBeTruthy();
    if (!firstSlot) return;

    service.toggleStep(id, 1);
    service.snapshotPatternVersion(id, firstSlot.id, 'V1');
    service.clearPatternLane(id);
    service.recallPatternSlot(id, firstSlot.id);

    const recalledTrack = service.tracks().find((t) => t.id === id);
    expect(recalledTrack?.patternSlots?.[0].versions.length).toBe(1);
    expect(recalledTrack?.steps[0]).toBe(true);
  });

  it('provides instrument quality metadata and fallback for sample presets', () => {
    const grandPiano = instruments
      .getPresets()
      .find((p) => p.id === 'grand-piano');
    expect(grandPiano?.sampleQuality).toBe('high');
    expect(grandPiano?.fallbackPresetId).toBe('stage-piano');
    expect(grandPiano?.zones?.[0]?.velLayers?.length).toBeGreaterThan(0);
=======
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
>>>>>>> origin/main
  });
});
