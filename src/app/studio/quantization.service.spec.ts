import { TestBed } from '@angular/core/testing';
import { QuantizationService } from './quantization.service';
import { LoggingService } from '../services/logging.service';

describe('QuantizationService', () => {
  let service: QuantizationService;

  const notes = [
    { id: 'n1', midi: 60, step: 1.37, length: 1, velocity: 0.8 },
    { id: 'n2', midi: 64, step: 1.88, length: 1, velocity: 0.8 },
  ];

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        QuantizationService,
        {
          provide: LoggingService,
          useValue: { info: jest.fn(), warn: jest.fn() },
        },
      ],
    });
    service = TestBed.inject(QuantizationService);
  });

  it('quantizes straight notes to the selected grid', () => {
    const result = service.quantizeNotes(notes as any, 'straight_1_16');
    expect(result.quantized[0].step).toBeCloseTo(1.375, 5);
    expect(result.quantized[1].step).toBeCloseTo(1.875, 5);
    expect(result.changedCount).toBeGreaterThan(0);
  });

  it('applies swing to odd grid positions', () => {
    const result = service.quantizeNotes(
      [{ ...notes[0], step: 0.18 }] as any,
      'swing_1_16_75'
    );
    expect(result.quantized[0].step).toBeGreaterThan(0.1);
  });

  it('supports deterministic humanization with seed', () => {
    const first = service.quantizeNotes(
      [{ ...notes[0] }] as any,
      'human_medium',
      { seed: 42 }
    );
    const second = service.quantizeNotes(
      [{ ...notes[0] }] as any,
      'human_medium',
      { seed: 42 }
    );
    expect(first.quantized[0].step).toBeCloseTo(second.quantized[0].step, 8);
  });

  it('applies groove offsets when provided', () => {
    const result = service.quantizeNotes(
      [{ ...notes[0], step: 0.25 }] as any,
      'straight_1_16',
      { grooveOffsets: [0.5] }
    );
    expect(result.quantized[0].step).toBeCloseTo(0.28125, 5);
  });

  it('supports retroactive quantize options', () => {
    const result = service.retroactiveQuantize(
      [{ ...notes[0] }] as any,
      'human_tight',
      { seed: 7 }
    );
    expect(result.quantized).toHaveLength(1);
  });

  it('returns unchanged notes for unknown preset', () => {
    const result = service.quantizeNotes(notes as any, 'missing');
    expect(result.changedCount).toBe(0);
    expect(result.quantized[0].step).toBe(notes[0].step);
  });
});
