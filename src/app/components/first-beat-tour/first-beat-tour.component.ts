import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { OnboardingService } from '../../services/onboarding.service';
import { OnboardingStep } from '../../services/onboarding.service';

/**
 * Sprint C3 — First Beat Tour
 *
 * Fullscreen overlay that walks a brand-new artist through five stations
 * (Profile, Studio, One-Tap Produce, Store, Career) in ~5 minutes. The tour
 * reads from `OnboardingService.tourProgress()` so each step's completion
 * flag drives the visual progress bar.
 *
 * Actions:
 *   • "Open Step"    — navigates to the route + queryParams of the current step
 *   • "Mark Complete" — flips the step's persisted flag via OnboardingService
 *   • "Skip Tour"    — exits without marking the rest done
 *   • "Finish Tour"  — closes once the user has hit 100% progress
 */
@Component({
  selector: 'app-first-beat-tour',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './first-beat-tour.component.html',
  styleUrls: ['./first-beat-tour.component.css'],
})
export class FirstBeatTourComponent {
  public onboarding = inject(OnboardingService);
  private router = inject(Router);

  /** Track the last-completed count so the user can see the bar move. */
  readonly milestones = [0, 25, 50, 75, 100];

  openStep(step: OnboardingStep) {
    this.onboarding.openStep(step);
    this.router.navigate(['/' + step.route], { queryParams: step.queryParams });
  }

  markComplete(step: OnboardingStep) {
    this.onboarding.markStepComplete(step.id);
  }

  skipTour() {
    this.onboarding.exitTour();
    this.router.navigate(['/hub']);
  }

  finishTour() {
    this.onboarding.completeTour();
    this.router.navigate(['/hub']);
  }

  startTour() {
    this.onboarding.startTour();
  }

  formatPacing(): string {
    const pacingMs = this.onboarding.currentTour()?.pacingTotalMs ?? 300000;
    const minutes = Math.floor(pacingMs / 60000);
    const seconds = Math.floor((pacingMs % 60000) / 1000);
    return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
  }
}
