import {
  Component,
  signal,
  inject,
  output,
  computed,
  effect,
} from '@angular/core';
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
import type { StrategicSignals } from '../../types/profile.types';
import {
  EnhancedArtistQuestionnaireEngine,
  PHASES,
  type QuestionnaireQuestion,
  type QuestionnairePhase,
  type PhaseInfo,
  type PersonaSynthesis,
  type ProfileStrengthBreakdown,
  getGenreDeepDive,
} from '../../services/enhanced-artist-questionnaire-engine';

@Component({
  selector: 'app-artist-questionnaire',
  standalone: true,
  imports: [CommonModule, FormsModule, UplinkConsoleComponent],
  templateUrl: './artist-questionnaire.component.html',
  styleUrls: ['./artist-questionnaire.component.css'],
  animations: [
    trigger('fadeSlide', [
      transition(':enter', [
        style({ transform: 'translateY(18px)', opacity: 0 }),
        animate(
          '400ms cubic-bezier(0.16, 1, 0.3, 1)',
          style({ transform: 'translateY(0)', opacity: 1 })
        ),
      ]),
      transition(':leave', [
        animate(
          '250ms ease-in',
          style({ transform: 'translateY(-12px)', opacity: 0 })
        ),
      ]),
    ]),
    trigger('staggerFade', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateY(10px)' }),
        animate(
          '300ms ease-out',
          style({ opacity: 1, transform: 'translateY(0)' })
        ),
      ]),
    ]),
  ],
})
export class ArtistQuestionnaireComponent {
  private userProfileService = inject(UserProfileService);
  private aiService = inject(AiService);
  private uplinkService = inject(UplinkService);
  private engine = inject(EnhancedArtistQuestionnaireEngine);

  close = output<void>();
  complete = output<UserProfile>();

  // ── Core state ──────────────────────────────────────────────
  currentPhaseIndex = signal(0);
  currentQuestionIndex = signal(0);
  profileDraft = signal<UserProfile>(
    this.deepClone(this.userProfileService.profile())
  );
  isAnalyzing = signal(false);
  analysisResult = signal<any>(null);
  showUplink = signal(false);
  isGlitching = signal(false);
  showPersonaCard = signal(false);
  completedPhases = signal<Set<QuestionnairePhase>>(new Set());

  // ── AI Chat Log ─────────────────────────────────────────────
  aiChatLog = signal<
    Array<{ type: 'observation' | 'adaptation' | 'system'; text: string }>
  >([
    { type: 'system', text: 'S.M.U.V.E Neural Fine-Tune v2.0 Initialized.' },
    { type: 'system', text: 'Awaiting artist data vectors for analysis...' },
  ]);

  // ── Computed ────────────────────────────────────────────────
  readonly phases = PHASES;

  /** Questions for the current phase, filtered by conditions */
  currentPhaseQuestions = computed<QuestionnaireQuestion[]>(() => {
    const phase = this.phases[this.currentPhaseIndex()];
    return this.engine.questionsForPhase(phase.id, this.profileDraft());
  });

  /** Current question being displayed */
  currentQuestion = computed<QuestionnaireQuestion | undefined>(() => {
    return this.currentPhaseQuestions()[this.currentQuestionIndex()];
  });

  /** Progress across entire questionnaire */
  totalProgress = computed(() => {
    const allQs = this.engine.allQuestions.filter(
      (q) => !q.condition || q.condition(this.profileDraft())
    );
    const answered = allQs.filter((q) => this.isFieldAnswered(q.field)).length;
    return Math.round((answered / Math.max(allQs.length, 1)) * 100);
  });

  /** Phase-level progress */
  phaseProgress = computed(() => {
    const qs = this.currentPhaseQuestions();
    if (qs.length === 0) return 100;
    const answered = qs.filter((q) => this.isFieldAnswered(q.field)).length;
    return Math.round((answered / qs.length) * 100);
  });

  /** Live strength breakdown */
  strengthBreakdown = computed<ProfileStrengthBreakdown>(() => {
    return this.engine.calculateStrength(this.profileDraft());
  });

  /** Whether this is the last question of the last phase */
  isLastQuestion = computed(() => {
    const phaseQs = this.currentPhaseQuestions();
    const isLastInPhase = this.currentQuestionIndex() >= phaseQs.length - 1;
    const isLastPhase = this.currentPhaseIndex() >= this.phases.length - 1;
    return isLastInPhase && isLastPhase;
  });

  /** Get options for current question (handles dynamic subgenres) */
  getOptionsForCurrentQuestion(): any[] {
    const q = this.currentQuestion();
    if (!q) return [];
    // For subgenre questions, dynamically populate from genre deep dive
    if (q.id === 'q7') {
      return this.subgenreOptions();
    }
    return q.options || [];
  }

  /** Check if a chip value is selected */
  isChipSelected(field: string, value: string): boolean {
    const arr = this.getValue(field);
    return Array.isArray(arr) && arr.includes(value);
  }

  /** Get count of selected items */
  getSelectedCount(field: string): number {
    const arr = this.getValue(field);
    return Array.isArray(arr) ? arr.length : 0;
  }

  /** Get numeric value for range (safe for templates) */
  getRangeVal(field: string): number {
    const v = this.getValue(field);
    return typeof v === 'number' ? v : 5;
  }

  /** Genre deep dive data */
  genreDeepDive = computed(() =>
    getGenreDeepDive(this.profileDraft().primaryGenre || 'Hip Hop')
  );

  /** Subgenre options from current genre */
  subgenreOptions = computed(() =>
    this.engine.getSubgenreOptions(
      this.profileDraft().primaryGenre || 'Hip Hop'
    )
  );

  /** Phase info for current phase */
  currentPhaseInfo = computed<PhaseInfo>(
    () => this.phases[this.currentPhaseIndex()]
  );

  /** Suggested genre icons */
  genreIcons: Record<string, string> = {
    'Hip Hop': '🎤',
    'R&B': '🎵',
    Electronic: '⚡',
    Rock: '🎸',
    Pop: '🌟',
    Jazz: '🎷',
    Latin: '🕺',
    Country: '🤠',
    Afrobeats: '🌍',
    Classical: '🎻',
    Metal: '🤘',
    Folk: '🪕',
    Reggae: '🌴',
  };

  // ── Methods ─────────────────────────────────────────────────

  /** Get current value from draft */
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

  /** Update a field value */
  updateValue(field: string, value: any) {
    this.profileDraft.update((p) => {
      const updated = JSON.parse(JSON.stringify(p));
      const q = this.currentQuestion();
      const parts = field.split('.');
      let target: any = updated;

      for (let i = 0; i < parts.length - 1; i++) {
        const part = parts[i];
        if (
          part === '__proto__' ||
          part === 'constructor' ||
          part === 'prototype'
        )
          return p;
        if (!target[part]) target[part] = {};
        target = target[part];
      }

      const lastPart = parts[parts.length - 1];
      if (
        lastPart === '__proto__' ||
        lastPart === 'constructor' ||
        lastPart === 'prototype'
      )
        return p;

      if (q?.type === 'multi-select' || q?.type === 'chip-group') {
        if (!Array.isArray(target[lastPart])) target[lastPart] = [];
        if (target[lastPart].includes(value)) {
          target[lastPart] = target[lastPart].filter((v: any) => v !== value);
        } else {
          const max = q.maxSelections || 5;
          target[lastPart] = [...target[lastPart], value].slice(-max);
        }
      } else if (q?.type === 'toggle') {
        target[lastPart] = value === 'true' || value === true ? 'true' : '';
      } else if (q?.type === 'range') {
        target[lastPart] = Number(value);
      } else {
        target[lastPart] = value;
      }

      return updated;
    });

    // Generate AI response
    const q = this.currentQuestion();
    const val = this.getValue(field);
    if (q && val !== undefined && val !== null && val !== '') {
      const response = this.engine.generateAIQuestionResponse(q, val);
      this.aiChatLog.update((logs) =>
        [
          ...logs,
          { type: 'observation' as const, text: response.observation },
          { type: 'adaptation' as const, text: response.adaptation },
        ].slice(-20)
      );
    }
  }

  /** Check if a field has a meaningful value */
  isFieldAnswered(field: string): boolean {
    const value = this.getValue(field);
    if (value === undefined || value === null) return false;
    if (typeof value === 'string')
      return value.trim() !== '' && value !== 'Unspecified';
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === 'boolean') return true;
    if (typeof value === 'number') return value > 0;
    return true;
  }

  /** Navigate to next question/phase */
  async next() {
    const qs = this.currentPhaseQuestions();
    const q = this.currentQuestion();

    if (q && !this.isFieldAnswered(q.field)) {
      this.aiChatLog.update((logs) => [
        ...logs,
        {
          type: 'system',
          text: `⚠️ S.M.U.V.E recommends answering "${q.text}" for optimal profile calibration.`,
        },
      ]);
    }

    this.triggerGlitch();

    if (this.currentQuestionIndex() < qs.length - 1) {
      this.currentQuestionIndex.update((i) => i + 1);
    } else {
      // Phase complete
      const phaseId = this.phases[this.currentPhaseIndex()].id;
      this.completedPhases.update((s) => {
        s.add(phaseId);
        return new Set(s);
      });

      if (this.currentPhaseIndex() < this.phases.length - 1) {
        this.currentPhaseIndex.update((i) => i + 1);
        this.currentQuestionIndex.set(0);
        this.aiChatLog.update((logs) => [
          ...logs,
          {
            type: 'system',
            text: `🧠 PHASE COMPLETE: ${PHASES[this.currentPhaseIndex() - 1].title} — moving to ${PHASES[this.currentPhaseIndex()].title}`,
          },
        ]);
      } else {
        // All phases complete → generate AI analysis
        await this.finalize();
      }
    }
  }

  /** Navigate to previous question/phase */
  back() {
    this.triggerGlitch();
    if (this.currentQuestionIndex() > 0) {
      this.currentQuestionIndex.update((i) => i - 1);
    } else if (this.currentPhaseIndex() > 0) {
      this.currentPhaseIndex.update((i) => i - 1);
      const prevQs = this.engine.questionsForPhase(
        this.phases[this.currentPhaseIndex()].id,
        this.profileDraft()
      );
      this.currentQuestionIndex.set(Math.max(0, prevQs.length - 1));
    }
  }

  /** Go to a specific phase */
  goToPhase(index: number) {
    if (index <= this.currentPhaseIndex()) {
      this.currentPhaseIndex.set(index);
      this.currentQuestionIndex.set(0);
    }
  }

  /** Finalize all phases and generate AI analysis */
  async finalize() {
    this.isAnalyzing.set(true);
    const draft = this.profileDraft();

    try {
      const analysis = await this.engine.generateAIAnalysis(draft);
      this.analysisResult.set(analysis);
      this.showPersonaCard.set(true);
    } catch (e) {
      this.aiChatLog.update((logs) => [
        ...logs,
        {
          type: 'system',
          text: '⚠️ AI analysis encountered an error. Using local intelligence.',
        },
      ]);
      this.analysisResult.set({
        persona: await this.engine.synthesizePersona(draft),
        breakdown: this.strengthBreakdown(),
        recommendations: [],
        insights: [],
      });
    }

    this.isAnalyzing.set(false);
  }

  /** Apply profile changes and commit */
  async applyChanges() {
    this.showUplink.set(true);
    const draft = this.profileDraft();
    const completedProfile: UserProfile = {
      ...draft,
      strategicSignals: this.calculateStrategicSignals(draft),
      profileSetupCompleted: true,
      profileSetupCompletedAt: Date.now(),
    };

    const success = await this.uplinkService.initiateUplink(completedProfile);
    if (success) {
      this.complete.emit(completedProfile);
    }
  }

  /** Calculate strategic signals from draft */
  private calculateStrategicSignals(p: UserProfile): StrategicSignals {
    const s: StrategicSignals = {
      marketReadiness: 0,
      identityTrust: 0,
      careerMomentum: 0,
      technicalAuthority: 0,
      syncViability: 0,
      touringStability: 0,
    };

    if (p.primaryGenre) s.marketReadiness += 20;
    if (p.musicalJourney?.yearsInIndustry > 5) s.marketReadiness += 10;
    if (p.website) s.marketReadiness += 10;
    if (p.brandVoices?.length) s.marketReadiness += 20;
    if (p.strategicGoals?.length) s.marketReadiness += 20;

    if (p.expertise) {
      s.technicalAuthority =
        (p.expertise.production || 0) * 5 +
        (p.expertise.technical_mastery || 0) * 5;
      if (p.expertise.songwriting)
        s.technicalAuthority += p.expertise.songwriting * 3;
    }

    if (p.catalog?.length) s.careerMomentum += 20;
    if (p.musicalJourney?.releaseVelocity === 'Waterfall (Weekly)')
      s.careerMomentum += 20;
    if (p.strategicGoals?.length > 2) s.careerMomentum += 20;

    if (p.syncDetails?.hasStems === 'Everything Archived')
      s.syncViability += 25;
    if (p.syncDetails?.isSyncReady === 'Full Stem Mastery')
      s.syncViability += 50;

    if (p.touringDetails?.isTourReady === 'Global Ready')
      s.touringStability += 40;
    if (p.touringDetails?.hasBackline === 'Full Self-Sustained')
      s.touringStability += 30;

    if (p.legalInfrastructure?.hasRegisteredWorks) s.identityTrust += 30;
    if (p.legalInfrastructure?.proAffiliation !== 'None') s.identityTrust += 30;

    Object.keys(s).forEach((k) => {
      (s as any)[k] = Math.min(100, (s as any)[k]);
    });
    return s;
  }

  private triggerGlitch() {
    this.isGlitching.set(true);
    setTimeout(() => this.isGlitching.set(false), 200);
  }

  private deepClone<T>(obj: T): T {
    return JSON.parse(JSON.stringify(obj));
  }
}
