import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AudioSessionService } from '../audio-session.service';
import { AudioEngineService } from '../../services/audio-engine.service';
import { ExportService } from '../../services/export.service';

@Component({
  selector: 'app-transport-bar',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './transport-bar.component.html',
  styleUrls: ['./transport-bar.component.css'],
})
export class TransportBarComponent {
  private readonly audioSession = inject(AudioSessionService);
  readonly audioEngine = inject(AudioEngineService);
  private readonly exportService = inject(ExportService);
  isExporting = signal(false);

  isPlaying = this.audioSession.isPlaying;
  isRecording = this.audioSession.isRecording;
  isStopped = this.audioSession.isStopped;
  masterVolume = this.audioSession.masterVolume;
  metronomeEnabled = this.audioEngine.metronomeEnabled;
  loopEnabled = signal(false);

  /** Animated visual level to drive meter */
  private levelTick = signal(0);
  masterLevelVisual = computed(() => {
    const t = this.levelTick();
    if (this.isPlaying()) {
      const base = 0.4 + Math.sin(t / 14) * 0.2 + Math.sin(t / 5) * 0.15;
      return Math.max(0.1, Math.min(0.95, base));
    }
    return 0.06;
  });

  constructor() {
    // simple ticker so CSS transitions have something to interpolate
    let n = 0;
    setInterval(() => {
      n++;
      this.levelTick.set(n);
    }, 80);
  }

  showBpmDropdown = signal(false);
  bpmPresets = [80, 90, 100, 110, 120, 124, 128, 130, 140, 150, 160];

  togglePlay(): void {
    this.audioSession.togglePlay();
  }
  toggleRecord(): void {
    this.audioSession.toggleRecord();
  }
  stop(): void {
    this.audioSession.stop();
  }
  updateMasterVolume(event: Event): void {
    const v = (event.target as HTMLInputElement).valueAsNumber;
    this.audioSession.updateMasterVolume(v);
  }
  nudgeTempo(delta: number): void {
    const clamped = Math.min(300, Math.max(20, this.audioEngine.tempo() + delta));
    this.audioEngine.tempo.set(clamped);
  }
  setTempo(bpm: number): void {
    this.audioEngine.tempo.set(bpm);
    this.showBpmDropdown.set(false);
  }
  toggleBpmDropdown(): void {
    this.showBpmDropdown.update((v) => !v);
  }
  onTempoInput(event: Event): void {
    const val = parseInt((event.target as HTMLInputElement).value, 10);
    if (!isNaN(val) && val >= 20 && val <= 300) {
      this.audioEngine.tempo.set(val);
    }
  }

  toggleLoop(): void {
    this.loopEnabled.update((v) => !v);
  }

  async exportWav() {
    this.isExporting.set(true);
    try {
      await this.exportService.exportProjectWav();
    } finally {
      this.isExporting.set(false);
    }
  }

  toggleMetronome(): void {
    this.audioEngine.toggleMetronome();
  }

  updateMetronomeVolume(event: Event): void {
    const val = (event.target as HTMLInputElement).valueAsNumber / 100;
    this.audioEngine.setMetronomeVolume(val);
  }
}
