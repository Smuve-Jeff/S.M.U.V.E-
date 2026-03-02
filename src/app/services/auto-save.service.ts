import { Injectable, inject, OnDestroy } from '@angular/core';
import { UserProfileService } from './user-profile.service';
import { MusicManagerService } from './music-manager.service';
import { AudioEngineService } from './audio-engine.service';
import { AuthService } from './auth.service';
import { interval, Subscription } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class AutoSaveService implements OnDestroy {
  private profileService = inject(UserProfileService);
  private musicManager = inject(MusicManagerService);
  private audioEngine = inject(AudioEngineService);
  private authService = inject(AuthService);
  private autoSaveSub?: Subscription;

  constructor() {
    // Start auto-save every 30 seconds if authenticated
    this.autoSaveSub = interval(30000).subscribe(() => {
      if (this.authService.isAuthenticated()) {
        this.saveCurrentState();
      }
    });
  }

  private async saveCurrentState() {
    console.log('Auto-saving application state...');
    try {
      const profile = this.profileService.profile();

      // Store current DAW state in the profile's knowledge base or a dedicated projects field
      // For now, we'll extend the profile with a simple 'lastSession' data
      const sessionData = {
        tracks: this.musicManager.tracks(),
        tempo: this.audioEngine.tempo(),
        loopStart: this.audioEngine.loopStart(),
        loopEnd: this.audioEngine.loopEnd(),
        timestamp: Date.now()
      };

      // We persist this session data in the knowledge base under a special key
      const updatedProfile = {
        ...profile,
        knowledgeBase: {
          ...profile.knowledgeBase,
          lastDawSession: sessionData
        }
      };

      await this.profileService.updateProfile(updatedProfile);
      console.log('Auto-save successful');
    } catch (error) {
      console.error('Auto-save failed:', error);
    }
  }

  ngOnDestroy() {
    this.autoSaveSub?.unsubscribe();
  }
}
