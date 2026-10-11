import { Injectable, computed, inject } from '@angular/core';
import { UserProfileService } from './user-profile.service';
import {
  readMusicalDna,
  recordDnaEvidence,
  DnaEvidenceInput,
  DNA_VERSION,
} from '../types/musical-dna.types';

@Injectable({ providedIn: 'root' })
export class MusicalDnaService {
  private profileService = inject(UserProfileService);

  readonly reading = computed(() => {
    const profile = this.profileService.profile();
    return readMusicalDna(profile, profile?.musicalDna);
  });

  readonly state = computed(() => this.profileService.profile()?.musicalDna);

  readonly signature = computed(() => this.reading().signature);
  readonly strengths = computed(() => this.reading().strengths);
  readonly gaps = computed(() => this.reading().gaps);
  readonly fidelity = computed(() => this.reading().fidelity);

  async recordSignal(input: DnaEvidenceInput) {
    const profile = this.profileService.profile();
    const newState = recordDnaEvidence(profile?.musicalDna, input, Date.now());

    await this.profileService.updateProfile({
      musicalDna: newState,
    });
  }

  async resetBehaviorLog() {
    const profile = this.profileService.profile();
    if (!profile?.musicalDna) return;

    await this.profileService.updateProfile({
      musicalDna: {
        version: DNA_VERSION,
        updatedAt: Date.now(),
        events: [],
        lastReading: this.reading(),
      },
    });
  }
}
