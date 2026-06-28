import { Injectable, inject, signal, Injector } from '@angular/core';
import { LoggingService } from './logging.service';
import { DatabaseService } from './database.service';
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

  profile = this.store.profile;

  constructor() {}

  async loadProfile(id: string = 'current') {
    try {
      const saved = await this.db.loadUserProfile(id);
      if (saved) this.store.setProfile(saved);
    } catch (e) {
      this.logger.error('Profile load failed', e);
    }
  }

  async updateProfile(p: Partial<UserProfile>) {
    const next = { ...this.profile(), ...p } as UserProfile;
    this.store.setProfile(next);
    try {
      await this.db.saveUserProfile(next, 'current');
    } catch (e) {
      this.logger.error('Profile save failed', e);
    }
  }

  async acquireUpgrade(u: any) {
    const p = this.profile();
    if (u.type === 'Gear') p.equipment.push(u.title);
    if (u.type === 'Software') p.daw.push(u.title);
    if (u.type === 'Service') p.services.push(u.title);
    await this.updateProfile(p);
  }
  async completeUpgrade(u: any) {
    await this.acquireUpgrade(u);
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
