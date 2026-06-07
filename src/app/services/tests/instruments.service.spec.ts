import { TestBed } from '@angular/core/testing';
import { InstrumentsService } from '../instruments.service';
import { AudioEngineService } from '../audio-engine.service';

describe('InstrumentsService', () => {
  let service: InstrumentsService;

  beforeEach(() => {
    const mockEngine = {
      ctx: {},
      logger: { info: jest.fn(), error: jest.fn() },
    };

    TestBed.configureTestingModule({
      providers: [
        InstrumentsService,
        { provide: AudioEngineService, useValue: mockEngine },
      ],
    });
    service = TestBed.inject(InstrumentsService);
  });

  it('provides instrument quality metadata for sample presets', () => {
    const grandPiano = service
      .getPresets()
      .find((p) => p.id === 'grand-piano-v2');
    expect(grandPiano?.sampleQuality).toBe('high');
    expect(grandPiano?.zones?.length).toBeGreaterThan(0);
  });
});
