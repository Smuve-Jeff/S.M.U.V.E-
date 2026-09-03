import { Injectable, inject, signal, computed } from '@angular/core';
import { UserProfileService } from './user-profile.service';
import { ArtistIdentityService } from './artist-identity.service';
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
  growthRate: number;
  lastUpdated: string;
}

export interface DspAnalytics {
  totalStreams: number;
  totalFollowers: number;
  totalPlaylistAdds: number;
  monthlyGrowth: number;
  platforms: DspPlatform[];
  topTerritories: { country: string; streams: number; percentage: number }[];
  weeklyTrend: { date: string; streams: number }[];
}

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

@Injectable({ providedIn: 'root' })
export class ArtistDevelopmentService {
  private userProfile = inject(UserProfileService);
  private identityService = inject(ArtistIdentityService);

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
  activePanel = signal<
    'fingerprint' | 'pro' | 'dsp' | 'social' | 'catalog' | 'release' | null
  >(null);
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

  /** Generate mock DSP data (in production this would come from API) */
  generateDspAnalytics(): DspAnalytics {
    const profile = this.userProfile.profile();
    const baseStreams = Math.floor(Math.random() * 50000 + 1000);

    const dsp: DspAnalytics = {
      totalStreams: baseStreams,
      totalFollowers: Math.floor(baseStreams * 0.08),
      totalPlaylistAdds: Math.floor(baseStreams * 0.03),
      monthlyGrowth: Math.random() * 15 + 1,
      platforms: [
        {
          name: 'Spotify',
          url: 'https://open.spotify.com',
          streams: Math.floor(baseStreams * 0.45),
          followers: Math.floor(baseStreams * 0.035),
          monthlyListeners: Math.floor(baseStreams * 0.12),
          playlistAdds: Math.floor(baseStreams * 0.015),
          growthRate: Math.random() * 12,
          lastUpdated: new Date().toISOString().split('T')[0],
        },
        {
          name: 'Apple Music',
          url: 'https://music.apple.com',
          streams: Math.floor(baseStreams * 0.25),
          followers: Math.floor(baseStreams * 0.02),
          monthlyListeners: Math.floor(baseStreams * 0.08),
          playlistAdds: Math.floor(baseStreams * 0.008),
          growthRate: Math.random() * 10,
          lastUpdated: new Date().toISOString().split('T')[0],
        },
        {
          name: 'SoundCloud',
          url: 'https://soundcloud.com',
          streams: Math.floor(baseStreams * 0.15),
          followers: Math.floor(baseStreams * 0.015),
          monthlyListeners: Math.floor(baseStreams * 0.05),
          playlistAdds: Math.floor(baseStreams * 0.005),
          growthRate: Math.random() * 8,
          lastUpdated: new Date().toISOString().split('T')[0],
        },
        {
          name: 'YouTube Music',
          url: 'https://music.youtube.com',
          streams: Math.floor(baseStreams * 0.1),
          followers: Math.floor(baseStreams * 0.008),
          monthlyListeners: Math.floor(baseStreams * 0.04),
          playlistAdds: Math.floor(baseStreams * 0.002),
          growthRate: Math.random() * 6,
          lastUpdated: new Date().toISOString().split('T')[0],
        },
        {
          name: 'Tidal',
          url: 'https://tidal.com',
          streams: Math.floor(baseStreams * 0.05),
          followers: Math.floor(baseStreams * 0.002),
          monthlyListeners: Math.floor(baseStreams * 0.01),
          playlistAdds: Math.floor(baseStreams * 0.001),
          growthRate: Math.random() * 4,
          lastUpdated: new Date().toISOString().split('T')[0],
        },
      ],
      topTerritories: [
        {
          country: 'United States',
          streams: Math.floor(baseStreams * 0.35),
          percentage: 35,
        },
        {
          country: 'United Kingdom',
          streams: Math.floor(baseStreams * 0.12),
          percentage: 12,
        },
        {
          country: 'Canada',
          streams: Math.floor(baseStreams * 0.08),
          percentage: 8,
        },
        {
          country: 'Germany',
          streams: Math.floor(baseStreams * 0.06),
          percentage: 6,
        },
        {
          country: 'Australia',
          streams: Math.floor(baseStreams * 0.04),
          percentage: 4,
        },
      ],
      weeklyTrend: Array.from({ length: 12 }, (_, i) => ({
        date: new Date(Date.now() - (11 - i) * 7 * 86400000)
          .toISOString()
          .split('T')[0],
        streams: Math.floor(baseStreams * (0.05 + Math.random() * 0.1)),
      })),
    };

    this.dspAnalytics.set(dsp);
    return dsp;
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

  /** Get default social accounts list */
  getDefaultSocialAccounts(): SocialAccount[] {
    return this.SOCIAL_PLATFORMS.map((p) => ({
      platform: p.platform,
      url: '',
      handle: '',
      verified: false,
      followers: Math.floor(Math.random() * 5000),
      engagement: Math.random() * 5 + 0.5,
      lastPost: 'N/A',
      connected: false,
    }));
  }

  /** Connect a social account */
  connectSocialAccount(index: number, handle: string, url: string): void {
    this.socialAccounts.update((list) => {
      const updated = [...list];
      if (updated[index]) {
        updated[index] = {
          ...updated[index],
          handle,
          url,
          connected: true,
          verified: Math.random() > 0.5,
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
    const identity = this.identityService as any;
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

    // Generate improvement checklist
    const checklist: {
      item: string;
      completed: boolean;
      impact: 'High' | 'Medium' | 'Low';
    }[] = [
      {
        item: 'Complete artist profile setup',
        completed: hasProfile > 0,
        impact: 'High',
      },
      {
        item: 'Register with a PRO (BMI/ASCAP/SESAC)',
        completed: proCount > 0,
        impact: 'High',
      },
      {
        item: 'Connect Instagram account',
        completed:
          this.socialAccounts().find((a) => a.platform === 'Instagram')
            ?.connected || false,
        impact: 'Medium',
      },
      {
        item: 'Connect TikTok account',
        completed:
          this.socialAccounts().find((a) => a.platform === 'TikTok')
            ?.connected || false,
        impact: 'Medium',
      },
      {
        item: 'Connect YouTube channel',
        completed:
          this.socialAccounts().find((a) => a.platform === 'YouTube')
            ?.connected || false,
        impact: 'Medium',
      },
      {
        item: 'Register works with PRO',
        completed: workCount > 0,
        impact: 'High',
      },
      {
        item: 'Connect Spotify for Artists',
        completed:
          this.socialAccounts().find((a) => a.platform === 'Spotify')
            ?.connected || false,
        impact: 'Medium',
      },
      {
        item: 'Add discography to catalog',
        completed: workCount > 1,
        impact: 'Low',
      },
      {
        item: 'Verify social accounts',
        completed: this.socialAccounts().filter((a) => a.verified).length > 0,
        impact: 'Low',
      },
      {
        item: 'Complete musical journey questionnaire',
        completed: hasJourney > 0,
        impact: 'High',
      },
    ];

    const riskFlags: string[] = [];
    if (proCount === 0)
      riskFlags.push(
        'No PRO registration — you are not collecting publishing royalties'
      );
    if (socialCount < 3)
      riskFlags.push(
        'Low social media presence — less than 3 platforms connected'
      );
    if (trustScore < 40)
      riskFlags.push(
        'Low digital trust score — your artist identity is incomplete'
      );
    if (workCount === 0)
      riskFlags.push('No works registered — your catalog is not documented');

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

    const dsp = this.loadFromStorage<DspAnalytics>('smuve_dsp_analytics');
    if (dsp) this.dspAnalytics.set(dsp);

    const fp = this.loadFromStorage<DigitalFingerprint>(
      'smuve_digital_fingerprint'
    );
    if (fp) this.digitalFingerprint.set(fp);

    const cat = this.loadFromStorage<ReleaseProject[]>('smuve_catalog');
    if (cat) this.catalog.set(cat);
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
