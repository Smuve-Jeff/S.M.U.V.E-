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
    const previousBlueprint = prev.musicalJourney?.musicBlueprint;
    const currentBlueprint = current.musicalJourney?.musicBlueprint;
    const blueprintSignals: Array<{
      key: keyof NonNullable<UserProfile['musicalJourney']['musicBlueprint']>;
      dimension: DnaEvidenceInput['dimension'];
      label: string;
      weight: number;
    }> = [
      { key: 'rhythmicFeel', dimension: 'rhythm', label: 'Rhythmic feel', weight: 0.3 },
      { key: 'harmonicLanguage', dimension: 'harmony', label: 'Harmonic language', weight: 0.3 },
      { key: 'vocalDelivery', dimension: 'melody', label: 'Delivery', weight: 0.3 },
      { key: 'sonicNonNegotiables', dimension: 'sonics', label: 'Sonic non-negotiables', weight: 0.35 },
      { key: 'referenceTracks', dimension: 'sonics', label: 'Reference tracks', weight: 0.25 },
      { key: 'lyricalThemes', dimension: 'writing', label: 'Lyrical themes', weight: 0.3 },
      { key: 'signatureTension', dimension: 'writing', label: 'Signature tension', weight: 0.3 },
      { key: 'arrangementApproach', dimension: 'arrangement', label: 'Arrangement approach', weight: 0.3 },
      { key: 'recordingPriorities', dimension: 'production', label: 'Recording priorities', weight: 0.25 },
      { key: 'mixingPriorities', dimension: 'production', label: 'Mixing priorities', weight: 0.25 },
      { key: 'audienceProfile', dimension: 'audience', label: 'Audience profile', weight: 0.3 },
      { key: 'artisticIntent', dimension: 'writing', label: 'Artistic intent', weight: 0.3 },
      { key: 'collaborationBoundaries', dimension: 'arrangement', label: 'Collaboration boundaries', weight: 0.2 },
    ];
    for (const item of blueprintSignals) {
      const before = previousBlueprint?.[item.key];
      const after = currentBlueprint?.[item.key];
      const populated = Array.isArray(after)
        ? after.length > 0
        : typeof after === 'string'
          ? Boolean(after.trim())
          : after != null;
      const unchanged =
        Array.isArray(before) && Array.isArray(after)
          ? JSON.stringify(before) === JSON.stringify(after)
          : String(before ?? '').trim() === String(after ?? '').trim();
      if (!unchanged && populated) {
        const summary = Array.isArray(after) ? after.join(', ') : String(after);
        signals.push({
          dimension: item.dimension,
          source: 'questionnaire',
          summary: `${item.label}: ${summary.slice(0, 120)}`,
          weight: item.weight,
        });
      }
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
