import { DatabaseService } from './database.service';
import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { DatabaseService } from './database.service';
import { LoggingService } from './logging.service';
import { TokenService } from './token.service';
import type { AuthUser } from './auth.service';

@Injectable({ providedIn: 'root' })
export class LoginConfirmationService {
  private http = inject(HttpClient);
  private database = inject(DatabaseService);
  private logger = inject(LoggingService);
  private tokenService = inject(TokenService);

  private getHeaders() {
    const token = this.tokenService.jwtToken();
    return token ? { headers: { Authorization: `Bearer ${token}` } } : {};
  }

  async sendLoginConfirmation(user: AuthUser): Promise<void> {
    if (!user?.email || !user.lastLogin) return;
    try {
      const loginAt =
        user.lastLogin instanceof Date
          ? user.lastLogin.toISOString()
          : new Date(user.lastLogin).toISOString();
      await firstValueFrom(
        this.http.post(
          `${this.database.API_URL}/auth/login-email`,
          {
            userId: user.id,
            email: user.email,
            artistName: user.artistName,
            loginAt,
            userAgent:
              typeof navigator !== 'undefined'
                ? navigator.userAgent
                : 'unknown',
          },
          this.getHeaders()
        )
      );
    } catch (e) {
      this.logger.warn('Login confirmation failed', e);
    }
  }
}
