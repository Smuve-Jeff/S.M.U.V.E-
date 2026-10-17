import { TestBed } from '@angular/core/testing';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import { FirstBeatTourComponent } from './first-beat-tour.component';
import { OnboardingService } from '../../services/onboarding.service';
import { UserProfileService } from '../../services/user-profile.service';
import { UIService } from '../../services/ui.service';

class StubProfile {
  profile = () => ({
    artistName: 'Test',
    primaryGenre: 'Trap',
    website: '',
    proIpi: '',
    skills: [],
    brandVoices: [],
    musicalJourney: { songwritingStyle: 'Unspecified' },
    strategicGoals: [],
    expertise: { catalyst: '' },
    genreSpecificData: {},
    catalog: [],
    careerGoals: [],
    knowledgeBase: { strategicHealthScore: 0 },
    settings: { ai: {} },
  });
  updateProfile = jest.fn();
}

class StubUI {
  recentViewModes = () => ['studio', 'strategy'];
  getRecentViewConfigs = () => [];
  navigateToView = jest.fn();
}

describe('FirstBeatTourComponent · Sprint C3', () => {
  let sut: FirstBeatTourComponent;
  let onboarding: OnboardingService;

  beforeEach(() => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('smuve_tour_progress');
      localStorage.removeItem('smuve_tour_started');
    }
    TestBed.configureTestingModule({
      imports: [CommonModule, RouterTestingModule, FirstBeatTourComponent],
      providers: [
        OnboardingService,
        { provide: Router, useValue: { navigate: jest.fn().mockResolvedValue(true), navigateByUrl: jest.fn().mockResolvedValue(true) } },
        { provide: UserProfileService, useClass: StubProfile },
        { provide: UIService, useClass: StubUI },
      ],
    });
    sut = TestBed.createComponent(FirstBeatTourComponent).componentInstance;
    onboarding = TestBed.inject(OnboardingService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('startTour() seeds a 5-step tour with pacing = 5 minutes', () => {
    sut.startTour();
    expect(onboarding.currentTour()).not.toBeNull();
    expect(onboarding.tourSteps().length).toBeGreaterThanOrEqual(5);
    expect(onboarding.currentTour()?.pacingTotalMs).toBe(300000);
  });

  it('markComplete() advances the tour progress + flips the step flag', () => {
    sut.startTour();
    const first = onboarding.tourSteps().find((s) => !s.complete);
    if (!first) throw new Error('expected at least one open step');
    sut.markComplete(first);
    const found = onboarding.tourSteps().find((s) => s.id === first.id);
    expect(found?.complete).toBe(true);
  });

  it('progress climbs to 100% as the user marks each step off', () => {
    sut.startTour();
    expect(onboarding.tourProgress()).toBeLessThan(100);
    for (const step of onboarding.tourSteps()) {
      onboarding.markStepComplete(step.id);
    }
    expect(onboarding.tourProgress()).toBe(100);
  });

  it('completeTour() clears currentTour so shouldShow = false after a reload', () => {
    sut.startTour();
    for (const step of onboarding.tourSteps()) {
      onboarding.markStepComplete(step.id);
    }
    sut.finishTour();
    expect(onboarding.currentTour()).toBeNull();
  });

  it('exitTour() resets state and clears persisted progress', () => {
    sut.startTour();
    sut.skipTour();
    expect(onboarding.currentTour()).toBeNull();
    if (typeof window !== 'undefined') {
      expect(localStorage.getItem('smuve_tour_started')).toBeNull();
    }
  });
});
