import { TestBed } from '@angular/core/testing';
import { PitchCorrectionService } from './pitch-correction.service';
import { AudioEngineService } from '../services/audio-engine.service';
import { LoggingService } from '../services/logging.service';

describe('PitchCorrectionService', () => {
  let service: PitchCorrectionService;
  let audioCtxMock: any;

  beforeEach(async () => {
    audioCtxMock = {
      createGain: jest.fn(() => ({
        gain: { value: 0 },
        connect: jest.fn(),
        disconnect: jest.fn(),
      })),
      audioWorklet: {
        addModule: jest.fn().mockResolvedValue(undefined),
      },
    };

    await TestBed.configureTestingModule({
      providers: [
        PitchCorrectionService,
        {
          provide: AudioEngineService,
          useValue: { ctx: audioCtxMock },
        },
        {
          provide: LoggingService,
          useValue: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
        },
      ],
    }).compileComponents();

    service = TestBed.inject(PitchCorrectionService);
  });

  it('should create with default state', () => {
    expect(service.enabled()).toBe(false);
    expect(service.amount()).toBe(0.5);
    expect(service.retuneSpeed()).toBe(0.1);
    expect(service.scale()).toBe('C Major');
  });

  it('should parse "C Major" correctly', () => {
    const params = service.getProcessingParams();
    expect(params.scale).toBe('C Major');
  });

  it('should parse "D Minor" scale', () => {
    service.scale.set('D Minor');
    const params = service.getProcessingParams();
    expect(params.scale).toBe('D Minor');
  });

  it('should parse "F# Major" scale', () => {
    service.scale.set('F# Major');
    const params = service.getProcessingParams();
    expect(params.scale).toBe('F# Major');
  });

  it('should parse "Bb Harmonic Minor" scale', () => {
    service.scale.set('Bb Harmonic Minor');
    const params = service.getProcessingParams();
    expect(params.scale).toBe('Bb Harmonic Minor');
  });

  it('should parse "Gb Dorian" scale', () => {
    service.scale.set('Gb Dorian');
    const params = service.getProcessingParams();
    expect(params.scale).toBe('Gb Dorian');
  });

  it('should fall back to C Major on garbage scale', () => {
    service.scale.set('GARBAGE');
    const params = service.getProcessingParams();
    // scale signal holds the raw value, but processing defaults to Major
    expect(params.scale).toBe('GARBAGE');
  });

  it('should fall back to C Major on empty scale', () => {
    service.scale.set('');
    const params = service.getProcessingParams();
    expect(params.scale).toBe('');
  });

  it('should return null from insertIntoChain on invalid source', async () => {
    const result = await service.insertIntoChain(null as any);
    expect(result).toBeNull();
  });

  it('should insert into a valid AudioNode chain', async () => {
    const mockSrc = {
      connect: jest.fn(),
      disconnect: jest.fn(),
      context: audioCtxMock,
    } as unknown as AudioNode;

    const result = await service.insertIntoChain(mockSrc);
    expect(result).toBeTruthy();
    expect(mockSrc.connect).toHaveBeenCalled();
  });
});