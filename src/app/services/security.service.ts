import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { UserProfileService } from './user-profile.service';
import { LoggingService } from './logging.service';
import { firstValueFrom } from 'rxjs';

export interface SecurityLog {
  log_id: number;
  user_id: string;
  event_type: string;
  description: string;
  ip_address: string;
  user_agent: string;
  created_at: string;
}

export interface UserSession {
  session_id: string;
  user_id: string;
  device_name: string;
  location: string;
  last_active: string;
  created_at: string;
}

@Injectable({
  providedIn: 'root'
})
export class SecurityService {
  private http = inject(HttpClient);
  private profileService = inject(UserProfileService);
  private logger = inject(LoggingService);
  private readonly API_URL = 'http://localhost:3000/api';

  logs = signal<SecurityLog[]>([]);
  sessions = signal<UserSession[]>([]);

  async logEvent(eventType: string, description: string) {
    const profile = this.profileService.profile();
    if (!profile.artistName) return;

    try {
      await firstValueFrom(this.http.post(`${this.API_URL}/security/log`, {
        userId: profile.artistName,
        eventType,
        description,
        ipAddress: '127.0.0.1', // Placeholder
        userAgent: navigator.userAgent
      }));
    } catch (error) {
      this.logger.error('Failed to log security event', error);
    }
  }

  async fetchLogs() {
    const profile = this.profileService.profile();
    try {
      const data = await firstValueFrom(this.http.get<SecurityLog[]>(`${this.API_URL}/security/logs/${profile.artistName}`));
      this.logs.set(data);
    } catch (error) {
      this.logger.error('Failed to fetch security logs', error);
    }
  }

  async fetchSessions() {
    const profile = this.profileService.profile();
    try {
      const data = await firstValueFrom(this.http.get<UserSession[]>(`${this.API_URL}/security/sessions/${profile.artistName}`));
      this.sessions.set(data);
    } catch (error) {
      this.logger.error('Failed to fetch active sessions', error);
    }
  }

  async revokeSession(sessionId: string) {
    try {
      await firstValueFrom(this.http.delete(`${this.API_URL}/security/session/${sessionId}`));
      await this.fetchSessions();
      await this.logEvent('SESSION_REVOKED', `Revoked session ${sessionId}`);
    } catch (error) {
      this.logger.error('Failed to revoke session', error);
    }
  }

  async registerCurrentSession(sessionId: string, deviceName: string, location: string) {
     const profile = this.profileService.profile();
     try {
       await firstValueFrom(this.http.post(`${this.API_URL}/security/session`, {
         sessionId,
         userId: profile.artistName,
         deviceName,
         location
       }));
     } catch (error) {
       this.logger.error('Failed to register session', error);
     }
  }
}
