import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService, AuthCredentials } from '../../services/auth.service';
import { ApiAuthError, ApiAuthService } from '../../services/api-auth.service';
import { SecurityService } from '../../services/security.service';
import { OnboardingService } from '../../services/onboarding.service';
import { LoggingService } from '../../services/logging.service';
import { LoginConfirmationService } from '../../services/login-confirmation.service';
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
  private loginConfirmation = inject(LoginConfirmationService);

  /** True when the active session was issued by the API (not the demo store). */
  usesApiAuth = signal(false);
  /** Whether the API can actually deliver a verification code. */
  apiVerificationAvailable = signal(false);
  showPassword = signal(false);

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

    // Normalize identity input once at the boundary so API auth, demo auth,
    // verification, and redirect state all refer to the same account.
    this.credentials.email = (this.credentials.email || '').trim().toLowerCase();
    this.isLoading.set(true);
    this.message.set('');
    this.isError.set(false);

    try {
      let result;
      if (this.isVerifying()) {
        result = this.usesApiAuth()
          ? await this.verifyApiCode()
          : await this.authService.verifyEmail(
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

  /**
   * Whether this signup can actually be verified: the demo store always can
   * (it prints the code locally), the API only when it has a mail provider.
   */
  private canVerifyChannel(): boolean {
    return this.usesApiAuth() ? this.apiVerificationAvailable() : true;
  }

  private handleSuccessfulAuth() {
    // A fresh signup goes through the verification step — but never into a
    // dead end waiting for mail the deployment cannot send.
    if (this.isRegistering() && !this.isVerifying() && this.canVerifyChannel()) {
      this.verificationCode = '';
      this.isVerifying.set(true);
      this.isLoading.set(false);
      return;
    }
    const currentUser = this.authService.currentUser();
    if (currentUser) {
      void this.loginConfirmation.sendLoginConfirmation(currentUser);
    }
    setTimeout(() => {
      void this.navigateAfterAuth();
    }, 1000);
  }

  private handleFailedAuth(result: { message: string; requires2FA?: boolean }) {
    this.isError.set(true);
    if (result.requires2FA) {
      this.requires2FA.set(true);
      // The next submit must be available for the second-factor code.
      this.isLoading.set(false);
    } else {
      this.isLoading.set(false);
    }
  }

  async onResendCode() {
    this.isLoading.set(true);
    try {
      if (this.usesApiAuth()) {
        const result = await this.apiAuth.sendEmailVerification();
        this.message.set(result.message || 'TRANSMISSION RE-SENT.');
        this.isError.set(false);
        return;
      }
      const result = await this.authService.resendVerificationCode();
      this.message.set(result.message);
      this.isError.set(!result.success);
    } catch (e) {
      this.isError.set(true);
      this.message.set(this.apiErrorMessage(
        e instanceof ApiAuthError ? e : new ApiAuthError(0, 'RESEND FAILED.')
      ));
    } finally {
      this.isLoading.set(false);
    }
  }

  /** Confirm an emailed code against the API and adopt the verified state. */
  private async verifyApiCode(): Promise<{ success: boolean; message: string }> {
    if (!this.verificationCode || this.verificationCode.length !== 6) {
      return { success: false, message: 'ENTER THE 6-DIGIT TRANSMISSION CODE.' };
    }

    try {
      const response = await this.apiAuth.confirmEmailVerification(
        this.verificationCode
      );
      const user = this.authService.markEmailVerified(response.user?.email);
      return {
        success: true,
        message: `CHANNEL SECURE, ${user?.artistName ?? 'ARTIST'}. WELCOME TO THE ELITE.`,
      };
    } catch (err) {
      if (err instanceof ApiAuthError) {
        // 400 = wrong/expired code (retype or resend); 429 = the guessing
        // budget is spent (a new code is required). Different fixes, so they
        // are never collapsed into one denial.
        if (err.status === 400 || err.status === 429) {
          return { success: false, message: err.message };
        }
        return { success: false, message: this.apiErrorMessage(err) };
      }
      return { success: false, message: 'VERIFICATION FAILED. TRY AGAIN.' };
    }
  }

  /**
   * Leave the verification step without confirming.
   *
   * Sign-in is deliberately not gated on verification, so an artist whose mail
   * is slow or filtered can still use the app and confirm later from Settings.
   */
  async skipVerification(): Promise<void> {
    this.isVerifying.set(false);
    this.message.set('');
    await this.navigateAfterAuth();
  }

  toggleMode() {
    this.isRegistering.update((v) => !v);
    this.isVerifying.set(false);
    this.requires2FA.set(false);
    this.usesApiAuth.set(false);
    this.credentials.password = '';
    this.message.set('');
  }

  /** Hand off to the account-recovery screen (forgotten access cipher). */
  async openRecovery(): Promise<void> {
    await this.router.navigate(['/reset-password']);
  }

  /**
   * Classify transport/server failures. Legacy demo auth is only allowed when
   * the configured endpoint is localhost or a relative development proxy;
   * production/tunnel failures are surfaced instead of being masked.
   */
  private isApiUnavailable(status: number): boolean {
    return status === 0 || status >= 500;
  }

  /**
   * API statuses that may fall through to the legacy demo store when the
   * fallback is permitted: transport failure (0), server failure (5xx), or a
   * missing endpoint (404). An authoritative 401 stays a strict denial even
   * in local development. 400/409/429 stay denials: they are real answers
   * about the request, not access failures.
   */
  private isLegacyFallbackStatus(status: number): boolean {
    return this.isApiUnavailable(status) || status === 404;
  }

  private canUseLegacyFallback(): boolean {
    return APP_SECURITY_CONFIG.legacy_auth_fallback;
  }

  /**
   * Try the S.M.U.V.E. API first. Only local development may fall back to
   * the legacy demo auth (transport/server failure or a missing endpoint);
   * production, tunnel URLs and real 401 denials remain authoritative.
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
      if (
        this.canUseLegacyFallback() &&
        err instanceof ApiAuthError &&
        this.isLegacyFallbackStatus(err.status)
      ) {
        // Dev only: transport/server failure or a missing endpoint. A real
        // 401 stays a strict denial, and an unexpected legacy-store throw is
        // swallowed so no unhandled rejection escapes the form.
        this.usesApiAuth.set(false);
        try {
          return await this.authService.login(this.credentials);
        } catch {
          return {
            success: false,
            message: 'AUTHENTICATION SERVICE UNAVAILABLE. TRY AGAIN LATER.',
          };
        }
      }
      if (err instanceof ApiAuthError) {
        return { success: false, message: this.apiErrorMessage(err) };
      }
      return {
        success: false,
        message: 'AUTHENTICATION SERVICE UNAVAILABLE. TRY AGAIN LATER.',
      };
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
      this.apiVerificationAvailable.set(
        response.emailVerificationAvailable === true
      );
      return {
        success: true,
        message: `IDENTITY SEALED, ${user.artistName}. THE SYSTEM IS READY. DO NOT DISAPPOINT ME.`,
      };
    } catch (err) {
      if (
        this.canUseLegacyFallback() &&
        err instanceof ApiAuthError &&
        this.isLegacyFallbackStatus(err.status)
      ) {
        this.usesApiAuth.set(false);
        try {
          return await this.authService.register(
            this.credentials,
            this.artistName
          );
        } catch {
          return {
            success: false,
            message: 'AUTHENTICATION SERVICE UNAVAILABLE. TRY AGAIN LATER.',
          };
        }
      }
      if (err instanceof ApiAuthError) {
        return { success: false, message: this.apiErrorMessage(err) };
      }
      return {
        success: false,
        message: 'AUTHENTICATION SERVICE UNAVAILABLE. TRY AGAIN LATER.',
      };
    }
  }

  private apiErrorMessage(err: ApiAuthError): string {
    // An outage (network or 5xx) and a rejected request are different problems
    // with different fixes — never collapse them into the generic denial.
    if (this.isApiUnavailable(err.status)) {
      return 'API OUTAGE: AUTHENTICATION SERVER IS TEMPORARILY UNAVAILABLE.';
    }
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
