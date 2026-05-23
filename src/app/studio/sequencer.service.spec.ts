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
