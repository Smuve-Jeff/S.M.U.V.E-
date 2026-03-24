import { Injectable, inject, signal } from '@angular/core';
import { LocalStorageService } from '../services/local-storage.service';
import { LoggingService } from '../services/logging.service';

@Injectable({
  providedIn: 'root',
})
export class AudioRecorderService {
  private localStorageService = inject(LocalStorageService);
  private logger = inject(LoggingService);

  isRecording = signal(false);
  recordedBlobs: Blob[] = [];
  mediaRecorder: MediaRecorder | null = null;

  async startRecording(stream: MediaStream) {
    this.recordedBlobs = [];
    const options = { mimeType: 'audio/webm' };
    this.mediaRecorder = new MediaRecorder(stream, options);

    this.mediaRecorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        this.recordedBlobs.push(event.data);
      }
    };

    this.mediaRecorder.onstop = async () => {
      const blob = new Blob(this.recordedBlobs, { type: 'audio/webm' });
      const id = `rec_${Date.now()}`;

      // High-fidelity local save
      await this.localStorageService.saveItem('audio_blobs', {
        id,
        blob,
        name: `Recording ${new Date().toLocaleTimeString()}`,
        timestamp: Date.now(),
        settings: { gain: 1.0, trimmed: false },
      });

      this.logger.info(
        `Recording ${id} saved to high-fidelity offline storage.`
      );
    };

    this.mediaRecorder.start();
    this.isRecording.set(true);
  }

  stopRecording() {
    if (this.mediaRecorder) {
      this.mediaRecorder.stop();
      this.isRecording.set(false);
    }
  }

  async getOfflineRecordings() {
    return await this.localStorageService.getAllItems('audio_blobs');
  }

  async applyOfflineEdit(id: string, edits: any) {
    const item = await this.localStorageService.getItem('audio_blobs', id);
    if (item) {
      item.settings = { ...item.settings, ...edits };
      await this.localStorageService.saveItem('audio_blobs', item);
      this.logger.info(`Offline edits applied to recording ${id}.`);
    }
  }
}
