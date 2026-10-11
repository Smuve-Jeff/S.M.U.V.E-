import { Injectable, inject, effect } from '@angular/core';
import { UserProfileService, UserProfile } from './user-profile.service';
import { MusicalDnaService } from './musical-dna.service';
import { DnaEvidenceInput } from '../types/musical-dna.types';

@Injectable({ providedIn: 'root' })
export class ArtistProfileChangeDetectorService {
  private profileService = inject(UserProfileService);
  private dnaService = inject(MusicalDnaService);
  private previousProfile: UserProfile | null = null;

  constructor() {
    effect(async () => {
      const currentProfile = this.profileService.profile();
      if (!currentProfile) return;
      const signals = this.detectProfileChanges(this.previousProfile, currentProfile);
      for (const signal of signals) {
        await this.dnaService.recordSignal(signal);
      }
      this.previousProfile = JSON.parse(JSON.stringify(currentProfile));
    });
  }

  private detectProfileChanges(prev: UserProfile | null, current: UserProfile): DnaEvidenceInput[] {
    const signals: DnaEvidenceInput[] = [];
    if (!prev) return signals;

    if (this.arrayChanged(prev.daw, current.daw)) {
      signals.push({ dimension: 'production', source: 'settings', summary: `DAW updated: ${current.daw?.join(', ') || 'cleared'}`, weight: 0.35 });
    }
    if (this.arrayChanged(prev.equipment, current.equipment)) {
      signals.push({ dimension: 'sonics', source: 'settings', summary: `Studio equipment updated: ${current.equipment?.join(', ') || 'cleared'}`, weight: 0.3 });
    }
    if (prev.musicalJourney?.preferredBpmRange !== current.musicalJourney?.preferredBpmRange) {
      signals.push({ dimension: 'rhythm', source: 'questionnaire', summary: `Tempo zone: ${current.musicalJourney?.preferredBpmRange || 'unspecified'}`, weight: 0.25 });
    }
    if (prev.musicalJourney?.signatureSound !== current.musicalJourney?.signatureSound) {
      signals.push({ dimension: 'sonics', source: 'questionnaire', summary: `Signature sound: ${current.musicalJourney?.signatureSound || 'undefined'}`, weight: 0.4 });
    }
    const prevCatalogCount = prev.catalog?.length || 0;
    const currCatalogCount = current.catalog?.length || 0;
    if (currCatalogCount > prevCatalogCount) {
      const newCount = currCatalogCount - prevCatalogCount;
      signals.push({ dimension: 'writing', source: 'catalog', summary: `${newCount} work(s) added to catalog`, weight: Math.min(0.5, 0.15 * newCount) });
    }
    if (prev.musicalJourney?.productionPhilosophy !== current.musicalJourney?.productionPhilosophy) {
      signals.push({ dimension: 'production', source: 'questionnaire', summary: `Production philosophy: ${current.musicalJourney?.productionPhilosophy || 'undefined'}`, weight: 0.35 });
    }
    if (prev.musicalJourney?.songwritingStyle !== current.musicalJourney?.songwritingStyle) {
      signals.push({ dimension: 'writing', source: 'questionnaire', summary: `Songwriting style: ${current.musicalJourney?.songwritingStyle || 'undefined'}`, weight: 0.3 });
    }
    if (this.arrayChanged(prev.skills, current.skills)) {
      signals.push({ dimension: 'production', source: 'expertise', summary: `Skills updated: ${current.skills?.join(', ') || 'none'}`, weight: 0.2 });
    }
    if (this.expertiseChanged(prev.expertise, current.expertise)) {
      signals.push({ dimension: 'production', source: 'expertise', summary: 'Expertise levels updated', weight: 0.25 });
    }
    if (prev.musicalJourney?.releaseVelocity !== current.musicalJourney?.releaseVelocity) {
      signals.push({ dimension: 'audience', source: 'questionnaire', summary: `Release velocity: ${current.musicalJourney?.releaseVelocity || 'undefined'}`, weight: 0.2 });
    }
    if (prev.settings?.studio?.autoMixEnabled !== current.settings?.studio?.autoMixEnabled) {
      signals.push({ dimension: 'production', source: 'settings', summary: `Auto-mix ${current.settings?.studio?.autoMixEnabled ? 'enabled' : 'disabled'}`, weight: 0.2 });
    }
    return signals;
  }

  private arrayChanged(prev: unknown[] | undefined, curr: unknown[] | undefined): boolean {
    if (!prev && !curr) return false;
    if (!prev || !curr) return true;
    if (prev.length !== curr.length) return true;
    return JSON.stringify(prev) !== JSON.stringify(curr);
  }

  private expertiseChanged(prev: any, curr: any): boolean {
    if (!prev && !curr) return false;
    if (!prev || !curr) return true;
    return JSON.stringify(prev) !== JSON.stringify(curr);
  }
}
