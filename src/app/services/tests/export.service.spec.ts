import { TestBed } from '@angular/core/testing';
import { ExportService } from '../export.service';
import { AudioEngineService } from '../audio-engine.service';

describe('ExportService', () => {
  let service: ExportService;
  let audioEngineMock: any;

  beforeEach(() => {
    audioEngineMock = {
      getContext: jest.fn().mockReturnValue({
        sampleRate: 44100,
        createBuffer: jest.fn().mockReturnValue({
          numberOfChannels: 2,
          length: 44100,
          sampleRate: 44100,
          getChannelData: jest.fn().mockReturnValue(new Float32Array(44100)),
        }),
      }),
      resume: jest.fn(),
      getMasterStream: jest.fn().mockReturnValue({
        stream: {},
      }),
    };

    TestBed.configureTestingModule({
      providers: [
        ExportService,
        { provide: AudioEngineService, useValue: audioEngineMock },
      ],
    });
    service = TestBed.inject(ExportService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should correctly encode AudioBuffer to WAV', () => {
    const sampleRate = 44100;
    const length = 100;
    const buffer = {
      numberOfChannels: 1,
      sampleRate: sampleRate,
      length: length,
      getChannelData: (c: number) => new Float32Array(length).fill(0.5),
    } as any;

    const wavArrayBuffer = service.audioBufferToWav(buffer);
    const view = new DataView(wavArrayBuffer);

    // Check RIFF header
    expect(view.getUint8(0)).toBe('R'.charCodeAt(0));
    expect(view.getUint8(1)).toBe('I'.charCodeAt(0));
    expect(view.getUint8(2)).toBe('F'.charCodeAt(0));
    expect(view.getUint8(3)).toBe('F'.charCodeAt(0));

    // Check WAVE header
    expect(view.getUint8(8)).toBe('W'.charCodeAt(0));
    expect(view.getUint8(9)).toBe('A'.charCodeAt(0));
    expect(view.getUint8(10)).toBe('V'.charCodeAt(0));
    expect(view.getUint8(11)).toBe('E'.charCodeAt(0));

    // Check sample rate at offset 24
    expect(view.getUint32(24, true)).toBe(sampleRate);

    // Check bits per sample at offset 34
    expect(view.getUint16(34, true)).toBe(32);
  });
});
