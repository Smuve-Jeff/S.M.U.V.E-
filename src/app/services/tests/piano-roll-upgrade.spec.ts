import { TestBed } from '@angular/core/testing';
import { MusicManagerService, TrackModel, GlobalChord, SongSection } from '../music-manager.service';
import { AudioEngineService } from '../audio-engine.service';
import { InstrumentsService } from '../instruments.service';
import { UserProfileService } from '../user-profile.service';
import { LoggingService } from '../logging.service';
import { FileLoaderService } from '../file-loader.service';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { signal } from '@angular/core';

describe('PianoRoll & ChannelRack Upgrades', () => {
  let service: MusicManagerService;

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
      playSynth: jest.fn()
    };

    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        MusicManagerService,
        { provide: AudioEngineService, useValue: mockEngine },
        InstrumentsService,
        { provide: UserProfileService, useValue: { profile: () => ({}) } },
        LoggingService,
        FileLoaderService
      ]
    });
    service = TestBed.inject(MusicManagerService);
  });

  it('should support audio tracks and track coloring', () => {
    const id = service.ensureTrack('synth-lead');
    service.setTrackColor(id, '#FF0000');

    const track = service.tracks().find(t => t.id === id);
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
});
