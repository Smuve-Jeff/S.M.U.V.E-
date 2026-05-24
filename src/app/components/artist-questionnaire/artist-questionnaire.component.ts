import { Component, signal, inject, output, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  UserProfileService,
  UserProfile,
} from '../../services/user-profile.service';
import { AiService } from '../../services/ai.service';
import { UplinkService } from '../../services/uplink.service';
import { UplinkConsoleComponent } from '../uplink-console/uplink-console.component';
import { animate, style, transition, trigger } from '@angular/animations';
import { StrategicSignals } from '../../types/profile.types';

interface Question {
  id: string;
  type: 'select' | 'multi-select' | 'range' | 'text';
  text: string;
  description?: string;
  options?: string[];
  field: string;
  condition?: (profile: UserProfile) => boolean;
}

@Component({
  selector: 'app-artist-questionnaire',
  standalone: true,
  imports: [CommonModule, FormsModule, UplinkConsoleComponent],
  templateUrl: './artist-questionnaire.component.html',
  styleUrls: ['./artist-questionnaire.component.css'],
  animations: [
    trigger('slideInOut', [
      transition(':enter', [
        style({ transform: 'translateY(20px)', opacity: 0 }),
        animate(
          '400ms ease-out',
          style({ transform: 'translateY(0)', opacity: 1 })
        ),
      ]),
      transition(':leave', [
        animate(
          '300ms ease-in',
          style({ transform: 'translateY(-20px)', opacity: 0 })
        ),
      ]),
    ]),
  ],
})
export class ArtistQuestionnaireComponent {
  neuralObservationLog = signal<string[]>([
    'INITIALIZING_NEURAL_OBSERVATION...',
    'WAITING_FOR_DATA_VECTORS...',
  ]);

  strategicSignals = computed<StrategicSignals>(() => {
    const p = this.profileDraft();
    const signals: StrategicSignals = {
      marketReadiness: 0,
      identityTrust: 0,
      careerMomentum: 0,
      technicalAuthority: 0,
      syncViability: 0,
      touringStability: 0,
    };

    if (p.primaryGenre) signals.marketReadiness += 20;
    if (p.brandVoices && p.brandVoices.length > 0)
      signals.marketReadiness += 20;
    if (p.strategicGoals && p.strategicGoals.length > 0)
      signals.marketReadiness += 20;
    if (p.website) signals.marketReadiness += 20;
    if (p.expertise && p.expertise.marketing > 5) signals.marketReadiness += 20;

    if (p.expertise) {
      signals.technicalAuthority =
        p.expertise.production * 5 + (p.expertise.technical_mastery || 0) * 5;
    }

    if (p.catalog && p.catalog.length > 0) signals.careerMomentum += 20;
    if (p.performancesPerYear && p.performancesPerYear !== 'None')
      signals.careerMomentum += 20;
    if (p.strategicGoals && p.strategicGoals.length > 2)
      signals.careerMomentum += 20;

    if (p.syncDetails?.hasStems === 'Everything Archived')
      signals.syncViability += 25;
    if (p.syncDetails?.isSyncReady === 'Full Stem Mastery')
      signals.syncViability += 50;

    if (p.touringDetails?.isTourReady === 'Global Ready')
      signals.touringStability += 40;
    if (p.touringDetails?.hasBackline === 'Full Self-Sustained')
      signals.touringStability += 30;

    if (p.legalInfrastructure?.hasRegisteredWorks) signals.identityTrust += 30;
    if (p.legalInfrastructure?.proAffiliation !== 'None')
      signals.identityTrust += 30;

    Object.keys(signals).forEach((key) => {
      (signals as any)[key] = Math.min(100, (signals as any)[key]);
    });
    return signals;
  });

  private userProfileService = inject(UserProfileService);
  private aiService = inject(AiService);
  private uplinkService = inject(UplinkService);

  close = output<void>();
  complete = output<UserProfile>();

  currentStep = signal(0);
  profileDraft = signal<UserProfile>({
    ...this.userProfileService.profile(),
    genreSpecificData:
      this.userProfileService.profile().genreSpecificData || {},
    expertise: this.userProfileService.profile().expertise,
    strategicGoals: this.userProfileService.profile().strategicGoals || [],
  });

  isAnalyzing = signal(false);
  analysisResult = signal<any>(null);
  showUplink = signal(false);
  isGlitching = signal(false);

  questions: Question[] = [
    {
      id: 'sync-readiness',
      type: 'select',
      text: 'Sync Infrastructure Analysis.',
      description:
        'Is your catalog technically prepared for high-stakes licensing?',
      options: [
        'Not Started',
        'Basics Ready',
        'Full Stem Mastery',
        'One-Stop Qualified',
      ],
      field: 'syncDetails.isSyncReady',
    },
    {
      id: 'genre',
      type: 'select',
      text: 'Identify your sonic foundation.',
      description: 'Which primary genre defines your current trajectory?',
      options: [
        'Hip Hop',
        'Electronic',
        'Rock',
        'R&B',
        'Pop',
        'Jazz',
        'Afrobeats',
      ],
      field: 'primaryGenre',
    },
    {
      id: 'rock-rig',
      type: 'select',
      text: 'Signal Chain Architecture.',
      description: 'How do you define your electric resonance?',
      options: [
        'Analog Purity',
        'Digital Modelers',
        'Hybrid Chaos',
        'Studio Direct',
      ],
      field: 'genreSpecificData.rock_rig',
      condition: (p) => p.primaryGenre === 'Rock',
    },
    {
      id: 'legal-pro',
      type: 'select',
      text: 'PRO Affiliation.',
      description:
        'Which Performance Rights Organization monitors your airplay?',
      options: ['None', 'ASCAP', 'BMI', 'SESAC', 'PRS', 'GEMA', 'Other'],
      field: 'legalInfrastructure.proAffiliation',
    },
    {
      id: 'tour-status',
      type: 'select',
      text: 'Touring Infrastructure.',
      description: 'Is your live show ready for deployment?',
      options: ['Studio Only', 'Local Gigs', 'Regional Ready', 'Global Ready'],
      field: 'touringDetails.isTourReady',
    },
    {
      id: 'catalyst',
      type: 'select',
      text: 'Identify your primary Creative Catalyst.',
      description: 'What drives the core of your artistic output?',
      options: [
        'Nostalgia',
        'Technical Innovation',
        'Cultural Commentary',
        'Emotional Catharsis',
        'Market Dominance',
      ],
      field: 'expertise.catalyst',
    },
    {
      id: 'technical-barrier',
      type: 'range',
      text: 'Assess your Technical Mastery.',
      description:
        'How complex is your production chain? (1 = Minimalist, 10 = High-End Engineering)',
      field: 'expertise.technical_mastery',
    },
    {
      id: 'pipeline-focus',
      type: 'multi-select',
      text: 'Executive Pipeline Focus.',
      description: 'Select up to 3 priority infrastructures to harden.',
      options: [
        'Merch Engine',
        'Record Label Framework',
        'Legal Vault Hardening',
        'Sync Catalog Pumping',
        'Global Touring Route',
      ],
      field: 'strategicGoals',
    },
    {
      id: 'voice',
      type: 'multi-select',
      text: 'Calibrate your Brand Voice.',
      description: 'Select up to 3 core identifiers.',
      options: [
        'Mysterious',
        'Aggressive',
        'Sophisticated',
        'Relatable',
        'Elite',
        'Vulnerable',
        'High-Energy',
        'Cinematic',
        'Underground',
      ],
      field: 'brandVoices',
    },
  ];

  activeQuestions = computed(() => {
    const draft = this.profileDraft();
    return this.questions.filter((q) => !q.condition || q.condition(draft));
  });

  currentQuestion = computed(() => {
    const step = this.currentStep();
    return this.activeQuestions()[step];
  });

  progress = computed(() => {
    return ((this.currentStep() + 1) / this.activeQuestions().length) * 100;
  });

  getValue(field: string): any {
    const parts = field.split('.');
    let current: any = this.profileDraft();
    for (const part of parts) {
      if (
        !current ||
        part === '__proto__' ||
        part === 'constructor' ||
        part === 'prototype'
      )
        return undefined;
      current = current[part];
    }
    return current;
  }

  updateValue(field: string, value: any) {
    this.profileDraft.update((p) => {
      const updated = JSON.parse(JSON.stringify(p));
      const observation = this.generateNeuralObservation(field, value);
      if (observation) {
        this.neuralObservationLog.update((logs) =>
          [observation, ...logs].slice(0, 15)
        );
      }
      const parts = field.split('.');
      let target: any = updated;

      for (let i = 0; i < parts.length - 1; i++) {
        const part = parts[i];
        if (
          part === '__proto__' ||
          part === 'constructor' ||
          part === 'prototype'
        ) {
          return p;
        }
        if (!target[part]) target[part] = {};
        target = target[part];
      }

      const lastPart = parts[parts.length - 1];
      if (
        lastPart === '__proto__' ||
        lastPart === 'constructor' ||
        lastPart === 'prototype'
      ) {
        return p;
      }

      const q = this.currentQuestion();

      if (q && q.type === 'multi-select') {
        if (!Array.isArray(target[lastPart])) target[lastPart] = [];
        if (target[lastPart].includes(value)) {
          target[lastPart] = target[lastPart].filter((v: any) => v !== value);
        } else {
          target[lastPart] = [...target[lastPart], value].slice(-3);
        }
      } else {
        target[lastPart] = value;
      }

      return updated;
    });
  }

  next() {
    this.triggerGlitch();
    this.triggerGlitch();
    if (this.currentStep() < this.activeQuestions().length - 1) {
      setTimeout(() => {
        this.currentStep.update((s) => s + 1);
      }, 100);
    } else {
      this.finalize();
    }
  }

  back() {
    this.triggerGlitch();
    this.triggerGlitch();
    if (this.currentStep() > 0) {
      setTimeout(() => {
        this.currentStep.update((s) => s - 1);
      }, 100);
    }
  }

  async finalize() {
    this.isAnalyzing.set(true);
    const draft = this.profileDraft();
    const insights = await this.aiService.getQuestionnaireInsights(draft);

    this.analysisResult.set({
      healthScore: this.calculateStrategicScore(draft),
      recommendations: insights,
    });

    this.isAnalyzing.set(false);
  }

  private triggerGlitch() {
    this.isGlitching.set(true);
    setTimeout(() => this.isGlitching.set(false), 200);
  }

  private generateNeuralObservation(field: string, value: any): string | null {
    if (field === 'primaryGenre')
      return `ADAPTING_NEURAL_FILTERS_FOR_${value.toUpperCase()}_TRAJECTORY...`;
    if (field.includes('expertise'))
      return `MAPPING_TECHNICAL_AUTHORITY_AT_LEVEL_${value}...`;
    if (field.includes('isTourReady'))
      return `CALIBRATING_TOURING_STABILITY_VECTORS...`;
    if (field.includes('isSyncReady'))
      return `ANALYZING_SYNC_VIABILITY_MARKERS...`;
    if (field === 'brandVoices')
      return `RECOGNIZING_BRAND_RESONANCE:_${value.toUpperCase()}...`;
    return null;
  }

  private calculateStrategicScore(p: UserProfile): number {
    const s = this.strategicSignals();
    const avgSignal =
      (s.marketReadiness +
        s.identityTrust +
        s.careerMomentum +
        s.technicalAuthority +
        s.syncViability +
        s.touringStability) /
      6;
    let score = 50 + avgSignal / 2;
    if (p.primaryGenre) score += 5;
    return Math.round(Math.min(100, score));
  }

  async applyChanges() {
    this.showUplink.set(true);
    const completedProfile = {
      ...this.profileDraft(),
      strategicSignals: this.strategicSignals(),
      profileSetupCompleted: true,
      profileSetupCompletedAt: Date.now(),
    };

    const success = await this.uplinkService.initiateUplink(completedProfile);
    if (success) {
      this.complete.emit(completedProfile);
    }
  }
}
