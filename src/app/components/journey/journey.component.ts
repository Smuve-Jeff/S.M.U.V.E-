import { Component, inject, signal, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import {
  UserProfileService,
  UserProfile,
} from '../../services/user-profile.service';
import { AuthService } from '../../services/auth.service';

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

  // Genre options
  readonly genres = [
    'Hip Hop',
    'R&B',
    'Pop',
    'Electronic',
    'Rock',
    'Jazz',
    'Classical',
    'Country',
    'Latin',
    'Afrobeats',
    'Metal',
    'Folk',
    'Reggae',
  ];

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
      this.profile.set({ ...this.userProfileService.profile() });
    });
  }

  next() {
    if (this.activeStep() < this.steps.length - 1)
      this.activeStep.update((s) => s + 1);
  }
  prev() {
    if (this.activeStep() > 0) this.activeStep.update((s) => s - 1);
  }

  updateProfile() {
    this.userProfileService.updateProfile(this.profile());
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
