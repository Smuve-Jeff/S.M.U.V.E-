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
  RecommendationHistoryEntry,
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

/** One-level overlay that keeps the default whenever the import is unusable. */
function overlay<T extends object>(base: T, incoming?: Partial<T> | null): T {
  return incoming && typeof incoming === 'object' ? { ...base, ...incoming } : base;
}

function arrayOverlay<T>(base: T[], incoming: unknown): T[] {
  return Array.isArray(incoming) ? [...incoming] : [...base];
}

/**
 * Merge an imported archive over the default profile.
 *
 * `updateProfile` merges shallowly and `importProfile` only checked for an
 * artist name, so an archive written by an older build — or hand-trimmed — used
 * to leave nested objects missing. The profile editor dereferences
 * `settings.ai`, `financials.accounts`, `touringDetails` and every roster array
 * directly, so a partial archive rendered those panes broken instead of seeded.
 * Filling the gaps from `initialProfile` makes an import usable, and an archive
 * that is merely outdated still loads.
 */
export function normalizeImportedProfile(
  parsed: Partial<UserProfile>
): UserProfile {
  // Clone the defaults so a caller can safely edit the normalized profile
  // without mutating the singleton `initialProfile` arrays or nested objects.
  const base = JSON.parse(JSON.stringify(initialProfile)) as UserProfile;
  const merged: UserProfile = { ...base };

  for (const key of Object.keys(parsed) as Array<keyof UserProfile>) {
    const value = parsed[key] as unknown;
    // `null` is how a JSON export spells "empty"; keeping the default is
    // safer than handing a null list to every `*ngFor` that reads it.
    if (value === null || value === undefined) continue;
    if (Array.isArray(base[key]) && !Array.isArray(value)) continue;
    (merged as unknown as Record<string, unknown>)[key as string] = value;
  }

  return {
    ...merged,
    settings: {
      ...overlay(base.settings, parsed.settings),
      ai: overlay(base.settings.ai, parsed.settings?.ai),
    },
    expertise: overlay(base.expertise, parsed.expertise),
    financials: {
      ...overlay(base.financials, parsed.financials),
      accounts: arrayOverlay(base.financials.accounts, parsed.financials?.accounts),
      splitSheets: arrayOverlay(
        base.financials.splitSheets,
        parsed.financials?.splitSheets
      ),
      revenueHistory: arrayOverlay(
        base.financials.revenueHistory,
        parsed.financials?.revenueHistory
      ),
    },
    touringDetails: {
      ...overlay(base.touringDetails, parsed.touringDetails),
      regions: arrayOverlay(
        base.touringDetails?.regions ?? [],
        parsed.touringDetails?.regions
      ),
    },
    strategicSignals: overlay(base.strategicSignals, parsed.strategicSignals),
    musicalJourney: {
      ...overlay(base.musicalJourney, parsed.musicalJourney),
      musicalInfluences: arrayOverlay(
        base.musicalJourney.musicalInfluences,
        parsed.musicalJourney?.musicalInfluences
      ),
      subgenres: arrayOverlay(
        base.musicalJourney.subgenres ?? [],
        parsed.musicalJourney?.subgenres
      ),
      musicBlueprint: {
        ...overlay(
          base.musicalJourney.musicBlueprint ?? {},
          parsed.musicalJourney?.musicBlueprint
        ),
        lyricalThemes: arrayOverlay(
          base.musicalJourney.musicBlueprint?.lyricalThemes ?? [],
          parsed.musicalJourney?.musicBlueprint?.lyricalThemes
        ),
        recordingPriorities: arrayOverlay(
          base.musicalJourney.musicBlueprint?.recordingPriorities ?? [],
          parsed.musicalJourney?.musicBlueprint?.recordingPriorities
        ),
        mixingPriorities: arrayOverlay(
          base.musicalJourney.musicBlueprint?.mixingPriorities ?? [],
          parsed.musicalJourney?.musicBlueprint?.mixingPriorities
        ),
        referenceTracks: arrayOverlay(
          base.musicalJourney.musicBlueprint?.referenceTracks ?? [],
          parsed.musicalJourney?.musicBlueprint?.referenceTracks
        ),
      },
    },
  };
}

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
        // Cloud records can outlive the schema that wrote them just like local
        // archives. Normalize before installing so every profile pane receives
        // its required nested objects and arrays.
        const normalized = normalizeImportedProfile(
          saved as Partial<UserProfile>
        );
        // Stamp the owning user id into the in-memory profile so downstream
        // sync (auto-save, artist identity, DJ sessions) keys cloud writes
        // under the real account instead of 'current'/'anonymous'.
        this.store.setProfile({ ...normalized, id: key });
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
  /**
   * Add a collaborator to the roster. Previously an empty method, so the
   * "add member" affordance in the profile surface silently did nothing.
   *
   * Returns the profile as stored, so a caller holding a working copy (the
   * profile editor does) can sync just the roster from it.
   */
  async addTeamMember(m: any): Promise<UserProfile> {
    const name = (m?.name || '').trim();
    if (!name) return this.profile();
    const p = this.profile();
    const existing = p.team || [];
    if (existing.some((t) => t.name.toLowerCase() === name.toLowerCase())) {
      return p;
    }
    const member = {
      id: m?.id || `tm-${Date.now().toString(36)}`,
      name,
      role: m?.role || 'Collaborator',
      email: m?.email || undefined,
      share: Number.isFinite(m?.share) ? m.share : 0,
      bio: m?.bio || undefined,
      joinedAt: m?.joinedAt || new Date().toISOString(),
    };
    await this.updateProfile({ team: [...existing, member] });
    return this.profile();
  }

  /**
   * Remove a collaborator from the roster — the counterpart to
   * `addTeamMember`. Without it a roster could only ever grow, so a member
   * added by mistake was permanent.
   */
  async removeTeamMember(id: string): Promise<UserProfile> {
    if (!id) return this.profile();
    const team = (this.profile().team || []).filter((t) => t.id !== id);
    await this.updateProfile({ team });
    return this.profile();
  }
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
  /**
   * Record a decision on a recommendation (saved / dismissed / not-relevant).
   * This was an empty method, so the Command Center's save & dismiss buttons
   * changed nothing and the recommendation inbox never filled.
   */
  async setRecommendationState(
    id: string,
    state: RecommendationHistoryEntry['state'],
    meta?: any
  ) {
    if (!id) return;
    const p = this.profile();
    const now = Date.now();
    p.recommendationPreferences = {
      ...(p.recommendationPreferences || {}),
      [id]: {
        ...(p.recommendationPreferences?.[id] || {}),
        state,
        updatedAt: now,
      },
    };
    p.recommendationHistory = [
      ...(p.recommendationHistory || []),
      {
        recommendationId: id,
        title: meta?.title || '',
        type: (meta?.type || 'Gear') as RecommendationHistoryEntry['type'],
        state,
        updatedAt: now,
      },
    ];
    await this.updateProfile(p);
  }

  /** Per-cabinet Tha Spot stats, keyed by game id. */
  private gameStatFor(gameId: string) {
    const stats = { ...(this.profile().gameStats || {}) };
    return {
      stats,
      entry: stats[gameId] || {
        launches: 0,
        plays: 0,
        wins: 0,
        losses: 0,
        totalScore: 0,
        bestScore: 0,
        lastPlayedAt: 0,
      },
    };
  }

  /** Record a cabinet launch so play history and rails have real data. */
  async recordGameLaunch(gameId: string, context?: any) {
    if (!gameId) return;
    const { stats, entry } = this.gameStatFor(gameId);
    stats[gameId] = {
      ...entry,
      launches: (entry.launches || 0) + 1,
      lastPlayedAt: Date.now(),
      lastContext: context ?? null,
    };
    await this.updateProfile({ gameStats: stats });
  }

  /**
   * Record a finished match. Score/outcome come straight from the cabinet's
   * telemetry payload, so the career timeline can report real sessions.
   */
  async recordGameResult(gameId: string, result?: any) {
    if (!gameId) return;
    const { stats, entry } = this.gameStatFor(gameId);
    const score = Number(result?.score);
    const hasScore = Number.isFinite(score);
    const outcome = String(result?.outcome || result?.result || '').toLowerCase();
    stats[gameId] = {
      ...entry,
      plays: (entry.plays || 0) + 1,
      wins: (entry.wins || 0) + (outcome === 'win' ? 1 : 0),
      losses: (entry.losses || 0) + (outcome === 'loss' ? 1 : 0),
      totalScore: (entry.totalScore || 0) + (hasScore ? score : 0),
      bestScore: hasScore
        ? Math.max(entry.bestScore || 0, score)
        : entry.bestScore || 0,
      lastScore: hasScore ? score : entry.lastScore ?? null,
      lastResult: outcome || null,
      lastPlayedAt: Date.now(),
    };
    await this.updateProfile({ gameStats: stats });
  }

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
      const imported = JSON.parse(text) as Partial<UserProfile>;
      // Basic validation
      if (
        !imported ||
        typeof imported !== 'object' ||
        !imported.artistName ||
        !imported.settings
      ) {
        throw new Error('Invalid profile data format.');
      }
      await this.updateProfile(normalizeImportedProfile(imported));
      this.logger.info('Profile imported successfully.');
      return true;
    } catch (e) {
      this.logger.error('Profile import failed', e);
      return false;
    }
  }
}
