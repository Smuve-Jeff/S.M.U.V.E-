import { Component, ChangeDetectionStrategy, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../services/auth.service';
import { AppTheme } from '../../services/user-context.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './login.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoginComponent {
  theme = signal<AppTheme>({ name: 'Green Vintage', primary: 'green', accent: 'amber', neutral: 'neutral', purple: 'purple', red: 'red', blue: 'blue' });
  email = signal('');
  password = signal('');
  isLoggingIn = signal(false);
  error = signal<string | null>(null);

  private authService = inject(AuthService);

  async login(): Promise<void> {
    this.isLoggingIn.set(true);
    this.error.set(null);
    try {
      await this.authService.login(this.email(), this.password());
      // On success, the main app component will react to the auth state change.
    } catch (err: any) {
      this.error.set(err.message);
    } finally {
      this.isLoggingIn.set(false);
    }
  }
}