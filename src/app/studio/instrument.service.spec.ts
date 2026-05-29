import { TestBed } from '@angular/core/testing';

import { AudioEngineService } from '../services/audio-engine.service';
import { InstrumentService } from './instrument.service';

describe('InstrumentService', () => {
  let service: InstrumentService;
  let engineMock: {
    compressor: object;
    ctx: { currentTime: number };
    masterGain: { connect: jest.Mock };
    triggerAttack: jest.Mock;
    setMasterOutputLevel: jest.Mock;
  };

  beforeEach(() => {
    engineMock = {
      compressor: {},
      ctx: { currentTime: 12 },
      masterGain: { connect: jest.fn() },
      triggerAttack: jest.fn(),
      setMasterOutputLevel: jest.fn(),
    };

    TestBed.configureTestingModule({
      providers: [
        InstrumentService,
        { provide: AudioEngineService, useValue: engineMock },
      ],
    });

    service = TestBed.inject(InstrumentService);
  });

  it('creates without requiring the music manager service', () => {
    expect(service).toBeTruthy();
  });

  it('converts MIDI notes to frequency when triggering playback', () => {
    service.play(7, 69, 0.5);

    expect(engineMock.triggerAttack).toHaveBeenCalledWith(
      7,
      440,
      12,
      0.5,
      0.5,
      0.8,
      0,
      0,
      0,
      { type: 'sine' }
    );
  });
});
