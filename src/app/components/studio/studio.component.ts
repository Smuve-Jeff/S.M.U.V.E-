import { Component, ChangeDetectionStrategy, signal, computed, inject, effect } from '@angular/core';
import { NgFor } from '@angular/common';
import { AudioEngineService } from '../../services/audio-engine.service';
import { RecommendationsComponent } from '../recommendations/recommendations.component';

// Basic data structures for the new Studio Core
export interface MicChannel {
  id: string;
  label: string;
  level: number;      // Volume level (0-100)
  muted: boolean;
  pan: number;        // Panning (-100 to 100)
  armed: boolean;     // Armed for recording
}

@Component({
  selector: 'app-studio',
  standalone: true,
  imports: [NgFor, RecommendationsComponent],
  templateUrl: './studio.component.html',
  styleUrls: ['./studio.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StudioComponent {
  private readonly audioEngine = inject(AudioEngineService);

  // --- Core Studio State ---
  masterVolume = signal(80); // Master output volume (0-100)
  isRecording = signal(false);

  // Initial channel strip configuration
  micChannels = signal<MicChannel[]>([
    { id: 'mic-1', label: 'Vocal Mic', level: 70, muted: false, pan: 0, armed: true },
    { id: 'mic-2', label: 'Guitar Cab', level: 65, muted: false, pan: 20, armed: false },
    { id: 'mic-3', label: 'Drum Overhead', level: 60, muted: true, pan: -20, armed: false },
  ]);

  // --- Computed State for UI ---
  recordingStatus = computed(() => (this.isRecording() ? 'RECORDING' : 'STANDBY'));
  armedChannels = computed(() => this.micChannels().filter(ch => ch.armed).map(ch => ch.label));

  constructor() {
    // Effect to link the masterVolume signal to the audio engine
    effect(() => {
      this.audioEngine.setMasterOutputLevel(this.masterVolume() / 100);
    });
  }

  // --- Actions ---
  toggleRecording(): void {
    this.isRecording.update(rec => !rec);
    // TODO: Integrate with actual recording service
  }

  updateMasterVolume(newVolume: number): void {
    this.masterVolume.set(newVolume);
  }

  // --- Channel Actions (placeholders for now) ---
  updateChannelLevel(id: string, newLevel: number): void {
    this.micChannels.update(channels => 
      channels.map(ch => ch.id === id ? { ...ch, level: newLevel } : ch)
    );
    // TODO: Link to audio engine
  }

  toggleMute(id: string): void {
    this.micChannels.update(channels =>
      channels.map(ch => ch.id === id ? { ...ch, muted: !ch.muted } : ch)
    );
    // TODO: Link to audio engine
  }

  toggleArm(id: string): void {
    this.micChannels.update(channels =>
      channels.map(ch => ch.id === id ? { ...ch, armed: !ch.armed } : ch)
    );
  }
}
