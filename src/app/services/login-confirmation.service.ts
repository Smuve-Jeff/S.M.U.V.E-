import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

import { DatabaseService } from './database.service';
import { LoggingService } from './logging.service';
import type { AuthUser } from './auth.service';

@Injectable({
  providedIn: 'root',
})
export class LoginConfirmationService {
  private http = inject(HttpClient);
  private database = inject(DatabaseService);
  private logger = inject(LoggingService);

  async sendLoginConfirmation(user: AuthUser): Promise<void> {
    if (!user?.email) {
      return;
    }

    try {
      await firstValueFrom(
        this.http.post(`${this.database.apiUrl}/auth/login-email`, {
          userId: user.id,
          email: user.email,
          artistName: user.artistName,
          loginAt: user.lastLogin.toISOString(),
          userAgent:
            typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
        })
      );
    } catch (error) {
      this.logger.warn(
        'LoginConfirmationService: Failed to send login confirmation email',
        error
      );
    }
  }
}
