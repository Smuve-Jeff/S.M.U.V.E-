import { Injectable, inject, signal, computed } from '@angular/core';
import { UserProfileService } from './user-profile.service';
import { ArtistPathwayService } from './artist-pathway.service';
import {
  ReleaseProject,
  ProductionTrack,
  ReleaseType,
} from '../types/release.types';

// ── PRO Registry ──────────────────────────────────────────

export interface ProRegistration {
  organization: 'BMI' | 'ASCAP' | 'SESAC' | 'SOCAN' | 'PRS' | 'GEMA' | 'Other';
  membershipId: string;
  ipiNumber: string;
  caeNumber: string;
  publisher: string;
  publisherIpi: string;
  registrationDate: string;
  status: 'active' | 'pending' | 'expired';
  territories: string[];
}

export interface WorkRegistration {
  iswc: string;
  title: string;
  role: 'Writer' | 'Publisher' | 'Both';
  sharePercentage: number;
  registrationDate: string;
  registeredWith: string[];
}

// ── DSP Analytics ─────────────────────────────────────────

export interface DspPlatform {
  name: string;
  url: string;
  streams: number;
  followers: number;
  monthlyListeners: number;
  playlistAdds: number;
  /** `null` when the artist did not report a growth figure for this platform. */
  growthRate: number | null;
  lastUpdated: string;
}

/** One platform reading as the artist types it in from their own dashboard. */
export interface DspReadingInput {
  name: string;
  url?: string;
  streams?: number;
  followers?: number;
  monthlyListeners?: number;
  playlistAdds?: number;
  growthRate?: number;
}

export interface DspAnalytics {
  /**
   * Where the numbers came from.
   * - `connected`: read from a linked dashboard (no connector ships today).
   * - `self-reported`: entered by the artist from a dashboard they can see.
   *
   * There is deliberately no illustrative mode. The generator that used to roll
   * random stream counts is gone: an invented listener figure is worse than a
   * blank panel, and no label makes it useful.
   */
  source: 'connected' | 'self-reported';
  totalStreams: number;
  totalFollowers: number;
  totalPlaylistAdds: number;
  /** `null` until two readings exist to compare. */
  monthlyGrowth: number | null;
  platforms: DspPlatform[];
  topTerritories: { country: string; streams: number; percentage: number }[];
  weeklyTrend: { date: string; streams: number }[];
}

/** Platform dashboards an artist can read numbers from. */
export const DSP_PLATFORMS = [
  'Spotify',
  'Apple Music',
  'YouTube Music',
  'SoundCloud',
  'Tidal',
  'Amazon Music',
  'Bandcamp',
] as const;

// ── Social Link Hub ───────────────────────────────────────

export interface SocialAccount {
  platform: string;
  url: string;
  handle: string;
  verified: boolean;
  followers: number;
  engagement: number;
  lastPost: string;
  connected: boolean;
}

// ── Digital Fingerprint ───────────────────────────────────

export interface DigitalFingerprint {
  trustScore: number;
  integrityScore: number;
  consistencyScore: number;
  completeness: number;
  evidenceCount: number;
  platformsConnected: number;
  totalPlatforms: number;
  riskFlags: string[];
  improvementChecklist: {
    item: string;
    completed: boolean;
    impact: 'High' | 'Medium' | 'Low';
  }[];
  lastScan: string;
}

/** Every expandable card in the Artist Development Hub. */
export type ArtistDevelopmentPanel =
  | 'pathway'
  | 'fingerprint'
  | 'pro'
  | 'dsp'
  | 'money'
  | 'social'
  | 'catalog'
  | 'release';

@Injectable({ providedIn: 'root' })
export class ArtistDevelopmentService {
  private userProfile = inject(UserProfileService);
  private pathway = inject(ArtistPathwayService);

  // PRO Registry signals
  proRegistrations = signal<ProRegistration[]>([]);
  workRegistrations = signal<WorkRegistration[]>([]);

  // DSP Analytics signals
  dspAnalytics = signal<DspAnalytics | null>(null);

  // Social Link Hub signals
  socialAccounts = signal<SocialAccount[]>([]);

  // Digital Fingerprint signals
  digitalFingerprint = signal<DigitalFingerprint | null>(null);

  // Catalog & Release Pipeline
  catalog = signal<ReleaseProject[]>([]);
  selectedRelease = signal<ReleaseProject | null>(null);
  showAddRelease = signal(false);
  newReleaseForm = signal<Partial<ReleaseProject>>({
    name: '',
    type: 'Single',
    description: '',
    status: 'Planning',
    tracks: [],
    credits: { artistName: '', collaborators: [] },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });

  // Active panel (updated with new panels)
  activePanel = signal<ArtistDevelopmentPanel | null>('pathway');
  isScanning = signal(false);

  // ── PRO Registry ──────────────────────────────────────

  /** Add or update a PRO registration */
  addProRegistration(reg: ProRegistration): void {
    this.proRegistrations.update((list) => {
      const existing = list.findIndex(
        (r) => r.organization === reg.organization
      );
      if (existing >= 0) {
        const updated = [...list];
        updated[existing] = reg;
        return updated;
      }
      return [...list, reg];
    });
    this.saveToStorage('smuve_pro_registrations', this.proRegistrations());
  }

  removeProRegistration(org: string): void {
    this.proRegistrations.update((list) =>
      list.filter((r) => r.organization !== org)
    );
    this.saveToStorage('smuve_pro_registrations', this.proRegistrations());
  }

  addWorkRegistration(work: WorkRegistration): void {
    this.workRegistrations.update((list) => [...list, work]);
    this.saveToStorage('smuve_work_registrations', this.workRegistrations());
  }

  // ── DSP Analytics ─────────────────────────────────────

  /**
   * True once at least one work has actually been delivered to stores. Until
   * then there is no analytics to show, and inventing some would tell a beginner
   * they have listeners they do not have.
   */
  hasDeliveredWork(): boolean {
    const released = this.catalog().filter(
      (release) => release.status === 'Released' || release.status === 'Distributing'
    );
    if (released.length > 0) return true;
    return (this.userProfile.profile().catalog || []).some(
      (item: any) => item.distributor && item.releaseDate
    );
  }

  /**
   * Records platform figures the artist read from their own dashboard.
   *
   * This replaces a generator that rolled random stream and follower counts and
   * labelled them "illustrative". There is no analytics connector in this app, so
   * the only honest source is the artist. Non-numeric or negative inputs are
   * treated as unreported rather than guessed, and reporting is refused outright
   * while nothing has been delivered — the numbers would have nothing behind
   * them.
   */
  recordDspAnalytics(readings: DspReadingInput[]): DspAnalytics | null {
    if (!this.hasDeliveredWork()) {
      this.dspAnalytics.set(null);
      return null;
    }

    const count = (value: unknown): number => {
      const parsed = Number(value);
      return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : 0;
    };
    const today = new Date().toISOString().split('T')[0];
    const platforms: DspPlatform[] = readings
      .filter((reading) => String(reading?.name || '').trim().length > 0)
      .map((reading) => ({
        name: String(reading.name).trim(),
        url: reading.url || '',
        streams: count(reading.streams),
        followers: count(reading.followers),
        monthlyListeners: count(reading.monthlyListeners),
        playlistAdds: count(reading.playlistAdds),
        growthRate:
          typeof reading.growthRate === 'number' &&
          Number.isFinite(reading.growthRate)
            ? reading.growthRate
            : null,
        lastUpdated: today,
      }));

    if (!platforms.length) {
      this.dspAnalytics.set(null);
      return null;
    }

    const sum = (pick: (platform: DspPlatform) => number): number =>
      platforms.reduce((total, platform) => total + pick(platform), 0);

    const dsp: DspAnalytics = {
      source: 'self-reported',
      totalStreams: sum((platform) => platform.streams),
      totalFollowers: sum((platform) => platform.followers),
      totalPlaylistAdds: sum((platform) => platform.playlistAdds),
      // Growth needs a previous reading to compare against; one entry is not one.
      monthlyGrowth: null,
      platforms,
      // Territories and weekly trends are dashboard-specific breakdowns this app
      // cannot derive from per-platform totals, so they stay empty rather than
      // being modelled.
      topTerritories: [],
      weeklyTrend: [],
    };

    this.dspAnalytics.set(dsp);
    this.saveToStorage('smuve_dsp_analytics', dsp);
    return dsp;
  }

  /** Removes recorded figures so the artist can start over honestly. */
  clearDspAnalytics(): void {
    this.dspAnalytics.set(null);
    try {
      localStorage.removeItem('smuve_dsp_analytics');
    } catch {}
  }

  // ── Social Link Hub ───────────────────────────────────

  readonly SOCIAL_PLATFORMS = [
    { platform: 'Instagram', icon: 'camera' },
    { platform: 'TikTok', icon: 'music_video' },
    { platform: 'YouTube', icon: 'play_circle' },
    { platform: 'Twitter / X', icon: 'tag' },
    { platform: 'Facebook', icon: 'groups' },
    { platform: 'SoundCloud', icon: 'cloud' },
    { platform: 'Spotify', icon: 'music_note' },
    { platform: 'Apple Music', icon: 'apple' },
    { platform: 'Bandcamp', icon: 'inventory_2' },
    { platform: 'Twitch', icon: 'live_tv' },
  ];

  /**
   * Get default social accounts list.
   *
   * Every account starts empty. These rows used to be seeded with a random
   * follower count and engagement rate, so an artist who connected one handle
   * was shown an audience that had been rolled for them.
   */
  getDefaultSocialAccounts(): SocialAccount[] {
    return this.SOCIAL_PLATFORMS.map((p) => ({
      platform: p.platform,
      url: '',
      handle: '',
      verified: false,
      followers: 0,
      engagement: 0,
      lastPost: 'N/A',
      connected: false,
    }));
  }

  /** Connect a social account */
  connectSocialAccount(index: number, handle: string, url: string): void {
    this.socialAccounts.update((list) => {
      const updated = [...list];
      if (updated[index]) {
        // Recording a handle is not a platform verification. That used to be
        // decided by a coin flip, which put a verified badge on accounts no
        // platform had confirmed. Verification is a claim the artist records
        // separately, as a verified link on the official fingerprint.
        updated[index] = {
          ...updated[index],
          handle,
          url,
          connected: true,
          verified: false,
        };
      }
      return updated;
    });
    this.saveToStorage('smuve_social_accounts', this.socialAccounts());
  }

  disconnectSocialAccount(index: number): void {
    this.socialAccounts.update((list) => {
      const updated = [...list];
      if (updated[index]) {
        updated[index] = {
          ...updated[index],
          handle: '',
          url: '',
          connected: false,
          verified: false,
        };
      }
      return updated;
    });
    this.saveToStorage('smuve_social_accounts', this.socialAccounts());
  }

  // ── Digital Fingerprint ───────────────────────────────

  /** Scan artist identity and generate fingerprint */
  async scanFingerprint(): Promise<DigitalFingerprint> {
    this.isScanning.set(true);
    await new Promise((r) => setTimeout(r, 1500)); // simulate scan

    const profile = this.userProfile.profile();
    const socialCount = this.socialAccounts().filter((a) => a.connected).length;

    // Calculate scores
    const hasProfile = profile.profileSetupCompleted ? 1 : 0;
    const hasJourney = profile.musicalJourney ? 1 : 0;
    const proCount = this.proRegistrations().length;
    const workCount = this.workRegistrations().length;

    const completeness = Math.min(
      100,
      Math.round(
        hasProfile * 20 +
          hasJourney * 15 +
          proCount * 10 +
          workCount * 5 +
          socialCount * 5 +
          10
      )
    );

    const consistencyScore = Math.min(
      100,
      Math.round(50 + proCount * 8 + workCount * 3 + socialCount * 2)
    );

    const trustScore = Math.min(
      100,
      Math.round(
        completeness * 0.3 +
          consistencyScore * 0.4 +
          (proCount > 0 ? 15 : 0) +
          (socialCount > 2 ? 10 : 0)
      )
    );

    // The checklist is drawn from the pathway, in pathway order, so it reflects
    // the artist's actual stage. A hardcoded list told beginners to verify
    // dashboards for releases that did not exist yet.
    const pathway = this.pathway.readout(this.userProfile.profile());
    const open = pathway.steps.filter(
      (entry) => entry.status === 'ready' || entry.status === 'in-progress'
    );
    const done = pathway.steps.filter((entry) => entry.status === 'complete');

    const checklist: {
      item: string;
      completed: boolean;
      impact: 'High' | 'Medium' | 'Low';
    }[] = [
      ...open.slice(0, 6).map((entry) => ({
        item: entry.step.title,
        completed: false,
        // Blocking steps are the ones holding the rest of the pathway up.
        impact: (entry.status === 'in-progress'
          ? 'High'
          : entry.step.requires.length > 0
            ? 'Medium'
            : 'High') as 'High' | 'Medium' | 'Low',
      })),
      ...done.slice(-4).map((entry) => ({
        item: entry.step.title,
        completed: true,
        impact: 'Low' as const,
      })),
    ];

    const riskFlags: string[] = [];
    if (!hasProfile)
      riskFlags.push(
        'Profile setup is incomplete — nothing else can be verified until the artist record exists'
      );
    if (!pathway.areas.find((a) => a.area === 'release')?.completed)
      riskFlags.push(
        'No delivered release yet — rights, dashboards, and analytics all depend on a finished, delivered work'
      );
    else if (proCount === 0)
      riskFlags.push(
        'No PRO registration — released music is not collecting publishing royalties'
      );
    if (!hasJourney)
      riskFlags.push(
        'No musical journey recorded — S.M.U.V.E. cannot tailor advice to this artist yet'
      );
    if (pathway.overall < 30)
      riskFlags.push(
        `Pathway is ${pathway.overall}% complete — official standing requires work in ${pathway.unofficialAreas.length} of ${pathway.areas.length} areas`
      );
    if (trustScore < 40)
      riskFlags.push(
        'Low digital trust score — the artist identity is not yet verifiable'
      );

    const fingerprint: DigitalFingerprint = {
      trustScore,
      integrityScore: Math.min(100, trustScore + 5),
      consistencyScore,
      completeness,
      evidenceCount: proCount + workCount + socialCount,
      platformsConnected: socialCount,
      totalPlatforms: this.SOCIAL_PLATFORMS.length,
      riskFlags,
      improvementChecklist: checklist,
      lastScan: new Date().toISOString(),
    };

    this.digitalFingerprint.set(fingerprint);
    this.isScanning.set(false);
    return fingerprint;
  }

  // ── Catalog Management ──────────────────────────────

  addRelease(rel: ReleaseProject): void {
    this.catalog.update((list) => [...list, rel]);
    this.saveToStorage('smuve_catalog', this.catalog());
  }

  removeRelease(id: string): void {
    this.catalog.update((list) => list.filter((r) => r.id !== id));
    this.saveToStorage('smuve_catalog', this.catalog());
    if (this.selectedRelease()?.id === id) this.selectedRelease.set(null);
  }

  updateRelease(id: string, updates: Partial<ReleaseProject>): void {
    this.catalog.update((list) =>
      list.map((r) =>
        r.id === id ? { ...r, ...updates, updatedAt: Date.now() } : r
      )
    );
    this.saveToStorage('smuve_catalog', this.catalog());
    const selected = this.selectedRelease();
    if (selected?.id === id) {
      this.selectedRelease.set(this.catalog().find((r) => r.id === id) || null);
    }
  }

  selectRelease(id: string): void {
    this.selectedRelease.set(this.catalog().find((r) => r.id === id) || null);
  }

  updateTrackStatus(
    releaseId: string,
    trackId: string,
    stage: string,
    status: 'Pending' | 'In Progress' | 'Completed'
  ): void {
    this.catalog.update((list) =>
      list.map((r) => {
        if (r.id !== releaseId) return r;
        const updatedTracks = r.tracks.map((t) =>
          t.id === trackId
            ? { ...t, stages: { ...t.stages, [stage]: status } }
            : t
        );
        return { ...r, tracks: updatedTracks, updatedAt: Date.now() };
      })
    );
    this.saveToStorage('smuve_catalog', this.catalog());
    // Keep the open release panel in sync so stage chips reflect the update.
    const selected = this.selectedRelease();
    if (selected?.id === releaseId) {
      this.selectedRelease.set(
        this.catalog().find((r) => r.id === releaseId) || null
      );
    }
  }

  generateReleaseId(): string {
    return `rel_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  }

  // ── Persistence ───────────────────────────────────────

  /** Load all data from localStorage */
  loadAll(): void {
    const pro = this.loadFromStorage<ProRegistration[]>(
      'smuve_pro_registrations'
    );
    if (pro) this.proRegistrations.set(pro);

    const works = this.loadFromStorage<WorkRegistration[]>(
      'smuve_work_registrations'
    );
    if (works) this.workRegistrations.set(works);

    const social = this.loadFromStorage<SocialAccount[]>(
      'smuve_social_accounts'
    );
    if (social) this.socialAccounts.set(social);
    else this.socialAccounts.set(this.getDefaultSocialAccounts());

    // The catalogue must be restored BEFORE the analytics decision below, because
    // `hasDeliveredWork()` reads it. Restoring it last made that check see an
    // empty catalogue on every load, so stored figures were discarded even for
    // an artist with a released work.
    const cat = this.loadFromStorage<ReleaseProject[]>('smuve_catalog');
    if (cat) this.catalog.set(cat);

    const dsp = this.loadFromStorage<DspAnalytics>('smuve_dsp_analytics');
    // Two ways stored figures have to go: the artist has nothing delivered, or
    // the record was written by the old random generator (`source: 'sample'`).
    // Neither may survive into a panel that reads as real analytics.
    const isSelfReported =
      dsp?.source === 'self-reported' || dsp?.source === 'connected';
    if (dsp && isSelfReported && this.hasDeliveredWork()) {
      this.dspAnalytics.set(dsp);
    } else {
      this.dspAnalytics.set(null);
    }

    const fp = this.loadFromStorage<DigitalFingerprint>(
      'smuve_digital_fingerprint'
    );
    if (fp) this.digitalFingerprint.set(fp);
  }

  private saveToStorage(key: string, data: any): void {
    try {
      localStorage.setItem(key, JSON.stringify(data));
    } catch {}
  }

  private loadFromStorage<T>(key: string): T | null {
    try {
      const raw = localStorage.getItem(key);
      if (raw) return JSON.parse(raw) as T;
    } catch {}
    return null;
  }
}
