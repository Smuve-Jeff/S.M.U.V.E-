import { TestBed } from '@angular/core/testing';
import {
  WhisperTranscriptionService,
  WHISPER_SAMPLE_RATE,
} from './whisper-transcription.service';
import { LoggingService } from './logging.service';

describe('WhisperTranscriptionService.transcribeAudio', () => {
  let svc: WhisperTranscriptionService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        WhisperTranscriptionService,
        { provide: LoggingService, useValue: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } },
      ],
    });
    svc = TestBed.inject(WhisperTranscriptionService);
  });

  it('chunks audio and builds cues offset by the timeline position', async () => {
    const calls: number[] = [];
    svc.modelLoader = async () => ({
      transcriber: async (audio: Float32Array) => {
        calls.push(audio.length);
        return { text: 'hello world' };
      },
    });
    // 35 seconds of audio -> one 30s chunk + one 5s chunk.
    const audio = new Float32Array(35 * WHISPER_SAMPLE_RATE).fill(0.1);
    const cues = await svc.transcribeAudio(audio, 100);
    expect(calls).toHaveLength(2);
    expect(cues).toHaveLength(2);
    expect(cues[0].start).toBe(100);
    expect(cues[0].text).toBe('hello world');
    expect(cues[1].start).toBe(130);
    expect(cues[1].end).toBeGreaterThan(cues[1].start);
  });

  it('skips empty transcripts and tiny trailing audio', async () => {
    svc.modelLoader = async () => ({
      transcriber: async () => ({ text: '   ' }),
    });
    const audio = new Float32Array(WHISPER_SAMPLE_RATE * 2).fill(0.1);
    await expect(svc.transcribeAudio(audio)).resolves.toEqual([]);
  });

  it('honours abort between chunks', async () => {
    svc.modelLoader = async () => ({
      transcriber: async () => ({ text: 'speech' }),
    });
    const controller = new AbortController();
    controller.abort();
    const audio = new Float32Array(WHISPER_SAMPLE_RATE * 31).fill(0.1);
    await expect(
      svc.transcribeAudio(audio, 0, { signal: controller.signal }),
    ).rejects.toThrow(/cancelled/i);
  });
});
