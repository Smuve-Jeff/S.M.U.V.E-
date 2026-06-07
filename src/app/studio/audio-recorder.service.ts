import { Subject } from 'rxjs';
import { Injectable, inject, signal } from '@angular/core';
import { LocalStorageService } from '../services/local-storage.service';
import { LoggingService } from '../services/logging.service';

<<<<<<< HEAD
=======
export interface RecordingSettings {
  gain?: number;
  trimmed?: boolean;
  [key: string]: any;
}

export interface RecordingItem {
  id: string;
  blob: Blob;
  name: string;
  timestamp: number;
  settings: RecordingSettings;
}

>>>>>>> origin/main
@Injectable({
  providedIn: 'root',
})
export class AudioRecorderService {
  private localStorageService = inject(LocalStorageService);
  private logger = inject(LoggingService);

  isRecording = signal(false);
  recordedBlobs: Blob[] = [];
  pendingMidi: any[] = [];
  recordingFinished$ = new Subject<{
    id: string;
    blob: Blob;
    url: string;
    midi?: any[];
  }>();

  mediaRecorder: MediaRecorder | null = null;
<<<<<<< HEAD

  async startRecording(stream: MediaStream) {
    this.recordedBlobs = [];
    const options = { mimeType: 'audio/webm' };
    this.mediaRecorder = new MediaRecorder(stream, options);
=======
  private activeUrls = new Set<string>();

  revokeRecordingUrl(url: string) {
    if (this.activeUrls.has(url)) {
      URL.revokeObjectURL(url);
      this.activeUrls.delete(url);
      this.logger.info(`Revoked object URL: ${url}`);
    }
  }

  private revokeAllUrls() {
    this.activeUrls.forEach((url) => {
      URL.revokeObjectURL(url);
    });
    this.activeUrls.clear();
  }

  ngOnDestroy() {
    this.revokeAllUrls();
  }

  async startRecording(stream: MediaStream) {
    if (!stream || stream.getAudioTracks().length === 0) {
      throw new Error('No audio tracks found in stream');
    }

    this.recordedBlobs = [];
    const mimeType = 'audio/webm;codecs=opus';

    if (typeof MediaRecorder === 'undefined') {
      throw new Error('MediaRecorder is not supported in this environment');
    }

    const options = MediaRecorder.isTypeSupported(mimeType)
      ? { mimeType }
      : MediaRecorder.isTypeSupported('audio/webm')
        ? { mimeType: 'audio/webm' }
        : {};

    try {
      this.mediaRecorder = new MediaRecorder(stream, options);
    } catch (recorderError) {
      this.logger.error('Failed to instantiate MediaRecorder', recorderError);
      throw recorderError;
    }
>>>>>>> origin/main

    this.mediaRecorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        this.recordedBlobs.push(event.data);
      }
    };

    this.mediaRecorder.onstop = async () => {
<<<<<<< HEAD
      const blob = new Blob(this.recordedBlobs, { type: 'audio/webm' });
      const id = `rec_${Date.now()}`;

      await this.localStorageService.saveItem('audio_blobs', {
        id,
        blob,
        name: `Recording ${new Date().toLocaleTimeString()}`,
        timestamp: Date.now(),
        settings: { gain: 1.0, trimmed: false },
      });

      this.logger.info(`Recording ${id} saved.`);
      const url = URL.createObjectURL(blob);
      this.recordingFinished$.next({
        id,
        blob,
        url,
        midi: [...this.pendingMidi],
      });
      this.pendingMidi = [];
=======
      try {
        const blob = new Blob(this.recordedBlobs, {
          type: 'audio/webm;codecs=opus',
        });
        const id = `rec_${Date.now()}`;

        try {
          await this.localStorageService.saveItem('audio_blobs', {
            id,
            blob,
            name: `Recording ${new Date().toLocaleTimeString()}`,
            timestamp: Date.now(),
            settings: { gain: 1.0, trimmed: false },
          });
          this.logger.info(`Recording ${id} saved.`);
        } catch (saveError) {
          this.logger.error(
            'Failed to persist recording to storage',
            saveError
          );
        }

        this.revokeAllUrls();
        const url = URL.createObjectURL(blob);
        this.activeUrls.add(url);

        this.recordingFinished$.next({
          id,
          blob,
          url,
          midi: [...this.pendingMidi],
        });
      } catch (error) {
        this.logger.error('Failed to process recording stop', error);
      } finally {
        this.isRecording.set(false);
        this.pendingMidi = [];
      }
>>>>>>> origin/main
    };

    this.mediaRecorder.start();
    this.isRecording.set(true);
  }

  stopRecording() {
    if (this.mediaRecorder) {
<<<<<<< HEAD
      this.mediaRecorder.stop();
      this.isRecording.set(false);
=======
      try {
        if (this.mediaRecorder.state !== 'inactive') {
          this.mediaRecorder.stop();
        }
      } catch (error) {
        this.logger.error('Error stopping MediaRecorder', error);
        this.isRecording.set(false);
      }
>>>>>>> origin/main
    }
  }

  async getOfflineRecordings() {
    return await this.localStorageService.getAllItems('audio_blobs');
  }

<<<<<<< HEAD
  async applyOfflineEdit(id: string, edits: any) {
    const item = await this.localStorageService.getItem('audio_blobs', id);
    if (item) {
      item.settings = { ...item.settings, ...edits };
      await this.localStorageService.saveItem('audio_blobs', item);
      this.logger.info(`Offline edits applied to recording ${id}.`);
=======
  async applyOfflineEdit(id: string, edits: Partial<RecordingSettings>) {
    try {
      const item = (await this.localStorageService.getItem(
        'audio_blobs',
        id
      )) as RecordingItem | null;
      if (item) {
        item.settings = { ...item.settings, ...edits };
        await this.localStorageService.saveItem('audio_blobs', item);
        this.logger.info(`Offline edits applied to recording ${id}.`);
      } else {
        this.logger.warn(`Recording ${id} not found for editing`);
      }
    } catch (error) {
      this.logger.error(`Failed to apply edits to recording ${id}`, error);
      throw error;
>>>>>>> origin/main
    }
  }
}
