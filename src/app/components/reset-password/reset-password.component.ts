import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { ApiAuthError, ApiAuthService } from '../../services/api-auth.service';
import { LoggingService } from '../../services/logging.service';

/**
 * Account recovery surface.
 *
 * One screen, two stages: requesting a reset link (no `token` query param) and
 * redeeming one (`/reset-password?token=...`, the URL the API emails). The
 * token is read from the query string reactively so arriving at a different
 * link swaps it instead of reusing a stale one.
 */
@Component({
  selector: 'app-reset-password',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './reset-password.component.html',
  styleUrls: ['./reset-password.component.css'],
})
export class ResetPasswordComponent implements OnInit {
  private apiAuth = inject(ApiAuthService);
  private authService = inject(AuthService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private logger = inject(LoggingService);

  /** Emailed single-use grant, when the screen was opened from a link. */
  readonly token = signal<string | null>(null);
  readonly email = signal('');
  readonly password = signal('');
  readonly confirmation = signal('');
  readonly showPassword = signal(false);
  readonly isLoading = signal(false);
  readonly message = signal('');
  readonly isError = signal(false);

  /** True when a token is present — the screen redeems instead of requesting. */
  readonly isRedeeming = computed(() => !!this.token());

  get passwordValidation() {
    try {
      return this.authService.validatePassword(this.password() || '');
    } catch {
      return { isValid: false, errors: ['Validation engine failure.'] };
    }
  }

  ngOnInit(): void {
    // Subscribe (not snapshot): navigating from one recovery link to another
    // must swap the token, and the guard-free route can be reached either way.
    this.route.queryParamMap.subscribe((params) => {
      const token = (params.get('token') || '').trim();
      this.token.set(token || null);
      this.message.set('');
      this.isError.set(false);
    });
  }

  async onRequestLink(): Promise<void> {
    if (this.isLoading()) return;

    const email = this.email().trim().toLowerCase();
    if (!email) {
      this.isError.set(true);
      this.message.set('Enter the address on your account.');
      return;
    }

    this.isLoading.set(true);
    this.isError.set(false);
    this.message.set('');
    try {
      const response = await this.apiAuth.requestPasswordReset(email);
      this.message.set(
        response.message ||
          'If an account exists for that address, a reset link is on its way.'
      );
    } catch (err) {
      this.isError.set(true);
      this.message.set(this.describeFailure(err));
    } finally {
      this.isLoading.set(false);
    }
  }

  async onResetPassword(): Promise<void> {
    if (this.isLoading()) return;

    const token = this.token();
    if (!token) {
      this.isError.set(true);
      this.message.set('This recovery link is incomplete. Request a new one.');
      return;
    }

    const validation = this.passwordValidation;
    if (!validation.isValid) {
      this.isError.set(true);
      this.message.set(validation.errors[0]);
      return;
    }
    if (this.password() !== this.confirmation()) {
      this.isError.set(true);
      this.message.set('The two cipher entries do not match.');
      return;
    }

    this.isLoading.set(true);
    this.isError.set(false);
    this.message.set('');
    try {
      await this.apiAuth.resetPassword(token, this.password());
      this.message.set('ACCESS CIPHER ROTATED. RETURNING TO AUTHORIZATION…');
      setTimeout(() => void this.router.navigate(['/login']), 1200);
    } catch (err) {
      this.logger.error('PASSWORD_RECOVERY_FAILURE', err);
      this.isError.set(true);
      this.message.set(this.describeFailure(err));
    } finally {
      this.isLoading.set(false);
    }
  }

  /**
   * A rejected token (400) and a rejected request (429) are different problems
   * with different fixes, so they never collapse into one generic denial.
   */
  private describeFailure(err: unknown): string {
    if (err instanceof ApiAuthError) {
      if (err.status === 400) {
        return (
          err.message ||
          'This reset link is invalid, expired, or already used. Request a new one.'
        );
      }
      if (err.status === 429) return 'TOO MANY ATTEMPTS. WAIT AND RETRY.';
      if (err.status === 0 || err.status >= 500) {
        return 'RECOVERY SERVICE UNAVAILABLE. TRY AGAIN LATER.';
      }
      return err.message || 'RECOVERY FAILED. TRY AGAIN.';
    }
    return 'RECOVERY FAILED. TRY AGAIN.';
  }

  async returnToAuthorization(): Promise<void> {
    await this.router.navigate(['/login']);
  }
}
