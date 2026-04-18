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

  questions: Question[] = [
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
      id: 'hiphop-sub',
      type: 'select',
      text: 'Deep-dive into the Hip Hop spectrum.',
      description: 'Where does your sound live?',
      options: [
        'Boom Bap',
        'Trap',
        'Drill',
        'Conscious',
        'Melodic',
        'Experimental',
      ],
      field: 'genreSpecificData.hiphop_sub',
      condition: (p) => p.primaryGenre === 'Hip Hop',
    },
    {
      id: 'hiphop-complexity',
      type: 'range',
      text: 'Assess Lyrical Complexity.',
      description: '1 = Vibe/Melody focused, 10 = Bars/Wordplay heavy.',
      field: 'genreSpecificData.hiphop_complexity',
      condition: (p) => p.primaryGenre === 'Hip Hop',
    },
    {
      id: 'elec-sub',
      type: 'select',
      text: 'Specify your Electronic frequency.',
      options: ['Techno', 'House', 'Ambient', 'Dubstep', 'Phonk', 'Synthwave'],
      field: 'genreSpecificData.elec_sub',
      condition: (p) => p.primaryGenre === 'Electronic',
    },
    {
      id: 'elec-technical',
      type: 'range',
      text: 'Synthesizer Prowess.',
      description:
        'How deep into the circuitry do you go? (1 = Presets, 10 = Modular/Custom)',
      field: 'genreSpecificData.elec_technical',
      condition: (p) => p.primaryGenre === 'Electronic',
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
    if (this.currentStep() < this.activeQuestions().length - 1) {
      this.currentStep.update((s) => s + 1);
    } else {
      this.finalize();
    }
  }

  back() {
    if (this.currentStep() > 0) {
      this.currentStep.update((s) => s - 1);
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

  private calculateStrategicScore(p: UserProfile): number {
    let score = 60;
    if (p.primaryGenre) score += 5;
    if (p.strategicGoals && p.strategicGoals.length > 0) score += 10;
    if (p.brandVoices && p.brandVoices.length > 1) score += 5;
    if (p.expertise && p.expertise.technical_mastery > 7) score += 10;
    if (p.expertise && p.expertise.catalyst) score += 5;
    return Math.min(100, score);
  }

  async applyChanges() {
    this.showUplink.set(true);
    const completedProfile = {
      ...this.profileDraft(),
      profileSetupCompleted: true,
      profileSetupCompletedAt: Date.now(),
    };

    const success = await this.uplinkService.initiateUplink(completedProfile);
    if (success) {
      this.complete.emit(completedProfile);
    }
  }
}
