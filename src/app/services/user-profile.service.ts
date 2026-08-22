import { Injectable, inject, Injector } from '@angular/core';
import { LoggingService } from './logging.service';
import { DatabaseService } from './database.service';
import { AuthService } from './auth.service';
import { ProfileStoreService } from './profile-store.service';
import {
  initialProfile,
  UserProfile,
  ProfileAuditLog,
  ExpertiseLevels,
  ProfessionalFinancials,
  CatalogItem,
  AppSettings,
} from '../types/profile.types';

export type {
  UserProfile,
  ProfileAuditLog,
  ExpertiseLevels,
  ProfessionalFinancials,
  CatalogItem,
  AppSettings,
};
export { initialProfile };

@Injectable({ providedIn: 'root' })
export class UserProfileService {
  private logger = inject(LoggingService);
  private store = inject(ProfileStoreService);
  private db = inject(DatabaseService);
  private injector = inject(Injector);

  profile = this.store.profile;

  // AuthService imports this service, so resolve it lazily to avoid a
  // circular-instantiation error (see AGENTS.md pattern #3).
  private get authService() {
    return this.injector.get(AuthService);
  }

  /**
   * User id used to key profile persistence (local backup + cloud sync).
   * Falls back to 'current' when no session is active or auth is unavailable.
   */
  private activeUserId(): string {
    try {
      const user = this.authService.currentUser();
      if (user && user.id) return String(user.id);
    } catch {
      // Auth service not ready — fall through to the legacy key.
    }
    return 'current';
  }

  async loadProfile(id: string = 'current') {
    try {
      const key = id || this.activeUserId();
      const saved = await this.db.loadUserProfile(key);
      if (saved) {
        // Stamp the owning user id into the in-memory profile so downstream
        // sync (auto-save, artist identity, DJ sessions) keys cloud writes
        // under the real account instead of 'current'/'anonymous'.
        this.store.setProfile({ ...saved, id: key });
      }
    } catch (e) {
      this.logger.error('Profile load failed', e);
    }
  }

  async updateProfile(p: Partial<UserProfile>) {
    const next = { ...this.profile(), ...p } as UserProfile;
    // Stamp the active user id so the profile always carries the account it
    // belongs to, and the local backup + cloud sync share one key.
    next.id = this.activeUserId();
    this.store.setProfile(next);
    try {
      // Save under the real user id so the local backup and the cloud sync
      // (which enforces ownership on the backend) use the same key. Previously
      // this hardcoded 'current', which made cloud saves 403 and orphaned the
      // local backup from the id-keyed load path.
      await this.db.saveUserProfile(next, this.activeUserId());
    } catch (e) {
      this.logger.error('Profile save failed', e);
    }
  }

  async acquireUpgrade(u: any) {
    const p = this.profile();
    if (u.type === 'Gear' && !p.equipment.includes(u.title)) {
      p.equipment.push(u.title);
    }
    if (u.type === 'Software' && !p.daw.includes(u.title)) {
      p.daw.push(u.title);
    }
    if (u.type === 'Service' && !p.services.includes(u.title)) {
      p.services.push(u.title);
    }
    if (u.recommendationId) {
      p.recommendationPreferences = {
        ...p.recommendationPreferences,
        [u.recommendationId]: {
          ...(p.recommendationPreferences?.[u.recommendationId] || {}),
          state: 'acquired',
        },
      };
    }
    await this.updateProfile(p);
  }
  async completeUpgrade(u: any) {
    const p = this.profile();
    if (u.type === 'Gear' && !p.equipment.includes(u.title)) {
      p.equipment.push(u.title);
    }
    if (u.type === 'Software' && !p.daw.includes(u.title)) {
      p.daw.push(u.title);
    }
    if (u.type === 'Service' && !p.services.includes(u.title)) {
      p.services.push(u.title);
    }
    if (u.recommendationId) {
      p.recommendationPreferences = {
        ...p.recommendationPreferences,
        [u.recommendationId]: {
          ...(p.recommendationPreferences?.[u.recommendationId] || {}),
          state: 'completed',
        },
      };
      p.recommendationHistory = [
        ...(p.recommendationHistory || []),
        {
          recommendationId: u.recommendationId,
          title: u.title || '',
          type: u.type || 'Gear',
          state: 'completed',
          updatedAt: Date.now(),
        },
      ];
    }
    await this.updateProfile(p);
  }
  async updateExpertise(u: Partial<ExpertiseLevels>) {
    await this.updateProfile({
      expertise: { ...this.profile().expertise, ...u },
    });
  }
  async addTeamMember(m: any) {}
  async updateFinancials(u: Partial<ProfessionalFinancials>) {
    await this.updateProfile({
      financials: { ...this.profile().financials, ...u },
    });
  }
  async recordAudit(l: ProfileAuditLog) {
    await this.updateProfile({
      strategicHealthScore: l.score,
      criticalDeficits: l.deficits,
      auditHistory: [l, ...(this.profile().auditHistory || [])].slice(0, 20),
    });
  }
  async setRecommendationState(id: string, s: any, m?: any) {}
  async recordGameLaunch(g: string, c: any) {}
  async recordGameResult(g: string, r: any) {}

  exportProfile() {
    const data = JSON.stringify(this.profile(), null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `smuve_profile_${this.profile().artistName}_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    this.logger.info('Profile exported successfully.');
  }

  async importProfile(file: File): Promise<boolean> {
    try {
      const text = await file.text();
      const imported = JSON.parse(text) as UserProfile;
      // Basic validation
      if (!imported.artistName || !imported.settings) {
        throw new Error('Invalid profile data format.');
      }
      await this.updateProfile(imported);
      this.logger.info('Profile imported successfully.');
      return true;
    } catch (e) {
      this.logger.error('Profile import failed', e);
      return false;
    }
  }
}
