import {
  Component,
  ChangeDetectionStrategy,
  signal,
  computed,
  inject,
  effect,
} from '@angular/core';
import { NgFor } from '@angular/common';
import { AudioEngineService } from '../../services/audio-engine.service';
import { RecommendationsComponent } from '../recommendations/recommendations.component';
import { CollaborationService } from '../../services/collaboration.service';
import { AuthService } from '../../services/auth.service';

// Basic data structures for the new Studio Core
export interface MicChannel {
  id: string;
  label: string;
  level: number; // Volume level (0-100)
  muted: boolean;
  pan: number; // Panning (-100 to 100)
  armed: boolean; // Armed for recording
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
  private readonly collaborationService = inject(CollaborationService);
  private readonly authService = inject(AuthService);

  // --- Core Studio State ---
  masterVolume = signal(80); // Master output volume (0-100)
  isRecording = signal(false);
  micChannels = signal<MicChannel[]>([
    {
      id: 'mic-1',
      label: 'Vocal Mic',
      level: 70,
      muted: false,
      pan: 0,
      armed: true,
    },
  ]);

  // --- Collaboration State ---
  session = this.collaborationService.currentSession;
  currentUser = this.authService.currentUser;
  sessionIdInput = signal('');

  // --- Computed State for UI ---
  recordingStatus = computed(() =>
    this.isRecording() ? 'RECORDING' : 'STANDBY'
  );
  armedChannels = computed(() =>
    this.micChannels()
      .filter((ch) => ch.armed)
      .map((ch) => ch.label)
  );

  constructor() {
    effect(() => {
      this.audioEngine.setMasterOutputLevel(this.masterVolume() / 100);
    });

    effect(() => {
      console.log('Session changed:', this.session());
    });
  }

  // --- Actions ---
  toggleRecording(): void {
    this.isRecording.update((rec) => !rec);
  }

  updateMasterVolume(newVolume: number): void {
    this.masterVolume.set(newVolume);
  }

  updateChannelLevel(id: string, newLevel: number): void {
    this.micChannels.update((channels) =>
      channels.map((ch) => (ch.id === id ? { ...ch, level: newLevel } : ch))
    );
  }

  // --- Collaboration Actions ---
  startCollaboration() {
    const user = this.currentUser();
    if (user) {
      const projectState = {
        masterVolume: this.masterVolume(),
        channels: this.micChannels(),
      };
      this.collaborationService.startSession(user, projectState);
    }
  }

  joinCollaboration() {
    const user = this.currentUser();
    const sessionId = this.sessionIdInput();
    if (user && sessionId) {
      this.collaborationService.joinSession(sessionId, user);
    }
  }

  leaveCollaboration() {
    const session = this.session();
    const user = this.currentUser();
    if (session && user) {
      this.collaborationService.leaveSession(session.sessionId, user.id);
    }
  }
}
