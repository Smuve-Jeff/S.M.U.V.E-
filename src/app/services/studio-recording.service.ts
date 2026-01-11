import { Injectable, signal } from '@angular/core';
import { AudioEngineService } from './audio-engine.service';

export type RecordingFormat =
  | 'audio/webm;codecs=opus'
  | 'audio/webm'
  | 'audio/wav'
  | 'audio/mp3';

export interface RecordedTake {
  id: string;
  name: string;
  startedAt: number;
  durationMs: number;
  format: RecordingFormat;
  blob: Blob;
  channels: string[];
}

@Injectable({ providedIn: 'root' })
export class StudioRecordingService {
  private mediaRecorder: MediaRecorder | null = null;
  private chunks: BlobPart[] = [];
  private startTime = 0;
  private armedChannels: string[] = [];

  isRecording = signal(false);
  elapsedMs = signal(0);
  takes = signal<RecordedTake[]>([]);

  constructor(private readonly audioEngine: AudioEngineService) {}

  getSupportedFormats(): RecordingFormat[] {
    const candidates: RecordingFormat[] = [
      'audio/mp3',
      'audio/wav',
      'audio/webm;codecs=opus',
      'audio/webm',
    ];
    return candidates.filter(
      (type) =>
        typeof MediaRecorder !== 'undefined' &&
        MediaRecorder.isTypeSupported(type)
    );
  }

  async startRecording(
    format: RecordingFormat,
    channels: string[],
    name: string
  ): Promise<void> {
    if (this.isRecording()) {
      await this.stopRecording();
    }

    const streamDestination = this.audioEngine.getMasterStream();
    const stream = streamDestination.stream;

    const options: MediaRecorderOptions = { mimeType: format };
    try {
      this.mediaRecorder = new MediaRecorder(stream, options);
    } catch (error) {
      console.warn(
        'Falling back to browser default recording mime type',
        error
      );
      this.mediaRecorder = new MediaRecorder(stream);
    }

    this.chunks = [];
    this.startTime = performance.now();
    this.armedChannels = channels;
    this.mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        this.chunks.push(event.data);
      }
    };
    this.mediaRecorder.onstop = () => {
      this.saveTake(name, format);
    };
    this.mediaRecorder.start();
    this.isRecording.set(true);
    this.tickElapsed();
  }

  async stopRecording(): Promise<void> {
    if (!this.mediaRecorder || this.mediaRecorder.state === 'inactive') return;
    return new Promise((resolve) => {
      this.mediaRecorder!.addEventListener(
        'stop',
        () => {
          this.isRecording.set(false);
          resolve();
        },
        { once: true }
      );
      this.mediaRecorder!.stop();
    });
  }

  deleteTake(id: string): void {
    this.takes.update((list) => list.filter((take) => take.id !== id));
  }

  private saveTake(name: string, format: RecordingFormat): void {
    const blob = new Blob(this.chunks, {
      type: this.mediaRecorder?.mimeType || format,
    });
    const durationMs = performance.now() - this.startTime;
    const take: RecordedTake = {
      id: crypto.randomUUID(),
      name,
      startedAt: this.startTime,
      durationMs,
      format: (this.mediaRecorder?.mimeType as RecordingFormat) || format,
      blob,
      channels: this.armedChannels,
    };
    this.takes.update((list) => [take, ...list]);
    this.elapsedMs.set(0);
    this.chunks = [];
    this.mediaRecorder = null;
  }

  private tickElapsed(): void {
    if (!this.isRecording()) return;
    this.elapsedMs.set(performance.now() - this.startTime);
    requestAnimationFrame(() => this.tickElapsed());
  }
}
