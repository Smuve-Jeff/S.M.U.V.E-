import { TestBed } from '@angular/core/testing';
import { SequencerService } from './sequencer.service';
import { AiService } from '../services/ai.service';
import { MusicManagerService } from '../services/music-manager.service';
import { AudioEngineService } from '../services/audio-engine.service';
import { signal } from '@angular/core';

describe('SequencerService', () => {
  let service: SequencerService;
  let aiServiceMock: any;
  let musicManagerMock: any;
  let engineMock: any;

  beforeEach(() => {
    aiServiceMock = {
      isAIDrummerActive: signal(false),
      isAIBassistActive: signal(false),
      isAIKeyboardistActive: signal(false),
    };
    musicManagerMock = {
      tracks: signal([]),
    };
    engineMock = {
      playSynth: jest.fn(),
    };

    TestBed.configureTestingModule({
      providers: [
        SequencerService,
        { provide: AiService, useValue: aiServiceMock },
        { provide: MusicManagerService, useValue: musicManagerMock },
        { provide: AudioEngineService, useValue: engineMock },
      ],
    });

    service = TestBed.inject(SequencerService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('does NOT hijack the engine scheduler on construction', () => {
    // Regression: SequencerService used to overwrite engine.onScheduleStep in
    // its constructor. MusicManagerService registers the real step scheduler
    // the same way, so whichever service was instantiated last won and ALL
    // playback could silently stop. The hook must stay dormant until
    // activate() is explicitly called.
    expect(engineMock.onScheduleStep).toBeUndefined();
    expect(service.isActive()).toBe(false);
  });

  it('activate() registers the engine hook exactly once', () => {
    service.activate();
    expect(engineMock.onScheduleStep).toBeDefined();
    const first = engineMock.onScheduleStep;
    service.activate();
    expect(engineMock.onScheduleStep).toBe(first);
    expect(service.isActive()).toBe(true);
  });

  describe('SequencerService advanced features', () => {
    it('supports scheduling', () => {
      service.scheduleTick(0, 10, 0.25);
      expect(engineMock.playSynth).toHaveBeenCalled();
    });

    it('responds to AI musicians', () => {
      aiServiceMock.isAIDrummerActive.set(true);
      service.scheduleTick(0, 10, 0.25);
      expect(engineMock.playSynth).toHaveBeenCalledWith(0, 10, 0.25, 0.8, 0);
    });
  });
});
