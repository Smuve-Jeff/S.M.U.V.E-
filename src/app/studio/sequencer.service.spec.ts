import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { SequencerService } from './sequencer.service';
import { InstrumentsService } from '../services/instruments.service';
import { AudioEngineService } from '../services/audio-engine.service';
import { LoggingService } from '../services/logging.service';
import { AiService } from '../services/ai.service';

describe('SequencerService advanced features', () => {
  let service: SequencerService;
  let randomSpy: jest.SpyInstance<number, []>;
  const engineMock = {
    playSynth: jest.fn(),
    ensureTrack: jest.fn(),
    updateTrack: jest.fn(),
    tempo: signal(120),
    currentBeat: signal(0),
    stepsPerBeat: signal(4),
    loopEnd: signal(64),
    onScheduleStep: undefined,
    playMetronomeClick: jest.fn(),
    ctx: { currentTime: 0 },
  };

  const aiServiceMock = {
    isAIDrummerActive: signal(false),
    isAIBassistActive: signal(false),
    isAIKeyboardistActive: signal(false),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0.5);
    TestBed.configureTestingModule({
      providers: [
        SequencerService,
        {
          provide: InstrumentsService,
          useValue: {
            getPresets: () => [{ id: 'kit-808', type: 'synth', synth: {} }],
          },
        },
        { provide: AudioEngineService, useValue: engineMock },
        { provide: LoggingService, useValue: { info: jest.fn() } },
        { provide: AiService, useValue: aiServiceMock },
      ],
    });
    service = TestBed.inject(SequencerService);
  });

  afterEach(() => {
    randomSpy.mockRestore();
  });

  it('supports scheduling', () => {
    service.scheduleTick(0, 10, 0.25);
    expect(engineMock.playSynth).toHaveBeenCalled();
  });

  it('responds to AI musicians', () => {
    aiServiceMock.isAIDrummerActive.set(true);
    service.scheduleTick(0, 10, 0.25); // Kick on 0
    expect(engineMock.playSynth).toHaveBeenCalledWith(
      10,
      expect.any(Number),
      0.125,
      0.8,
      0
    );
  });
});
