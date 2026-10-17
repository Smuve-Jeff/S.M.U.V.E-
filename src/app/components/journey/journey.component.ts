import { Component, inject, signal, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import {
  UserProfileService,
  UserProfile,
} from '../../services/user-profile.service';
import { AuthService } from '../../services/auth.service';
import { ALL_GENRES } from '../../services/enhanced-artist-questionnaire-engine';

@Component({
  selector: 'app-journey',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './journey.component.html',
  styleUrls: ['./journey.component.css'],
})
export class JourneyComponent {
  private userProfileService = inject(UserProfileService);
  private authService = inject(AuthService);

  isAuthenticated = this.authService.isAuthenticated;
  profile = signal<UserProfile>({ ...this.userProfileService.profile() });

  activeStep = signal(0);
  steps = [
    { title: 'The Origin', subtitle: 'Where it all began' },
    { title: 'The Sound', subtitle: 'Defining your frequency' },
    { title: 'Production DNA', subtitle: 'Your creative toolkit' },
    { title: 'The Vision', subtitle: 'Mapping the future' },
    { title: 'The Legacy', subtitle: 'Finalizing the dossier' },
  ];

  // Genre options — shared with the Artist DNA Uplink questionnaire so the
  // catalog can never drift between the two surfaces.
  readonly genres = ALL_GENRES;

  // Free-text inputs that map onto canonical string[] profile fields.
  // (musicalJourney.musicalInfluences and daw are arrays; the wizard edits
  // them as comma-separated text so the profile model stays clean.)
  influencesText = signal('');
  dawText = signal('');

  // BPM range presets
  readonly bpmRanges = [
    { label: 'Slow & Chill (60-90 BPM)', value: '60-90' },
    { label: 'Mid-Tempo (90-120 BPM)', value: '90-120' },
    { label: 'Upbeat (120-140 BPM)', value: '120-140' },
    { label: 'High Energy (140-180 BPM)', value: '140-180' },
    { label: 'Variable / All Tempos', value: 'variable' },
  ];

  // Production style options
  readonly productionStyles = [
    'Minimalist',
    'Layered/Complex',
    'Live Instrumentation',
    'Sample-Heavy',
    'Synthesizer-Driven',
    'Hybrid/Mixed',
  ];

  // Experience levels
  readonly experienceLevels = [
    'Beginner',
    'Intermediate',
    'Advanced',
    'Professional',
  ];

  // Skills
  readonly availableSkills = [
    'Vocalist',
    'Producer',
    'Songwriter',
    'DJ',
    'Engineer',
    'Musician',
    'Manager',
  ];

  constructor() {
    effect(() => {
      const p = this.userProfileService.profile();
      this.profile.set({ ...p });
      this.influencesText.set((p.musicalJourney?.musicalInfluences || []).join(', '));
      this.dawText.set((p.daw || []).join(', '));
    });
  }

  next() {
    if (this.activeStep() < this.steps.length - 1)
      this.activeStep.update((s) => s + 1);
  }
  prev() {
    if (this.activeStep() > 0) this.activeStep.update((s) => s - 1);
  }

  /** Split comma-separated text into a trimmed, de-duplicated string array. */
  private toList(text: string): string[] {
    return Array.from(
      new Set(
        text
          .split(/[,;\n]+/)
          .map((s) => s.trim())
          .filter(Boolean)
      )
    );
  }

  updateProfile() {
    const p = this.profile();
    const next: UserProfile = {
      ...p,
      musicalJourney: {
        ...p.musicalJourney,
        musicalInfluences: this.toList(this.influencesText()),
      },
      daw: this.toList(this.dawText()),
    };
    this.userProfileService.updateProfile(next);
  }

  toggleSkill(skill: string) {
    this.profile.update((p) => {
      const skills = p.skills || [];
      const index = skills.indexOf(skill);
      if (index > -1) {
        return { ...p, skills: skills.filter((s) => s !== skill) };
      } else {
        return { ...p, skills: [...skills, skill] };
      }
    });
  }

  hasSkill(skill: string): boolean {
    return (this.profile().skills || []).includes(skill);
  }

  toggleProductionStyle(style: string) {
    this.profile.update((p) => {
      const styles: string[] = p.productionStyles || [];
      const index = styles.indexOf(style);
      if (index > -1) {
        return { ...p, productionStyles: styles.filter((s) => s !== style) };
      } else {
        return { ...p, productionStyles: [...styles, style] };
      }
    });
  }

  hasProductionStyle(style: string): boolean {
    return (this.profile().productionStyles || []).includes(style);
  }
}
