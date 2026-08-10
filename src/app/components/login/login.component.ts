import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService, AuthCredentials } from '../../services/auth.service';
import { ApiAuthError, ApiAuthService } from '../../services/api-auth.service';
import { SecurityService } from '../../services/security.service';
import { OnboardingService } from '../../services/onboarding.service';
import { LoggingService } from '../../services/logging.service';
import { APP_SECURITY_CONFIG } from '../../app.security';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.css'],
})
export class LoginComponent implements OnInit {
  private authService = inject(AuthService);
  private apiAuth = inject(ApiAuthService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private securityService = inject(SecurityService);
  private onboarding = inject(OnboardingService);
  private logger = inject(LoggingService);

  /** True when the active session was issued by the API (skips demo email verification). */
  private usesApiAuth = signal(false);

  isRegistering = signal(false);
  isLoading = signal(false);
  message = signal('');
  isError = signal(false);
  isVerifying = signal(false);
  verificationCode = '';
  requires2FA = signal(false);

  credentials: AuthCredentials = {
    email: '',
    password: '',
    twoFactorCode: '',
  };
  artistName = '';

  get passwordValidation() {
    try {
      return this.authService.validatePassword(this.credentials.password || '');
    } catch (e) {
      return { isValid: false, errors: ['Validation engine failure.'] };
    }
  }

  ngOnInit() {
    this.logger.system('LOGIN_SURFACE_INITIALIZED');
    try {
      if (this.authService.isAuthenticated()) {
        void this.navigateAfterAuth();
      }
    } catch (err) {
      this.logger.error('Login initialization failure', err);
    }
  }

  async onSubmit() {
    if (this.isLoading()) return;

    this.isLoading.set(true);
    this.message.set('');
    this.isError.set(false);

    try {
      let result;
      if (this.isVerifying()) {
        result = await this.authService.verifyEmail(
          this.verificationCode,
          this.credentials.email
        );
      } else if (this.isRegistering()) {
        const validation = this.passwordValidation;
        if (!validation.isValid) {
          this.isError.set(true);
          this.message.set(validation.errors[0]);
          this.isLoading.set(false);
          return;
        }
        result = await this.submitRegister();
      } else {
        result = await this.submitLogin();
      }

      if (result) {
        this.message.set(result.message);
        if (result.success) {
          this.handleSuccessfulAuth();
        } else {
          this.handleFailedAuth(result);
        }
      }
    } catch (err) {
      this.logger.error('AUTH_FATAL_ERROR', err);
      this.isError.set(true);
      this.message.set('NEURAL LINK FAILURE. TRY AGAIN.');
    } finally {
      if (!this.isVerifying() && !this.requires2FA()) {
        this.isLoading.set(false);
      }
    }
  }

  private handleSuccessfulAuth() {
    // Only the legacy demo registration requires the email verification step.
    if (this.isRegistering() && !this.isVerifying() && !this.usesApiAuth()) {
      this.isVerifying.set(true);
      this.isLoading.set(false);
      return;
    }
    setTimeout(() => {
      void this.navigateAfterAuth();
    }, 1000);
  }

  private handleFailedAuth(result: { message: string; requires2FA?: boolean }) {
    this.isError.set(true);
    if (result.requires2FA) {
      this.requires2FA.set(true);
      this.isLoading.set(true);
    } else {
      this.isLoading.set(false);
    }
  }

  async onResendCode() {
    this.isLoading.set(true);
    try {
      const result = await this.authService.resendVerificationCode();
      this.message.set(result.message);
      this.isError.set(!result.success);
    } catch (e) {
      this.message.set('RESEND FAILED.');
    } finally {
      this.isLoading.set(false);
    }
  }

  toggleMode() {
    this.isRegistering.update((v) => !v);
    this.isVerifying.set(false);
    this.requires2FA.set(false);
    this.usesApiAuth.set(false);
    this.credentials.password = '';
    this.message.set('');
  }

  /**
   * Classify transport/server failures. Legacy demo auth is only allowed when
   * the configured endpoint is localhost or a relative development proxy;
   * production/tunnel failures are surfaced instead of being masked.
   */
  private isApiUnavailable(status: number): boolean {
    return status === 0 || status >= 500;
  }

  private canUseLegacyFallback(): boolean {
    return APP_SECURITY_CONFIG.legacy_auth_fallback;
  }

  /**
   * Try the S.M.U.V.E. API first. Only local development may fall back to
   * the legacy demo auth; production and tunnel URLs remain authoritative.
   */
  private async submitLogin() {
    try {
      const response = await this.apiAuth.login({
        email: this.credentials.email,
        password: this.credentials.password,
      });
      const user = this.authService.establishApiSession(response);
      this.usesApiAuth.set(true);
      return {
        success: true,
        message: `ACCESS GRANTED, ${user.artistName}. THE SYSTEM IS READY. DO NOT DISAPPOINT ME.`,
      };
    } catch (err) {
      if (err instanceof ApiAuthError && !this.isApiUnavailable(err.status)) {
        return { success: false, message: this.apiErrorMessage(err) };
      }
      if (!this.canUseLegacyFallback()) {
        return {
          success: false,
          message: 'AUTHENTICATION SERVICE UNAVAILABLE. TRY AGAIN LATER.',
        };
      }
      this.usesApiAuth.set(false);
      return this.authService.login(this.credentials);
    }
  }

  private async submitRegister() {
    try {
      const response = await this.apiAuth.register({
        name: this.artistName.trim() || 'NEW_RECRUIT',
        email: this.credentials.email,
        password: this.credentials.password,
      });
      const user = this.authService.establishApiSession(response);
      this.usesApiAuth.set(true);
      return {
        success: true,
        message: `IDENTITY SEALED, ${user.artistName}. THE SYSTEM IS READY. DO NOT DISAPPOINT ME.`,
      };
    } catch (err) {
      if (err instanceof ApiAuthError && !this.isApiUnavailable(err.status)) {
        return { success: false, message: this.apiErrorMessage(err) };
      }
      if (!this.canUseLegacyFallback()) {
        return {
          success: false,
          message: 'AUTHENTICATION SERVICE UNAVAILABLE. TRY AGAIN LATER.',
        };
      }
      this.usesApiAuth.set(false);
      return this.authService.register(this.credentials, this.artistName);
    }
  }

  private apiErrorMessage(err: ApiAuthError): string {
    const map: Record<number, string> = {
      400: 'INVALID TRANSMISSION. CHECK YOUR INPUT.',
      401: 'AUTHORIZATION DENIED. INVALID CREDENTIALS.',
      403: 'AUTHORIZATION DENIED. EXPIRED SESSION.',
      404: 'AUTHENTICATION SERVICE UNREACHABLE.',
      409: 'CONFLICT: THIS IDENTITY ALREADY EXISTS IN THE VAULT.',
      429: 'TOO MANY TRANSMISSIONS. WAIT AND RETRY.',
    };
    return map[err.status] || 'AUTHENTICATION FAILED. TRY AGAIN.';
  }

  private async navigateAfterAuth(): Promise<void> {
    try {
      const requestedUrl = this.route.snapshot.queryParamMap.get('returnUrl');
      if (
        requestedUrl &&
        this.securityService.isValidRedirectUrl(requestedUrl)
      ) {
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
    } catch (e) {
      await this.router.navigateByUrl('/hub');
    }
  }
}
