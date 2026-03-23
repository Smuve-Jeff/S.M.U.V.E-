import { Injectable, inject, effect } from '@angular/core';
import { UserProfileService } from './user-profile.service';
import { AiService } from './ai.service';
import { AudioEngineService } from './audio-engine.service';

@Injectable({
  providedIn: 'root'
})
export class SettingsIntegrationService {
  private profileService = inject(UserProfileService);
  private aiService = inject(AiService);
  private audioEngine = inject(AudioEngineService);

  constructor() {
    // AI Integration
    effect(() => {
      const aiSettings = this.profileService.profile().settings.ai;
      // Personas are not yet implemented as a signal in AiService but we can log or trigger a state change
      console.log(`[Settings] AI Persona set to: ${aiSettings.commanderPersona}`);
    });

    // Audio Integration
    effect(() => {
       const audioSettings = this.profileService.profile().settings.audio;
       if (this.audioEngine.masterGain) {
          this.audioEngine.masterGain.gain.setTargetAtTime(audioSettings.masterVolume, this.audioEngine.ctx.currentTime, 0.1);
       }
    });
  }
}
