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
    (globalThis.URL as any).createObjectURL ??= jest.fn(() => 'blob:mock');
    (globalThis.URL as any).revokeObjectURL ??= jest.fn();
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

  it('applies stretch/pitch/fade metadata when rendering edits', async () => {
    const buf = makeBuffer(service.audioEngine.ctx, 22050);
    const imported: any = {
      id: 'a1',
      name: 'clip',
      buffer: buf,
      blob: new Blob(),
      url: 'blob:raw',
      duration: buf.duration,
      sampleRate: buf.sampleRate,
      channels: buf.numberOfChannels,
      trimStart: 0,
      trimEnd: 1,
      gain: 1,
      stretchRatio: 1.25,
      pitchSemitones: 2,
      fadeIn: 0.05,
      fadeOut: 0.05,
      loopStart: 0,
      loopEnd: 1,
      normalize: true,
      editedBlob: null,
      editedUrl: null,
    };
    service.importedAudio.set([imported]);
    service.selectedAudio.set(imported);
    const blob = await service.applyEdits();
    expect(blob).toBeTruthy();
    expect(service.selectedAudio()?.editedBlob).toBeTruthy();
  });

  it('cancelEdits restores the last applied settings', async () => {
    const buf = makeBuffer(service.audioEngine.ctx, 4096);
    const imported: any = {
      id: 'a2',
      name: 'clip',
      buffer: buf,
      blob: new Blob(),
      url: 'blob:raw2',
      duration: buf.duration,
      sampleRate: buf.sampleRate,
      channels: buf.numberOfChannels,
      trimStart: 0,
      trimEnd: 1,
      gain: 1,
      stretchRatio: 1,
      pitchSemitones: 0,
      fadeIn: 0,
      fadeOut: 0,
      loopStart: 0,
      loopEnd: 1,
      normalize: false,
      editedBlob: null,
      editedUrl: null,
    };
    service.importedAudio.set([imported]);
    service.selectedAudio.set(imported);
    await service.applyEdits();
    service.setGain(1.8);
    expect(service.selectedAudio()?.gain).toBeCloseTo(1.8);
    service.cancelEdits();
    expect(service.selectedAudio()?.gain).toBeCloseTo(1);
  });

  it('removeAudio revokes urls for cleanup', () => {
    const revokeSpy = jest.spyOn(URL, 'revokeObjectURL');
    const imported: any = {
      id: 'a3',
      name: 'clip',
      buffer: makeBuffer(service.audioEngine.ctx, 1024),
      blob: new Blob(),
      url: 'blob:raw3',
      duration: 1,
      sampleRate: 44100,
      channels: 1,
      trimStart: 0,
      trimEnd: 1,
      gain: 1,
      stretchRatio: 1,
      pitchSemitones: 0,
      fadeIn: 0,
      fadeOut: 0,
      loopStart: 0,
      loopEnd: 1,
      normalize: false,
      editedBlob: null,
      editedUrl: 'blob:edited3',
    };
    service.importedAudio.set([imported]);
    service.selectedAudio.set(imported);
    service.removeAudio('a3');
    expect(revokeSpy).toHaveBeenCalledWith('blob:raw3');
    expect(revokeSpy).toHaveBeenCalledWith('blob:edited3');
  });
});
