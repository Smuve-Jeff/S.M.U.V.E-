import { Injectable, inject, effect } from '@angular/core';
import { UserProfileService } from './user-profile.service';
import { AiService } from './ai.service';
import { AudioEngineService } from './audio-engine.service';

@Injectable({
  providedIn: 'root',
})
export class SettingsIntegrationService {
  private profileService = inject(UserProfileService);
  private aiService = inject(AiService);
  private audioEngine = inject(AudioEngineService);

  constructor() {
    // AI Integration — persona changes are reactive via signals
    effect(() => {
      const _aiSettings = this.profileService.profile().settings.ai;
    });

    // Audio Integration
    effect(() => {
      const audioSettings = this.profileService.profile().settings.audio;
      if (this.audioEngine.masterGain) {
        this.audioEngine.masterGain.gain.setTargetAtTime(
          audioSettings.masterVolume,
          this.audioEngine.ctx.currentTime,
          0.1
        );
      }
    });

    // Stage FX Integration — the profile preference drives the global
    // ambience. Mirrors into localStorage (`smuve_stage_fx`, the Studio
    // shell's working store) and applies the `stage-fx-off` body class so
    // every view honors the choice — even outside the Studio. Profiles
    // saved before this field existed skip the sync (`undefined` guard).
    effect(() => {
      const stageFx =
        this.profileService.profile().settings.studio?.stageFxEnabled;
      if (stageFx === undefined) return;
      if (typeof document !== 'undefined') {
        document.body.classList.toggle('stage-fx-off', !stageFx);
      }
      try {
        localStorage.setItem('smuve_stage_fx', stageFx ? 'on' : 'off');
      } catch {
        /* private mode / locked storage — degrade silently */
      }
    });
  }
}
