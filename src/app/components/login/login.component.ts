import { Component, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService, AuthCredentials } from '../../services/auth.service';
import { UIService } from '../../services/ui.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.css'],
})
export class LoginComponent {
  private authService = inject(AuthService);
  private uiService = inject(UIService);

  isRegistering = signal(false);
  isLoading = signal(false);
  message = signal('');
  isError = signal(false);

  credentials: AuthCredentials = {
    email: '',
    password: '',
  };
  artistName = '';

  async onSubmit() {
    this.isLoading.set(true);
    this.message.set('');
    this.isError.set(false);

    try {
      let result;
      if (this.isRegistering()) {
        result = await this.authService.register(this.credentials, this.artistName);
      } else {
        result = await this.authService.login(this.credentials);
      }

      this.message.set(result.message);
      if (result.success) {
        setTimeout(() => {
          this.uiService.navigateToView('hub');
        }, 1500);
      } else {
        this.isError.set(true);
      }
    } catch (err) {
      this.isError.set(true);
      this.message.set('A tactical error occurred. System offline.');
    } finally {
      this.isLoading.set(false);
    }
  }

  toggleMode() {
    this.isRegistering.update(v => !v);
    this.message.set('');
  }
}
