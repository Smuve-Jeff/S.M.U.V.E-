import {
  Component,
  OnInit,
  OnDestroy,
  signal,
  computed,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { UserProfileService } from '../services/user-profile.service';
import { DeckService } from '../services/deck.service';
import { UIService } from '../services/ui.service';
import { AiService } from '../services/ai.service';
import { FileLoaderService } from '../services/file-loader.service';
import { ExportService } from '../services/export.service';
import { AudioEngineService } from '../services/audio-engine.service';
import { AfterViewInit } from '@angular/core';
import { NotificationService } from '../services/notification.service';
import { PlayerService } from '../services/player.service';

@Component({
  selector: 'app-hub',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './hub.component.html',
  styleUrls: ['./hub.component.css'],
})
export class HubComponent implements OnInit, OnDestroy, AfterViewInit {
  private router = inject(Router);
  public uiService = inject(UIService);
  public deckService = inject(DeckService);
  public profileService = inject(UserProfileService);
  public aiService = inject(AiService);
  private fileLoader = inject(FileLoaderService);
  private exportService = inject(ExportService);
  public audioEngine = inject(AudioEngineService);
  private notificationService = inject(NotificationService);
  public playerService = inject(PlayerService);

  // Quick Start Form
  quickProfile = signal({
    artistName: '',
    primaryGenre: 'Hip Hop',
  });

  genres = ['Hip Hop', 'R&B', 'Pop', 'Electronic', 'Rock', 'Jazz', 'Classical'];
  labelStats = [
    { label: 'Roster Ready', value: '12', foot: 'Active talent under management' },
    { label: 'Pipeline', value: '5', foot: 'Releases in mastering' },
    { label: 'Momentum', value: '+18%', foot: 'Month over month growth' },
  ];
  broadcastDuration = 320;
  marketPulse = [
    'Streaming spike – West Coast',
    'Vinyl preorders up 12%',
    'Sync request: indie film',
  ];

  updateQuickProfile(field: string, value: string) {
    this.quickProfile.update((p) => ({ ...p, [field]: value }));
  }

  constructor() {}

  private animFrame: number | null = null;
  visualizerData = signal<number[]>(new Array(24).fill(20));

  ngOnInit() {}

  ngAfterViewInit() {
    this.startVisualizer();
  }

  private startVisualizer() {
    const analyser = this.audioEngine.getAnalyser();
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const update = () => {
      if (this.playerService.isPlaying()) {
        analyser.getByteFrequencyData(dataArray);

        // Map the frequency data to our 24 bars
        const newData = [];
        const step = Math.floor(bufferLength / 24);
        for (let i = 0; i < 24; i++) {
          let sum = 0;
          for (let j = 0; j < step; j++) {
            sum += dataArray[i * step + j];
          }
          const average = sum / step;
          // Normalize to 20-100 range for CSS height
          newData.push(Math.max(20, (average / 255) * 100));
        }
        this.visualizerData.set(newData);
      } else {
        // Idling animation if not playing
        const idle = this.visualizerData().map((v) => Math.max(20, v * 0.95));
        this.visualizerData.set(idle);
      }
      this.animFrame = requestAnimationFrame(update);
    };
    update();
  }

  ngOnDestroy() {
    if (this.animFrame) cancelAnimationFrame(this.animFrame);
  }

  // Quick Start Actions
  onQuickStart() {
    if (!this.quickProfile().artistName) {
      this.notificationService.show(
        'Please enter your Artist Name to begin!',
        'warning'
      );
      return;
    }

    const current = this.profileService.profile();
    this.profileService.updateProfile({
      ...current,
      artistName: this.quickProfile().artistName,
      primaryGenre: this.quickProfile().primaryGenre,
    });

    this.notificationService.show('Profile Created Successfully!', 'success');
    this.router.navigate(['/profile']);
  }

  // AI Jam Actions
  toggleAIBassist() {
    if (this.aiService.isAIBassistActive()) {
      this.aiService.stopAIBassist();
    } else {
      this.aiService.startAIBassist();
    }
  }

  toggleAIDrummer() {
    if (this.aiService.isAIDrummerActive()) {
      this.aiService.stopAIDrummer();
    } else {
      this.aiService.startAIDrummer();
    }
  }

  toggleAIKeyboardist() {
    if (this.aiService.isAIKeyboardistActive()) {
      this.aiService.stopAIKeyboardist();
    } else {
      this.aiService.startAIKeyboardist();
    }
  }

  // Navigation Helpers
  goToStudio() {
    this.router.navigate(['/studio']);
  }

  goToThaSpot() {
    this.router.navigate(['/tha-spot']);
  }
}
