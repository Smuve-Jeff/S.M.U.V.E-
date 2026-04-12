import { Injectable, computed, inject, signal } from '@angular/core';

import { UserProfileService } from './user-profile.service';
import { MainViewMode } from './user-context.service';
import { UIService } from './ui.service';

const DEFAULT_ARTIST_NAME = 'New Artist';

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
      profile.strategicGoals?.length ||
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
          'Answer the guided intelligence questions so recommendations and workspaces adapt to you.',
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
}
