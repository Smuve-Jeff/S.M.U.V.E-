import sys

def write_file(path, content):
    with open(path, 'w') as f:
        f.write(content)

write_file('src/app/services/user-profile.service.ts', """import { Injectable, inject, signal, Injector } from '@angular/core';
import { LoggingService } from './logging.service';
import {
  UserProfile,
  AppSettings,
  CatalogItem,
  ExpertiseLevels,
  TeamMember,
  ProfessionalFinancials,
  ProfileAuditLog,
  RecommendationHistoryEntry,
  UpgradeRecommendation
} from '../types/profile.types';
import { createInitialArtistIdentity } from '../types/artist-identity.types';

export type {
  UserProfile,
  AppSettings,
  CatalogItem,
  RecommendationHistoryEntry,
  UpgradeRecommendation
};

export const initialProfile: UserProfile = {
  settings: {
    ui: { theme: 'Dark', performanceMode: false, showScanlines: false, animationsEnabled: true, autoPianoRoll: false },
    audio: { masterVolume: 0.8, autoSaveEnabled: true },
    ai: { kbWriteAccess: true, commanderPersona: 'Elite' },
    security: { twoFactorEnabled: false, endToEndEncryption: false, biometricLock: false, auditLogEnabled: true, sessionTimeout: 3600 },
  },
  artistName: 'New Artist', primaryGenre: 'Hip Hop',
  proName: '', proIpi: '', proData: { workIds: [], affiliations: [], ipiNumber: '' },
  knowledgeBase: { id: 'kb-initial', artistId: 'new-artist', dataPoints: [], learnedStyles: [], productionSecrets: [], coreTrends: [], strategicDirectives: [], marketIntel: [], genreAnalysis: {}, brandStatus: {}, strategicHealthScore: 0 },
  careerGoals: [], equipment: [], daw: [], services: [], recommendationPreferences: {}, recommendationHistory: [],
  expertise: { production: 0, songwriting: 0, marketing: 0, business: 0, legal: 0, performance: 0, catalyst: 0 },
  team: [], marketingCampaigns: [],
  financials: { accounts: [], monthlyBudget: 0, totalRevenue: 0, pendingPayouts: 0, splitSheets: [], revenueHistory: [] },
  catalog: [], artistIdentity: createInitialArtistIdentity('New Artist', 'Hip Hop'),
  strategicHealthScore: 0, criticalDeficits: [],
  strategicSignals: { marketReadiness: 0, identityTrust: 0, careerMomentum: 0, technicalAuthority: 0, syncViability: 0, touringStability: 0 },
  auditHistory: [], skills: [], productionStyles: [], brandVoices: [], strategicGoals: [], performancesPerYear: 'None',
  touringDetails: { travelPreference: 'Van', regions: [], isTourReady: 'Studio Only', hasBackline: 'No' },
  syncDetails: { isSyncReady: 'Not Started', hasCleanVersions: false, hasInstrumentals: false, hasStems: 'No', oneStopClearance: false, catalogSize: 0, preferredKeywords: [] },
  legalInfrastructure: { hasRegisteredWorks: false, proAffiliation: "None", hasStandardSplitSheet: "Never", isIncorporated: false, trademarkStatus: "None" },
  genreSpecificData: {}, gameStats: {}, pressGallery: [],
  thaSpotProgression: { roomStats: {}, earnedCosmetics: [], eventHistory: [] },
};

@Injectable({ providedIn: 'root' })
export class UserProfileService {
  private injector = inject(Injector);
  private logger = inject(LoggingService);
  private get db(): any { return this.injector.get(require('./database.service').DatabaseService); }

  profile = signal<UserProfile>(initialProfile);

  constructor() {}

  async loadProfile(id: string = 'current') {
    try { const saved = await this.db.loadUserProfile(id); if (saved) this.profile.set(saved); }
    catch (err) { this.logger.error('Failed to load profile', err); }
  }

  async updateProfile(p: Partial<UserProfile>) {
    const next = { ...this.profile(), ...p }; this.profile.set(next as UserProfile);
    try { await this.db.saveUserProfile(next, 'current'); } catch (e) {}
  }

  async acquireUpgrade(u: any) {}
  async completeUpgrade(u: any) {}
  async updateExpertise(u: any) {}
  async addTeamMember(m: any) {}
  async updateFinancials(u: any) {}
  async recordAudit(l: any) {}
  async setRecommendationState(id: string, s: any, m?: any) {}
  async recordGameLaunch(gid: string, ctx: any) {}
  async recordGameResult(gid: string, res: any) {}
}
""")
