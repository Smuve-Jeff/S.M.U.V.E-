import { Component, OnInit, OnDestroy, signal, computed, inject } from '@angular/core';
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

@Component({
  selector: 'app-hub',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './hub.component.html',
  styleUrls: ['./hub.component.css'],
})
export class HubComponent implements OnInit, OnDestroy {
  private router = inject(Router);
  public uiService = inject(UIService);
  public deckService = inject(DeckService);
  public profileService = inject(UserProfileService);
  public aiService = inject(AiService);
  private fileLoader = inject(FileLoaderService);
  private exportService = inject(ExportService);
  private audioEngine = inject(AudioEngineService);

  // Quick Start Form
  quickProfile = signal({
    artistName: '',
    primaryGenre: 'Hip Hop'
  });

  // Radio State
  isRadioPlaying = computed(() => this.deckService.deckA().isPlaying);
  radioTrackName = computed(() => this.deckService.deckA().track?.name || 'S.M.U.V.E Radio');

  genres = [
    'Hip Hop',
    'R&B',
    'Pop',
    'Electronic',
    'Rock',
    'Jazz',
    'Classical'
  ];

  constructor() {}

  ngOnInit() {}

  ngOnDestroy() {}

  // Quick Start Actions
  onQuickStart() {
    if (!this.quickProfile().artistName) {
      alert('Please enter your Artist Name to begin!');
      return;
    }

    const current = this.profileService.profile();
    this.profileService.updateProfile({
      ...current,
      artistName: this.quickProfile().artistName,
      primaryGenre: this.quickProfile().primaryGenre
    });

    // Smooth transition to full profile
    this.router.navigate(['/profile']);
  }

  // Radio Actions
  toggleRadio() {
    this.deckService.togglePlay('A');
  }

  async onUpload() {
    try {
      const files = await this.fileLoader.pickLocalFiles('.mp3,.wav');
      if (files.length > 0) {
        const file = files[0];
        const buffer = await this.fileLoader.decodeToAudioBuffer(this.audioEngine.getContext(), file);
        this.deckService.loadDeckBuffer('A', buffer, file.name);
        if (!this.isRadioPlaying()) {
          this.toggleRadio();
        }
      }
    } catch (error) {
      console.error('Error uploading file:', error);
      alert('Failed to load audio file.');
    }
  }

  async onDownload() {
    try {
      const buffer = this.audioEngine.getDeck('A').buffer;
      if (!buffer) {
        alert('No track loaded to download!');
        return;
      }

      // Use any to access private-ish method for buffer to wav conversion
      const wavBuffer = this.exportService.audioBufferToWav(buffer);
      const wavBlob = new Blob([wavBuffer], { type: 'audio/wav' });
      const url = URL.createObjectURL(wavBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = this.radioTrackName() + '.wav';
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error downloading file:', error);
      alert('Failed to download audio file.');
    }
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
