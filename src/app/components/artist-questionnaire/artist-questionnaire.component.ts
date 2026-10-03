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
import { ArtistIntelligenceService } from '../../services/artist-intelligence.service';
import { InteractionDialogService } from '../../services/interaction-dialog.service';
import { UplinkConsoleComponent } from '../uplink-console/uplink-console.component';
import { animate, style, transition, trigger } from '@angular/animations';
import type { StrategicSignals } from '../../types/profile.types';
import { questionnaireReadLine } from '../../services/artist-profile-read';
import { SMUVE_PERSONAS } from '../../types/persona.types';
import {
  EnhancedArtistQuestionnaireEngine,
  PHASES,
  GENRE_OPTIONS,
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
  private artistIntelligence = inject(ArtistIntelligenceService);
  private dialog = inject(InteractionDialogService);

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
  readonly intelligenceReport = computed(() => this.artistIntelligence.analyze(this.profileDraft()));
  showUplink = signal(false);
  /** Set once the uplink has persisted the interview. */
  committed = signal(false);
  isGlitching = signal(false);
  showPersonaCard = signal(false);
  completedPhases = signal<Set<QuestionnairePhase>>(new Set());

  // ── Artist-to-S.M.U.V.E. copilot ────────────────────────────
  /** The freeform question the artist wants answered in the current context. */
  aiCoachQuestion = signal('');
  aiCoachAnswer = signal('');
  aiCoachBusy = signal(false);
  private aiCoachRequest = 0;
  readonly aiCoachPrompts = [
    'What should I prioritize next?',
    'How can I make this identity more distinctive?',
    'Turn my answers into a practical release move.',
  ];

  /** Live filter for the 40+ genre catalog (question q6). */
  genreSearch = signal('');
  readonly genreOptions = GENRE_OPTIONS;

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

  /**
   * Option lists owned by a shared catalog instead of the question literal.
   *
   * The AI-persona question must offer exactly the modes Settings and the
   * persona prompt builders honor — otherwise an onboarding answer lands on a
   * display name no other surface recognizes.
   */
  private readonly canonicalOptionsByField: Record<string, any[]> = {
    'settings.ai.commanderPersona': SMUVE_PERSONAS.map((persona) => ({
      label: persona.isOminous
        ? `${persona.label} (Default)`
        : persona.label,
      value: persona.id,
      icon: persona.icon,
      description: persona.description,
    })),
  };

  /** Get options for current question (handles dynamic subgenres + genre search) */
  getOptionsForCurrentQuestion(): any[] {
    const q = this.currentQuestion();
    if (!q) return [];
    const canonical = this.canonicalOptionsByField[q.field as string];
    if (canonical) return canonical;
    // For subgenre questions, dynamically populate from genre deep dive
    if (q.id === 'q7') {
      return this.subgenreOptions();
    }
    // For the primary-genre question, filter the full catalog by search text
    if (q.id === 'q6') {
      const query = this.genreSearch().trim().toLowerCase();
      if (!query) return q.options || [];
      return (q.options || []).filter((opt: any) =>
        String(opt.label).toLowerCase().includes(query)
      );
    }
    return q.options || [];
  }

  /** Whether the current question is the genre picker (shows search box) */
  isGenreQuestion = computed(() => this.currentQuestion()?.id === 'q6');

  /** Reset the genre search whenever a genre is chosen. */
  selectGenreOption(value: string) {
    this.updateValue('primaryGenre', value);
    this.genreSearch.set('');
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
        // Store a real boolean so downstream consumers (`settings.ai.*`,
        // `autoGenerateEpk`, etc.) don't receive stringified flags.
        target[lastPart] = value === 'true' || value === true;
      } else if (q?.type === 'range') {
        target[lastPart] = Number(value);
      } else {
        target[lastPart] = value;
      }

      return updated;
    });

    // Avoid treating every keystroke in long-form answers as a new AI event.
    // Selectors and chips can respond immediately; text answers are registered
    // when the artist advances, which keeps the monitor useful rather than noisy.
    const q = this.currentQuestion();
    const val = this.getValue(field);
    if (
      q &&
      q.type !== 'text' &&
      q.type !== 'textarea' &&
      val !== undefined &&
      val !== null &&
      val !== ''
    ) {
      this.appendQuestionSignal(q, val);
    }
  }

  private appendQuestionSignal(question: QuestionnaireQuestion, answer: any) {
    const response = this.engine.generateAIQuestionResponse(question, answer);
    // The S.M.U.V.E. read of the answer is derived from the draft the artist has
    // already built (genre, signature sound, declared barrier), so the live
    // monitor reacts to real evidence instead of printing one template line for
    // every artist. Composed here because the engine's generator carries the
    // generic phase context; this layer carries the artist-specific read.
    const read = questionnaireReadLine(
      question.field,
      answer,
      this.profileDraft(),
      question.type
    );
    this.aiChatLog.update((logs) =>
      [
        ...logs,
        { type: 'observation' as const, text: response.observation },
        {
          type: 'adaptation' as const,
          text: read ? `${response.adaptation} ${read}` : response.adaptation,
        },
      ].slice(-20)
    );
  }

  /** Ask S.M.U.V.E. about the current draft without auto-submitting it. */
  async askAiCoach(question = this.aiCoachQuestion()) {
    const prompt = question.trim().slice(0, 500);
    if (!prompt || this.aiCoachBusy()) return;

    const requestId = ++this.aiCoachRequest;
    this.aiCoachQuestion.set(prompt);
    this.aiCoachBusy.set(true);
    this.aiCoachAnswer.set('');
    const current = this.currentQuestion();
    const currentAnswer = current ? this.getValue(current.field) : undefined;
    const context = [
      `Artist: ${this.profileDraft().artistName || 'unnamed artist'}`,
      `Genre: ${this.profileDraft().primaryGenre || 'not selected'}`,
      `Current phase: ${this.currentPhaseInfo().title}`,
      current ? `Current prompt: ${current.text}` : '',
      currentAnswer !== undefined && currentAnswer !== ''
        ? `Current answer: ${JSON.stringify(currentAnswer)}`
        : '',
      `Profile completion: ${this.totalProgress()}%`,
    ]
      .filter(Boolean)
      .join('\n');

    try {
      const answer = await this.aiService.getAIResponse(
        this.buildCoachPrompt(prompt, context)
      );
      if (requestId !== this.aiCoachRequest) return;
      this.aiCoachAnswer.set(answer?.trim() || 'No signal returned. Try a more specific question.');
      this.aiChatLog.update((logs) =>
        [
          ...logs,
          { type: 'system' as const, text: `ARTIST QUERY: ${prompt}` },
          { type: 'adaptation' as const, text: answer?.trim() || 'No signal returned.' },
        ].slice(-20)
      );
    } catch {
      if (requestId === this.aiCoachRequest) {
        this.aiCoachAnswer.set('S.M.U.V.E. is offline. Your draft is safe—continue the uplink and retry shortly.');
      }
    } finally {
      if (requestId === this.aiCoachRequest) this.aiCoachBusy.set(false);
    }
  }

  /**
   * The in-uplink coach prompt.
   *
   * The questionnaire is a S.M.U.V.E. surface, so it carries the same persona
   * contract as the chatbot — without it the artist gets a polite generic
   * assistant mid-interview and the character breaks exactly where the artist
   * is paying attention. The draft reading is attached so the answer is built
   * on answers already given instead of asking the artist to restate them.
   */
  private buildCoachPrompt(prompt: string, context: string): string {
    const report = this.intelligenceReport();
    const reading = [
      report.strengths[0] ? `- Strength: ${report.strengths[0]}` : '',
      report.weaknesses[0] ? `- Gap: ${report.weaknesses[0]}` : '',
      report.nextBestMoves[0] ? `- Next move: ${report.nextBestMoves[0]}` : '',
      `- Differentiation score: ${report.differentiationScore}/100`,
    ]
      .filter(Boolean)
      .join('\n');

    return [
      'You are S.M.U.V.E. 2.0, running the Artist DNA Uplink interview.',
      'CHARACTER CONTRACT (never break it, even while coaching):',
      this.aiService.personaDirectives(),
      '',
      context,
      '',
      'S.M.U.V.E READING OF THE DRAFT (already known — use it, never ask the artist to repeat it):',
      reading,
      '',
      `Artist asks: ${prompt}`,
      '',
      'Reply in 3 concise parts: (1) direct answer, (2) one concrete next action, (3) one question that would improve your advice. Stay in the character above — arrogant, precise, aimed at the work rather than the person. Do not invent facts or claim to have changed the profile.',
    ].join('\n');
  }

  askSuggestedAiPrompt(prompt: string) {
    this.aiCoachQuestion.set(prompt);
    void this.askAiCoach(prompt);
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

    if (
      q &&
      (q.type === 'text' || q.type === 'textarea') &&
      this.isFieldAnswered(q.field)
    ) {
      this.appendQuestionSignal(q, this.getValue(q.field));
    }

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
      // Keep the local evidence report alongside model output so AI can never
      // hide missing identity signals behind a polished generic persona.
      this.analysisResult.set({
        ...analysis,
        intelligence: this.intelligenceReport(),
      });
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
        intelligence: this.intelligenceReport(),
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
      this.committed.set(true);
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

    if (p.primaryGenre) s.marketReadiness += 15;
    if (p.musicalJourney?.yearsInIndustry > 5) s.marketReadiness += 10;
    if (p.website) s.marketReadiness += 10;
    if (p.brandVoices?.length) s.marketReadiness += 15;
    if (p.strategicGoals?.length) s.marketReadiness += 15;
    if (p.musicalJourney?.signatureSound) s.marketReadiness += 15;
    if ((p.musicalJourney?.incomeStreams?.length || 0) >= 3)
      s.marketReadiness += 10;
    if (p.musicalJourney?.vocalRange) s.identityTrust += 10;

    if (p.expertise) {
      s.technicalAuthority =
        (p.expertise.production || 0) * 5 +
        (p.expertise.technical_mastery || 0) * 5;
      if (p.expertise.songwriting)
        s.technicalAuthority += p.expertise.songwriting * 3;
      if (p.expertise.performance)
        s.touringStability += p.expertise.performance * 3;
      if (p.expertise.business) s.identityTrust += p.expertise.business * 3;
    }

    if (p.catalog?.length) s.careerMomentum += 20;
    if (p.musicalJourney?.releaseVelocity === 'Waterfall (Weekly)')
      s.careerMomentum += 20;
    if (p.strategicGoals?.length > 2) s.careerMomentum += 20;
    if (p.musicalJourney?.breakthroughMoment) s.careerMomentum += 10;
    if ((p.musicalJourney?.incomeStreams?.length || 0) >= 3)
      s.careerMomentum += 10;

    // Sync readiness is a graded scale (q30): 'Not Started' → 'One-Stop
    // Qualified'. Award by rank so a lower answer cannot outscore a higher one,
    // and so the top two tiers are actually reachable.
    const syncRank: Record<string, number> = {
      'Basics Ready': 25,
      'Full Stem Mastery': 40,
      'One-Stop Qualified': 50,
    };
    s.syncViability += syncRank[String(p.syncDetails?.isSyncReady)] ?? 0;
    // Stems availability is graded too ('No' | 'Partial' | 'Full Multitrack',
    // the profile editor's catalog). The old check looked for 'Everything
    // Archived', which nothing writes, so stem prep never scored.
    const stems = String(p.syncDetails?.hasStems ?? '');
    if (stems === 'Full Multitrack') s.syncViability += 25;
    else if (stems === 'Partial') s.syncViability += 12;

    // Touring readiness is a graded scale too (q29): 'Studio Only' → 'Global
    // Ready'. Ranked so 'Global Ready' is the ceiling rather than the only
    // scoring answer.
    const tourRank: Record<string, number> = {
      'Local Gigs': 15,
      'Regional Ready': 30,
      'Global Ready': 40,
    };
    s.touringStability += tourRank[String(p.touringDetails?.isTourReady)] ?? 0;
    // Backline readiness was previously compared against 'Full Self-Sustained',
    // which no writer ever stores — the branch was dead. The profile editor
    // stores the yes/no answer, so score that.
    if (p.touringDetails?.hasBackline === 'Yes') s.touringStability += 30;

    // q28 stores a tri-state string ('No' | 'Partial' | 'Yes'), and the bare
    // truthiness test scored 'No' as registered works — awarding 30 trust for
    // explicitly owning nothing. Score the actual answer.
    const works = String(p.legalInfrastructure?.hasRegisteredWorks ?? '');
    if (works === 'Yes') s.identityTrust += 30;
    else if (works === 'Partial') s.identityTrust += 15;
    else if (works === 'true') s.identityTrust += 30;

    if (p.legalInfrastructure?.proAffiliation && p.legalInfrastructure.proAffiliation !== 'None')
      s.identityTrust += 30;

    Object.keys(s).forEach((k) => {
      (s as any)[k] = Math.min(100, (s as any)[k]);
    });
    return s;
  }

  /**
   * Guarded exit. The X button (and the close action in the results footer)
   * dropped every uncommitted answer with no warning, while the commit button
   * sat right next to it — one mis-tap silently erased a full interview.
   * Committing is the only path that persists, so an exit with real progress
   * asks first.
   */
  async requestClose(): Promise<void> {
    // A committed interview has nothing left to lose. The uplink console's
    // RETURN_TO_COMMAND button routes here, and telling an artist their
    // committed answers are "not committed yet" would be a lie.
    //
    // The console offers that button the moment its stage reaches `complete`,
    // but `committed` only flips when the uplink promise resolves one stage
    // later — so clicking in that window must still count as committed. The
    // uplink's own stage is the source of truth: by then the profile has
    // already been written during the `profile_commit` stage.
    if (
      this.committed() ||
      this.uplinkService.status().stage === 'complete' ||
      this.totalProgress() === 0 ||
      this.isAnalyzing()
    ) {
      this.close.emit();
      return;
    }
    const confirmed = await this.dialog.confirm({
      title: 'Discard your answers?',
      message:
        'This interview is not committed yet. Leaving now discards everything you answered. Commit Neural Realignment to keep it.',
      confirmLabel: 'Discard & exit',
      cancelLabel: 'Keep answering',
      tone: 'danger',
    });
    if (confirmed) this.close.emit();
  }

  private triggerGlitch() {
    this.isGlitching.set(true);
    setTimeout(() => this.isGlitching.set(false), 200);
  }

  private deepClone<T>(obj: T): T {
    return JSON.parse(JSON.stringify(obj));
  }
}
