import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { AiMixAssistantService } from './ai-mix-assistant.service';
import { MusicManagerService } from '../../services/music-manager.service';
import { AudioEngineService } from '../../services/audio-engine.service';
import { IdeasGeneratorService } from '../../services/ideas-generator.service';

describe('AiMixAssistantService.autoMaster', () => {
  let service: AiMixAssistantService;
  const engine = {
    ctx: { currentTime: 0 },
    setMasteringTargets: jest.fn(),
    configureCompressor: jest.fn(),
    configureLimiter: jest.fn(),
    setMasterToneEq: jest.fn(),
  };

  beforeEach(() => {
    engine.setMasteringTargets.mockClear();
    engine.configureCompressor.mockClear();
    engine.configureLimiter.mockClear();
    engine.setMasterToneEq.mockClear();

    TestBed.configureTestingModule({
      providers: [
        AiMixAssistantService,
        {
          provide: MusicManagerService,
          useValue: {
            tracks: signal([
              { id: 't1', name: '808 Bass', instrumentId: 'trap-808-elite' },
              { id: 't2', name: 'Hi-Hat', instrumentId: 'hi-hat' },
            ]),
          },
        },
        { provide: AudioEngineService, useValue: engine },
        { provide: IdeasGeneratorService, useValue: {} },
      ],
    });
    service = TestBed.inject(AiMixAssistantService);
  });

  it('applies the genre preset through the engine tone stage', () => {
    const report = service.autoMaster('trap');

    expect(report.length).toBeGreaterThan(0);
    // Trap preset: eqSub 3.0, eqLowMid -1.5, eqHighShelf 2.5.
    expect(engine.setMasterToneEq).toHaveBeenCalledWith({
      lowShelfDb: 3,
      lowMidDb: -1.5,
      highShelfDb: 2.5,
    });
    expect(engine.setMasteringTargets).toHaveBeenCalled();
    expect(engine.configureCompressor).toHaveBeenCalled();
    expect(engine.configureLimiter).toHaveBeenCalled();
  });

  it('is idempotent: repeated mastering passes never rewire the graph', () => {
    service.autoMaster('trap');
    service.autoMaster('trap');
    service.autoMaster('trap');

    // One idempotent engine call per run — no node allocation, no direct
    // `_preMasterGain` disconnect (which used to stack parallel paths into the
    // compressor and sever the master worklet).
    expect(engine.setMasterToneEq).toHaveBeenCalledTimes(3);
    expect((engine as Record<string, unknown>)['_preMasterGain']).toBeUndefined();
    expect((engine as Record<string, unknown>)['masterShelf']).toBeUndefined();
  });
});
