import { TestBed } from '@angular/core/testing';
import { AudioImportService } from './audio-import.service';
import { FileLoaderService } from '../services/file-loader.service';
import { AudioEngineService } from '../services/audio-engine.service';
import { MusicManagerService } from '../services/music-manager.service';
import { LoggingService } from '../services/logging.service';
import { SnackbarService } from '../services/snackbar.service';

describe('AudioImportService (stretch engine)', () => {
  let service: AudioImportService;

  function makeBuffer(
    ctx: any,
    samples: number,
    freq = 440,
    sampleRate = 44100
  ): AudioBuffer {
    const buf = ctx.createBuffer(1, samples, sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < samples; i++) {
      data[i] = Math.sin((2 * Math.PI * freq * i) / sampleRate);
    }
    return buf;
  }

  beforeEach(() => {
    const ctx = {
      sampleRate: 44100,
      currentTime: 0,
      createBuffer: jest.fn((channels: number, length: number, sr: number) => {
        const channelData: Float32Array[] = [];
        for (let c = 0; c < channels; c++) {
          channelData.push(new Float32Array(length));
        }
        return {
          numberOfChannels: channels,
          length,
          sampleRate: sr,
          duration: length / sr,
          getChannelData: (c: number) => channelData[c],
          copyToChannel: (
            data: Float32Array,
            c: number,
            offset = 0
          ) => {
            channelData[c].set(data, offset);
          },
        };
      }),
    } as any;

    const audioEngineMock = {
      ctx,
    } as any;

    TestBed.configureTestingModule({
      providers: [
        AudioImportService,
        { provide: FileLoaderService, useValue: { pickLocalFiles: jest.fn() } },
        { provide: AudioEngineService, useValue: audioEngineMock },
        { provide: MusicManagerService, useValue: {} },
        { provide: LoggingService, useValue: { warn: jest.fn(), error: jest.fn() } },
        { provide: SnackbarService, useValue: { warning: jest.fn(), error: jest.fn(), success: jest.fn() } },
      ],
    });
    service = TestBed.inject(AudioImportService);
  });

  it('should create', () => {
    expect(service).toBeTruthy();
  });

  it('should time-stretch a buffer by 2x (slower)', () => {
    const buf = makeBuffer(service.audioEngine.ctx, 44100);
    const out = service.stretchBuffer(buf, 2);
    expect(out.length).toBeGreaterThan(buf.length * 1.85);
    expect(out.numberOfChannels).toBe(1);
    expect(out.sampleRate).toBe(44100);
  });

  it('should time-stretch a buffer by 0.5x (faster)', () => {
    const buf = makeBuffer(service.audioEngine.ctx, 44100);
    const out = service.stretchBuffer(buf, 0.5);
    expect(out.length).toBeLessThan(buf.length * 0.6);
    expect(out.length).toBeGreaterThan(buf.length * 0.4);
  });

  it('should pitch-shift by semitones preserving duration', () => {
    const buf = makeBuffer(service.audioEngine.ctx, 44100);
    const out = service.pitchShiftBuffer(buf, 12);
    expect(out.length).toBeGreaterThan(buf.length * 0.8);
    expect(out.length).toBeLessThan(buf.length * 1.2);
  });

  it('should tempo-match a faster source to a slower target (lengthen)', () => {
    const buf = makeBuffer(service.audioEngine.ctx, 44100);
    const out = service.tempoMatchBuffer(buf, 140, 70);
    expect(out.length).toBeGreaterThan(buf.length * 1.85);
  });

  it('should tempo-match a slower source to a faster target (shorten)', () => {
    const buf = makeBuffer(service.audioEngine.ctx, 44100);
    const out = service.tempoMatchBuffer(buf, 60, 120);
    expect(out.length).toBeLessThan(buf.length * 0.6);
  });

  it('should keep imported-audio state empty by default', () => {
    expect(service.importedAudio().length).toBe(0);
    expect(service.totalDuration()).toBe(0);
    expect(service.isLoading()).toBe(false);
  });
});
