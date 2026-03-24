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
    { title: 'The Vision', subtitle: 'Mapping the future' },
    { title: 'The Legacy', subtitle: 'Finalizing the dossier' },
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
}
