import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService, AuthCredentials } from '../../services/auth.service';
import { SecurityService } from '../../services/security.service';
import { OnboardingService } from '../../services/onboarding.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.css'],
})
export class LoginComponent implements OnInit {
  private authService = inject(AuthService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private securityService = inject(SecurityService);
  private onboarding = inject(OnboardingService);

  isRegistering = signal(false);
  isLoading = signal(false);
  message = signal('');
  isError = signal(false);

  credentials: AuthCredentials = {
    email: '',
    password: '',
  };
  artistName = '';

  ngOnInit() {
    if (this.authService.isAuthenticated()) {
      void this.navigateAfterAuth();
    }
  }

  async onSubmit() {
    this.isLoading.set(true);
    this.message.set('');
    this.isError.set(false);

    try {
      let result;
      if (this.isRegistering()) {
        result = await this.authService.register(
          this.credentials,
          this.artistName
        );
      } else {
        result = await this.authService.login(this.credentials);
      }

      this.message.set(result.message);
      if (result.success) {
        setTimeout(() => {
          void this.navigateAfterAuth();
        }, 1500);
      } else {
        this.isError.set(true);
      }
    } catch (_err) {
      this.isError.set(true);
      this.message.set('An unexpected error occurred. System offline.');
    } finally {
      this.isLoading.set(false);
    }
  }

  toggleMode() {
    this.isRegistering.update((v) => !v);
    this.message.set('');
  }

  private async navigateAfterAuth(): Promise<void> {
    const requestedUrl = this.route.snapshot.queryParamMap.get('returnUrl');
    if (requestedUrl && this.securityService.isValidRedirectUrl(requestedUrl)) {
      await this.router.navigateByUrl(requestedUrl);
      return;
    }

    if (this.onboarding.shouldShow()) {
      await this.router.navigate(['/hub'], {
        queryParams: { onboarding: '1' },
      });
      return;
    }

    await this.router.navigateByUrl('/hub');
  }
}
