import { Injectable, inject, signal, computed } from '@angular/core';
import { FileLoaderService } from '../services/file-loader.service';
import { AudioEngineService } from '../services/audio-engine.service';
import { MusicManagerService } from '../services/music-manager.service';
import { LoggingService } from '../services/logging.service';
import { SnackbarService } from '../services/snackbar.service';

export interface ImportedAudio {
  id: string;
  name: string;
  buffer: AudioBuffer;
  blob: Blob;
  url: string;
  duration: number;
  sampleRate: number;
  channels: number;
  /** Trim region: start/end as normalized 0-1 */
  trimStart: number;
  trimEnd: number;
  /** Gain multiplier 0-2 */
  gain: number;
  /** Edited buffer after applying trim + gain */
  editedBlob: Blob | null;
  editedUrl: string | null;
}

@Injectable({ providedIn: 'root' })
export class AudioImportService {
  private fileLoader = inject(FileLoaderService);
  private audioEngine = inject(AudioEngineService);
  private musicManager = inject(MusicManagerService);
  private logger = inject(LoggingService);
  private snackbar = inject(SnackbarService);

  /** All imported audio files */
  importedAudio = signal<ImportedAudio[]>([]);

  /** Currently selected audio for editing */
  selectedAudio = signal<ImportedAudio | null>(null);

  /** Loading state */
  isLoading = signal(false);

  /** Total imported duration summary */
  totalDuration = computed(() => {
    return this.importedAudio().reduce((sum, a) => sum + a.duration, 0);
  });

  /** Open file picker and import audio files */
  async importFiles(): Promise<void> {
    this.isLoading.set(true);
    try {
      const files = await this.fileLoader.pickLocalFiles(
        '.mp3,.wav,.ogg,.flac,.aiff,.m4a'
      );
      if (files.length === 0) {
        this.isLoading.set(false);
        return;
      }

      const ctx = this.audioEngine.ctx;
      const results: ImportedAudio[] = [];

      for (const file of files) {
        try {
          const buffer = await this.fileLoader.decodeToAudioBuffer(ctx, file);
          const url = URL.createObjectURL(file);

          const imported: ImportedAudio = {
            id: `import_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            name: file.name.replace(/\.[^/.]+$/, ''),
            buffer,
            blob: file,
            url,
            duration: buffer.duration,
            sampleRate: buffer.sampleRate,
            channels: buffer.numberOfChannels,
            trimStart: 0,
            trimEnd: 1,
            gain: 1.0,
            editedBlob: null,
            editedUrl: null,
          };
          results.push(imported);
        } catch (e) {
          this.logger.warn(`Failed to import ${file.name}`, e);
          this.snackbar.warning(`Could not import ${file.name}`);
        }
      }

      this.importedAudio.update((prev) => [...prev, ...results]);
      if (results.length > 0) {
        this.selectedAudio.set(results[0]);
        this.snackbar.success(`Imported ${results.length} audio file(s)`);
      }
    } catch (e) {
      this.logger.error('Audio import failed', e);
      this.snackbar.error('Audio import failed');
    } finally {
      this.isLoading.set(false);
    }
  }

  /** Select an imported audio for editing */
  selectAudio(id: string) {
    const audio = this.importedAudio().find((a) => a.id === id);
    if (audio) this.selectedAudio.set(audio);
  }

  /** Remove an imported audio */
  removeAudio(id: string) {
    this.importedAudio.update((prev) => prev.filter((a) => a.id !== id));
    if (this.selectedAudio()?.id === id) {
      this.selectedAudio.set(this.importedAudio()[0] || null);
    }
  }

  /** Update trim start (normalized 0-1) */
  setTrimStart(value: number | string) {
    const num = typeof value === 'string' ? parseFloat(value) : value;
    this.updateCurrentAudio({
      trimStart: Math.max(0, Math.min(num, this.selectedAudio()?.trimEnd ?? 1)),
    });
  }

  /** Update trim end (normalized 0-1) */
  setTrimEnd(value: number | string) {
    const num = typeof value === 'string' ? parseFloat(value) : value;
    this.updateCurrentAudio({
      trimEnd: Math.max(this.selectedAudio()?.trimStart ?? 0, Math.min(num, 1)),
    });
  }

  /** Set gain multiplier */
  setGain(gain: number | string) {
    const num = typeof gain === 'string' ? parseFloat(gain) : gain;
    this.updateCurrentAudio({ gain: Math.max(0, Math.min(2, num)) });
  }

  /** Apply current trim + gain edits and produce edited Blob */
  applyEdits(): Promise<Blob | null> {
    const audio = this.selectedAudio();
    if (!audio) return Promise.resolve(null);

    const ctx = this.audioEngine.ctx;
    const buffer = audio.buffer;
    const sr = buffer.sampleRate;
    const channels = buffer.numberOfChannels;

    // Calculate sample range
    const totalSamples = buffer.length;
    const startSample = Math.floor(totalSamples * audio.trimStart);
    const endSample = Math.ceil(totalSamples * audio.trimEnd);
    const newLength = endSample - startSample;

    if (newLength <= 0) return Promise.resolve(null);

    // Create new buffer with trimmed + gained audio
    const newBuffer = ctx.createBuffer(channels, newLength, sr);
    for (let ch = 0; ch < channels; ch++) {
      const srcData = buffer.getChannelData(ch);
      const dstData = newBuffer.getChannelData(ch);
      for (let i = 0; i < newLength; i++) {
        dstData[i] = srcData[startSample + i] * audio.gain;
      }
    }

    // Encode to WAV
    const interleaved = this.interleaveChannels(newBuffer);
    const wavBlob = this.createWavBlob(interleaved, sr);
    const editedUrl = URL.createObjectURL(wavBlob);

    const edited = {
      ...audio,
      trimStart: audio.trimStart,
      trimEnd: audio.trimEnd,
      gain: audio.gain,
      editedBlob: wavBlob,
      editedUrl,
    };

    this.selectedAudio.set(edited);
    this.importedAudio.update((prev) =>
      prev.map((a) => (a.id === audio.id ? edited : a))
    );

    this.snackbar.success('Audio edits applied');
    return Promise.resolve(wavBlob);
  }

  /** Export edited audio as WAV download */
  exportEditedAudio() {
    const audio = this.selectedAudio();
    if (!audio) return;

    this.applyEdits().then((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${audio.name}_edited.wav`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    });
  }

  /** Get waveform data (decimated) for canvas rendering */
  getWaveformData(audio: ImportedAudio, width: number): number[] {
    const buffer = audio.buffer;
    const data = buffer.getChannelData(0);
    const step = Math.max(1, Math.floor(data.length / width));
    const waveform: number[] = [];
    for (let i = 0; i < width; i++) {
      let sum = 0;
      let count = 0;
      for (let j = 0; j < step && i * step + j < data.length; j++) {
        sum += Math.abs(data[i * step + j]);
        count++;
      }
      waveform.push(count > 0 ? sum / count : 0);
    }
    return waveform;
  }

  /** Render waveform onto a canvas */
  renderWaveform(
    canvas: HTMLCanvasElement,
    waveform: number[],
    color: string = '#0E7C7B'
  ) {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    // Waveform background
    ctx.fillStyle = 'rgba(14, 124, 123, 0.06)';
    ctx.fillRect(0, 0, w, h);

    // Center line
    const midY = h / 2;
    ctx.strokeStyle = 'rgba(61, 53, 42, 0.08)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, midY);
    ctx.lineTo(w, midY);
    ctx.stroke();

    // Draw waveform bars
    const barW = Math.max(1, Math.floor(w / waveform.length));
    ctx.fillStyle = color;
    for (let i = 0; i < waveform.length; i++) {
      const val = waveform[i];
      const barH = val * midY * 0.9;
      const x = i * barW;
      ctx.fillRect(x, midY - barH, barW - 1, barH * 2);
    }
  }

  /** Trim region highlight on waveform canvas */
  renderTrimRegion(
    canvas: HTMLCanvasElement,
    audio: ImportedAudio,
    waveform: number[]
  ) {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const w = canvas.width;
    const h = canvas.height;

    // Dim regions outside trim
    ctx.fillStyle = 'rgba(31, 26, 18, 0.25)';
    ctx.fillRect(0, 0, w * audio.trimStart, h);
    ctx.fillRect(w * audio.trimEnd, 0, w - w * audio.trimEnd, h);

    // Trim boundary lines
    ctx.strokeStyle = '#D97706';
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(w * audio.trimStart, 0);
    ctx.lineTo(w * audio.trimStart, h);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(w * audio.trimEnd, 0);
    ctx.lineTo(w * audio.trimEnd, h);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  /** Add imported audio as a track */
  addToProject(audio: ImportedAudio) {
    // Apply edits first
    this.applyEdits().then((blob) => {
      const finalAudio = this.selectedAudio();
      if (!finalAudio) return;

      // Create a new sampler track with this audio
      this.musicManager.addTrack(finalAudio.name, 'sampler', 'midi');

      this.snackbar.success(`Added "${finalAudio.name}" as new track`);
    });
  }

  /** Clear all imported audio */
  clearAll() {
    this.importedAudio.set([]);
    this.selectedAudio.set(null);
  }

  // ── Private helpers ─────────────────────────────────

  private updateCurrentAudio(partial: Partial<ImportedAudio>) {
    const current = this.selectedAudio();
    if (!current) return;
    const updated = { ...current, ...partial };
    this.selectedAudio.set(updated);
    this.importedAudio.update((prev) =>
      prev.map((a) => (a.id === current.id ? updated : a))
    );
  }

  private interleaveChannels(buffer: AudioBuffer): Float32Array {
    const chs = buffer.numberOfChannels;
    const len = buffer.length;
    const result = new Float32Array(len * chs);
    for (let ch = 0; ch < chs; ch++) {
      const data = buffer.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        result[i * chs + ch] = data[i];
      }
    }
    return result;
  }

  private createWavBlob(interleaved: Float32Array, sampleRate: number): Blob {
    const numSamples = interleaved.length;
    const buffer = new ArrayBuffer(44 + numSamples * 2);
    const view = new DataView(buffer);
    const w = (offset: number, str: string) => {
      for (let i = 0; i < str.length; i++)
        view.setUint8(offset + i, str.charCodeAt(i));
    };
    w(0, 'RIFF');
    view.setUint32(4, 36 + numSamples * 2, true);
    w(8, 'WAVE');
    w(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 2, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2 * 2, true);
    view.setUint16(32, 4, true);
    view.setUint16(34, 16, true);
    w(36, 'data');
    view.setUint32(40, numSamples * 2, true);
    for (let i = 0; i < numSamples; i++) {
      const s = Math.max(-1, Math.min(1, interleaved[i]));
      view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    }
    return new Blob([buffer], { type: 'audio/wav' });
  }
}
