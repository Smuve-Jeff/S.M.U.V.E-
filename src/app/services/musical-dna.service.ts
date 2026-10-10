import { Injectable, computed, inject } from '@angular/core';
import { UserProfileService } from './user-profile.service';
import { SmuveKnowledgeEngine, KnowledgeEntry, KnowledgeCategory } from './smuve-knowledge-engine';
import { LoggingService } from './logging.service';
import {
  DNA_VERSION,
  DnaEvidenceInput,
  DnaLesson,
  MusicalDnaReading,
  MusicalDnaState,
  createInitialMusicalDnaState,
  dnaLessonPlan,
  buildMusicalDnaContext,
  readMusicalDna,
  recordDnaEvidence,
} from '../types/musical-dna.types';

/**
 * S.M.U.V.E. Musical DNA — the live read / learn / teach / adapt loop.
 *
 * ── What it reads
 * The fingerprint reconciles two independent sources per axis:
 *   • declared — the questionnaire's `musical-dna` phase and blueprint
 *   • observed — catalogue works, studio/audio/DJ settings, expertise,
 *     logged recommendation decisions, and any live signal recorded here
 *
 * ── How it learns
 * `record()` appends recency-weighted evidence (half-life
 * {@link DNA_HALF_LIFE_DAYS}). Newest behaviour counts fully, old behaviour
 * fades — so the fingerprint actually moves when an artist changes habits.
 *
 * ── How it remembers
 * The evidence log and the last computed snapshot live ON the artist's
 * profile (`profile.musicalDna`), so they inherit the profile's existing
 * local backup and cloud sync instead of introducing a second store.
 *
 * ── How it teaches and adapts
 * `lessons()` turns the weakest axes into the app's own curriculum via
 * SmuveKnowledgeEngine, and `promptBlock()` feeds every AI surface the
 * fingerprint plus its non-negotiable rules through
 * `buildArtistMusicContext` (see `buildMusicalDnaContext`).
 *
 * Everything the engine derives is explainable: each axis carries the exact
 * evidence that produced it, so no reading is a black box.
 */
@Injectable({ providedIn: 'root' })
export class MusicalDnaService {
  private profiles = inject(UserProfileService);
  private knowledge = inject(SmuveKnowledgeEngine);
  private logger = inject(LoggingService);

  /** Persisted evidence + snapshot for the active artist. */
  readonly state = computed<MusicalDnaState>(
    () => this.profiles.profile()?.musicalDna ?? createInitialMusicalDnaState(),
  );

  /**
   * The live fingerprint. Computed rather than cached: every profile mutation
   * (new work, changed setting, finished questionnaire, recorded signal) is
   * reflected immediately with no invalidation to forget.
   */
  readonly reading = computed<MusicalDnaReading>(() => {
    const profile = this.profiles.profile();
    return readMusicalDna(profile, profile?.musicalDna);
  });

  /** 0..100 — how complete and self-consistent the fingerprint currently is. */
  readonly fidelity = computed(() => this.reading().fidelity);

  /** One-line fingerprint an artist can read at a glance. */
  readonly signature = computed(() => this.reading().signature);

  /**
   * The next lessons, ordered by weakness, each backed by a real knowledge
   * entry from S.M.U.V.E.'s own curriculum.
   */
  readonly lessons = computed<DnaLesson[]>(() => this.resolveLessons(this.reading()));

  /** Rules S.M.U.V.E. must not break for this artist. */
  readonly protections = computed(() =>
    this.reading().adaptations.filter((a) => a.severity === 'protect'),
  );

  /** The compact block injected into every AI prompt. */
  promptBlock(): string {
    return buildMusicalDnaContext(this.profiles.profile());
  }

  /**
   * Learn one signal and remember it.
   *
   * Any surface holding a real observation (a mix move, a rejected idea, a
   * chosen key, a finished take) calls this; the reading updates immediately
   * and the evidence is persisted onto the profile. Safe to call often — the
   * log is capped and each axis is capped when scoring.
   */
  async record(input: DnaEvidenceInput): Promise<MusicalDnaReading> {
    const profile = this.profiles.profile();
    if (!profile) return this.reading();

    const nextState = recordDnaEvidence(profile.musicalDna, input);
    const reading = readMusicalDna(profile, nextState);

    try {
      await this.profiles.updateProfile({ musicalDna: { ...nextState, lastReading: reading } });
    } catch (error) {
      // Learning must never break the surface that reported the signal.
      this.logger.warn('Musical DNA evidence could not be persisted', error);
    }
    return reading;
  }

  /**
   * Recompute from the current profile and remember the snapshot. Cheap and
   * idempotent; call after a batch of profile edits instead of recording each
   * field individually.
   */
  async refresh(): Promise<MusicalDnaReading> {
    const profile = this.profiles.profile();
    if (!profile) return this.reading();
    const state = profile.musicalDna ?? createInitialMusicalDnaState();
    const reading = readMusicalDna(profile, state);
    try {
      await this.profiles.updateProfile({
        musicalDna: { ...state, version: DNA_VERSION, lastReading: reading },
      });
    } catch (error) {
      this.logger.warn('Musical DNA snapshot could not be persisted', error);
    }
    return reading;
  }

  /** Forget the learned log and start the fingerprint over. */
  async reset(): Promise<void> {
    await this.profiles.updateProfile({ musicalDna: createInitialMusicalDnaState() });
  }

  /** Explains a single axis, including the evidence behind it. */
  explain(dimension: MusicalDnaReading['dimensions'][number]['id']) {
    return this.reading().dimensions.find((d) => d.id === dimension) ?? null;
  }

  // ───────────────────────────────────────────────────────────────────────

  /**
   * Pairs each weak axis with the nearest entry in S.M.U.V.E.'s knowledge
   * base so the "teach" step is the app's own curriculum, not invented
   * advice. Falls back to the axis coach when no entry matches.
   */
  private resolveLessons(reading: MusicalDnaReading): DnaLesson[] {
    return dnaLessonPlan(reading).map((lesson) => {
      const entry = this.bestKnowledgeEntry(lesson.category, lesson.title);
      if (!entry) return lesson;
      return {
        ...lesson,
        title: entry.title || lesson.title,
        action: entry.actionRequired || lesson.action,
      };
    });
  }

  private bestKnowledgeEntry(category: string, hint: string): KnowledgeEntry | null {
    try {
      const entries = this.knowledge.getByCategory(category as KnowledgeCategory);
      if (!entries?.length) return null;
      const words = hint.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
      return (
        entries.find((e) => words.some((w) => e.title.toLowerCase().includes(w))) ??
        entries.find((e) => Boolean(e.actionRequired)) ??
        entries[0]
      );
    } catch {
      return null;
    }
  }
}
