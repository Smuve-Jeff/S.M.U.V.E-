import { TestBed } from '@angular/core/testing';
import { MusicManagerService } from '../music-manager.service';
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
    service.ensureTrack('Grand Piano');
    service.ensureTrack('Synth Lead');
    const tracksBefore = [...service.tracks()];

    service.reorderTrack(0, 1);
    const tracksAfter = service.tracks();

    expect(tracksAfter[0].id).toBe(tracksBefore[1].id);
    expect(tracksAfter[1].id).toBe(tracksBefore[0].id);
  });

  it('should initialize with signals for structure and chords', () => {
    expect(service.structure()).toEqual([]);
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
  });
});
