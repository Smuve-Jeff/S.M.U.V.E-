import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';

import { UserProfileService } from './user-profile.service';
import { MainViewMode } from './user-context.service';
import { UIService } from './ui.service';

const DEFAULT_ARTIST_NAME = 'New Artist';

/**
 * Sprint C3 — First Beat Tour shape.
 *
 * Five stations walked end-to-end in ~5 minutes; the rest of the spotlight
 * tour UI picks each step off one at a time. Tourist steps use a permissive
 * `route: string` so we can route to `/store` and `/onboarding/tour` even
 * though those slugs aren't in the strict MainViewMode union.
 */
export interface OnboardingTourStep {
  id: string;
  title: string;
  description: string;
  route: string;
  cta: string;
  complete: boolean;
  queryParams?: Record<string, string>;
}

export interface OnboardingTour {
  id: string;
  title: string;
  pacingTotalMs: number;
  steps: OnboardingTourStep[];
  startedAt: number;
}

const TOUR_STORAGE_KEY = 'smuve_tour_started';
const TOUR_PROGRESS_KEY = 'smuve_tour_progress';

/** Default 5-minute First Beat tour — wired into the store/component below. */
const DEFAULT_TOUR_STEPS: ReadonlyArray<{
  id: string;
  title: string;
  description: string;
  route: string;
  cta: string;
  queryParams?: Record<string, string>;
}> = [
  {
    id: 'tour-profile',
    title: 'Lock the artist identity',
    description:
      'Open the profile, set your artist name, and pick a primary genre so the rest of the tour can read it.',
    route: 'profile',
    cta: 'Open Profile',
    queryParams: { tour: '1' },
  },
  {
    id: 'tour-studio',
    title: 'Step into the booth',
    description:
      'Visit the full studio. Drop a beat, swipe a synth, or trigger the AI Drummer. Anything counts.',
    route: 'studio',
    cta: 'Open Studio',
    queryParams: { tour: '1' },
  },
  {
    id: 'tour-produce',
    title: 'Run One-Tap Produce',
    description:
      'Try AI Produce — the orchestrator pulls the beat, the lyrics, and a quick mix preview together.',
    route: 'produce',
    cta: 'Open Produce',
    queryParams: { tour: '1', seed: 'midnight-rooftop-808' },
  },
  {
    id: 'tour-store',
    title: 'Browse the Store',
    description:
      'Pick a sound pack, instrument pack, or AI bundle. The 8-SKU catalog is yours to flip through.',
    route: 'store',
    cta: 'Open Store',
  },
  {
    id: 'tour-strategy',
    title: 'Plan the release',
    description:
      'See how the strategy hub tracks catalog health, drops, and the career ecosystem signals.',
    route: 'strategy',
    cta: 'Open Intel',
    queryParams: { tour: '1' },
  },
];

function readCompletedTourSteps(): Record<string, boolean> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(TOUR_PROGRESS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, boolean>;
      if (parsed && typeof parsed === 'object') return parsed;
    }
  } catch {
    /* ignore */
  }
  return {};
}

function writeCompletedTourSteps(record: Record<string, boolean>): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(TOUR_PROGRESS_KEY, JSON.stringify(record));
  } catch {
    /* ignore */
  }
}

export interface OnboardingStep {
  id: string;
  title: string;
  description: string;
  route: MainViewMode;
  cta: string;
  complete: boolean;
  queryParams?: Record<string, string>;
}

@Injectable({
  providedIn: 'root',
})
export class OnboardingService {
  private readonly profileService = inject(UserProfileService);
  private readonly uiService = inject(UIService);
  private readonly dismissed = signal(this.readDismissedState());

  readonly steps = computed<OnboardingStep[]>(() => {
    const profile = this.profileService.profile();
    const recentModes = this.uiService.recentViewModes();
    const visitedCreative =
      recentModes.includes('studio') ||
      recentModes.includes('piano-roll') ||
      recentModes.includes('vocal-suite');
    const visitedStrategy =
      recentModes.includes('strategy') || recentModes.includes('analytics');

    const hasIdentity =
      profile.artistName.trim() !== '' &&
      profile.artistName !== DEFAULT_ARTIST_NAME &&
      Boolean(profile.primaryGenre);
    const hasProfileDepth = Boolean(
      profile.website ||
      profile.proIpi ||
      profile.skills?.length ||
      profile.brandVoices?.length
    );
    const hasQuestionnaireSignals = Boolean(
      (profile.musicalJourney?.songwritingStyle !== 'Unspecified' &&
        profile.strategicGoals?.length) ||
      profile.expertise?.catalyst ||
      Object.keys(profile.genreSpecificData || {}).length
    );
    const hasCatalogSeed = (profile.catalog || []).length > 0;

    return [
      {
        id: 'identity',
        title: 'Shape the artist identity',
        description:
          'Set your artist name, genre, website, and identity signals before moving deeper.',
        route: 'profile',
        cta: 'Open profile',
        complete: hasIdentity && hasProfileDepth,
      },
      {
        id: 'questionnaire',
        title: 'Run the onboarding questionnaire',
        description:
          'Engage with S.M.U.V.E for a fine-tuned meet and greet to calibrate your musical journey.',
        route: 'profile',
        queryParams: { questionnaire: '1' },
        cta: 'Launch questionnaire',
        complete: hasQuestionnaireSignals,
      },
      {
        id: 'create',
        title: 'Start creating',
        description:
          'Visit Studio, Piano Roll, or Vocal Suite to establish your first production trail.',
        route: 'studio',
        cta: 'Launch studio',
        complete: visitedCreative,
      },
      {
        id: 'launch',
        title: 'Plan the release path',
        description:
          'Visit strategy and release surfaces so the app can resume the right workflow next time.',
        route: 'strategy',
        cta: 'Open Intel Lab',
        complete: visitedStrategy && hasCatalogSeed,
      },
    ];
  });

  readonly progress = computed(() => {
    const steps = this.steps();
    const completed = steps.filter((step) => step.complete).length;
    return steps.length ? Math.round((completed / steps.length) * 100) : 100;
  });

  readonly nextStep = computed(() => {
    return this.steps().find((step) => !step.complete) ?? this.steps()[0];
  });

  readonly shouldShow = computed(() => {
    return !this.dismissed() && this.progress() < 100;
  });

  dismiss(): void {
    this.dismissed.set(true);
    if (typeof window !== 'undefined') {
      localStorage.setItem('smuve_onboarding_dismissed', 'true');
    }
  }

  reset(): void {
    this.dismissed.set(false);
    if (typeof window !== 'undefined') {
      localStorage.removeItem('smuve_onboarding_dismissed');
    }
  }

  private readDismissedState(): boolean {
    if (typeof window === 'undefined') {
      return false;
    }
    return localStorage.getItem('smuve_onboarding_dismissed') === 'true';
  }

  // ░░░ Sprint C3 — First Beat Tour ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░

  private router = inject(Router, { optional: true });

  /** Mutated signal — the active tour (null when no tour in flight). */
  readonly currentTour = signal<OnboardingTour | null>(null);

  /** Per-step persisted completion (id → done). */
  private readonly completedSteps = signal<Record<string, boolean>>(
    readCompletedTourSteps()
  );

  /**
   * Tour steps to render in FirstBeatTourComponent. The list always
   * re-hydrates from the persisted `completedSteps` map on first read so
   * the bar stays in sync after reloads.
   */
  readonly tourSteps = computed<OnboardingTourStep[]>(() => {
    const seeded = readCompletedTourSteps();
    return DEFAULT_TOUR_STEPS.map((step) => ({
      ...step,
      complete:
        this.completedSteps()[step.id] === true || seeded[step.id] === true,
    }));
  });

  /**
   * Tour progress, derived from completed steps. Reports 100 once every
   * step flips done, otherwise clamps to 99 (-1 if zero steps are done).
   */
  readonly tourProgress = computed<number>(() => {
    const steps = this.tourSteps();
    if (!steps.length) return 0;
    const done = steps.filter((s) => s.complete).length;
    return Math.round((done / steps.length) * 100);
  });

  startTour(): void {
    if (typeof window !== 'undefined') {
      localStorage.setItem(TOUR_STORAGE_KEY, '1');
    }
    this.currentTour.set({
      id: 'first-beat',
      title: 'First Beat Tour',
      pacingTotalMs: 300000,
      steps: this.tourSteps(),
      startedAt: Date.now(),
    });
  }

  completeTour(): void {
    for (const step of this.tourSteps()) {
      this.markStepComplete(step.id);
    }
    this.currentTour.set(null);
    if (typeof window !== 'undefined') {
      localStorage.removeItem(TOUR_STORAGE_KEY);
    }
  }

  exitTour(): void {
    this.currentTour.set(null);
    if (typeof window !== 'undefined') {
      localStorage.removeItem(TOUR_STORAGE_KEY);
    }
  }

  markStepComplete(id: string): void {
    this.completedSteps.update((map) => {
      const next = { ...map, [id]: true };
      writeCompletedTourSteps(next);
      return next;
    });
    // Re-emit the currentTour so consumers re-derive steps + progress.
    const live = this.currentTour();
    if (live) {
      this.currentTour.set({ ...live, steps: this.tourSteps() });
    }
  }

  /**
   * Sprint C3 — open a tour step: navigates to its route WITH queryParams.
   * The Router is optional because the OnboardingService is used in tests
   * that may not bootstrap a router; if absent, we just flip the step.
   */
  openStep(step: OnboardingTourStep): void {
    if (!this.router) return;
    this.router.navigate(['/' + step.route], { queryParams: step.queryParams });
  }
}
