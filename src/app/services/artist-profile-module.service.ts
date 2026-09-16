import { Injectable } from '@angular/core';
import type { UserProfile } from './user-profile.service';
import { FINGERPRINT_CATEGORY_BY_ID } from './artist-online-fingerprint.service';

/** Every navigable pane in the Profile module. */
export type ProfileSectionId =
  | 'mastery'
  | 'basic'
  | 'identity-console'
  | 'persona'
  | 'genre-deep-dive'
  | 'production-tools'
  | 'catalog'
  | 'music-history'
  | 'fingerprint'
  | 'business'
  | 'sync-licensing'
  | 'legal-infrastructure'
  | 'touring'
  | 'team';

export interface ProfileElement {
  /** Human-readable label surfaced when the element is missing. */
  label: string;
  /** True when the element carries usable evidence. */
  test: (profile: UserProfile) => boolean;
  /** Weight used when scoring the section (1–5). */
  weight?: number;
}

export interface ProfileSectionDefinition {
  id: ProfileSectionId;
  label: string;
  icon: string;
  /** One-line description of what the pane owns. */
  purpose: string;
  elements: ProfileElement[];
}

export interface ProfileSectionCoverage {
  id: ProfileSectionId;
  label: string;
  icon: string;
  purpose: string;
  score: number;
  present: number;
  total: number;
  missing: string[];
}

export interface ProfileMastery {
  overall: number;
  sections: ProfileSectionCoverage[];
  weakest: ProfileSectionCoverage[];
  nextActions: string[];
  calibrated: boolean;
}

const hasText = (value: unknown): boolean =>
  typeof value === 'string' && value.trim().length > 0;

const hasList = (value: unknown): boolean =>
  Array.isArray(value) && value.length > 0;

const atLeast = (value: unknown, minimum: number): boolean =>
  typeof value === 'number' && Number.isFinite(value) && value >= minimum;

const isSet = (value: unknown): boolean =>
  value !== undefined && value !== null && value !== '';

/** True when at least one recorded link belongs to the given destination family. */
const hasLink = (profile: UserProfile, category: string): boolean => {
  const links = profile.officialArtistProfiles;
  if (!Array.isArray(links) || links.length === 0) return false;
  return links.some((link) => {
    const id = String((link as any)?.destinationId || (link as any)?.id || '');
    return FINGERPRINT_CATEGORY_BY_ID[id] === category;
  });
};

/**
 * Single source of truth for the Profile module.
 *
 * The builder's navigation, per-section completion badges, and the mastery
 * dashboard all read from `SECTIONS`, so a pane can never drift out of sync
 * with the element that scores it — and every profile element (identity,
 * identity graph, AI persona, genre intelligence, production tools, catalog,
 * business, sync, legal, touring, roster) is represented exactly once.
 */
@Injectable({ providedIn: 'root' })
export class ArtistProfileModuleService {
  readonly sections: ProfileSectionDefinition[] = [
    {
      id: 'mastery',
      label: 'Profile Mastery',
      icon: 'fa-gauge-high',
      purpose: 'Full element map across every profile pane.',
      elements: [],
    },
    {
      id: 'basic',
      label: 'Identity & Vision',
      icon: 'fa-user-tie',
      purpose: 'Who the artist is and how the world sees them.',
      elements: [
        { label: 'artist name', test: (p) => hasText(p.artistName) && p.artistName !== 'New Artist', weight: 5 },
        { label: 'primary genre', test: (p) => hasText(p.primaryGenre), weight: 5 },
        { label: 'location', test: (p) => hasText(p.location) && p.location !== 'Unspecified' },
        { label: 'website', test: (p) => hasText(p.website) },
        { label: 'profile or header image', test: (p) => hasText(p.avatarImage) || hasText(p.headerImage) },
        { label: 'press gallery', test: (p) => hasList(p.pressGallery) },
        { label: 'skills', test: (p) => hasList(p.skills), weight: 4 },
        { label: 'production styles', test: (p) => hasList(p.productionStyles) },
        { label: 'brand voices', test: (p) => hasList(p.brandVoices), weight: 4 },
        { label: 'strategic goals', test: (p) => hasList(p.strategicGoals), weight: 4 },
      ],
    },
    {
      id: 'identity-console',
      label: 'Identity Console',
      icon: 'fa-project-diagram',
      purpose: 'Verified identity graph, works, and platform ownership.',
      elements: [
        { label: 'linked artist accounts', test: (p) => hasList(p.artistIdentity?.linkedAccounts), weight: 5 },
        { label: 'registered works', test: (p) => hasList(p.artistIdentity?.works), weight: 4 },
        // Resolution confidence is normalised 0–1 by ArtistIdentityService, so
        // asking for 1 (100%) would be an unreachable target.
        { label: 'identity resolution confidence', test: (p) => atLeast(p.artistIdentity?.resolution?.confidenceScore, 0.5), weight: 4 },
        { label: 'identity fingerprint signals', test: (p) => isSet((p.artistIdentity as any)?.fingerprint) },
      ],
    },
    {
      id: 'persona',
      label: 'AI Persona',
      icon: 'fa-robot',
      purpose: 'How S.M.U.V.E. speaks, drives, and how much authority it holds.',
      elements: [
        { label: 'commander persona', test: (p) => hasText(p.settings?.ai?.commanderPersona), weight: 5 },
        { label: 'conversational tier', test: (p) => hasText(p.settings?.ai?.aiConversationalTier), weight: 4 },
        { label: 'persona intensity decision', test: (p) => typeof p.settings?.ai?.aiPersonaIntensityEnabled === 'boolean' },
        { label: 'total control decision', test: (p) => typeof p.settings?.ai?.aiTotalControlEnabled === 'boolean' },
        { label: 'mimic preference', test: (p) => typeof p.settings?.ai?.aiMimicEnabled === 'boolean' },
      ],
    },
    {
      id: 'genre-deep-dive',
      label: 'Genre Intelligence',
      icon: 'fa-dna',
      purpose: 'Genre-specific depth beyond the primary label.',
      elements: [
        { label: 'genre-specific data', test: (p) => isSet(p.genreSpecificData) && Object.keys(p.genreSpecificData || {}).length > 0, weight: 5 },
        { label: 'subgenre or influences', test: (p) => hasList(p.musicalJourney?.subgenres) || hasList(p.musicalJourney?.musicalInfluences), weight: 4 },
        { label: 'market position', test: (p) => hasText(p.musicalJourney?.marketPosition), weight: 4 },
        { label: 'tempo zone', test: (p) => hasText(p.musicalJourney?.preferredBpmRange) },
      ],
    },
    {
      id: 'production-tools',
      label: 'Production Toolchain',
      icon: 'fa-sliders',
      purpose: 'The real studio chain, services, and operator skill set.',
      elements: [
        { label: 'equipment', test: (p) => hasList(p.equipment), weight: 5 },
        { label: 'DAW', test: (p) => hasList(p.daw), weight: 4 },
        { label: 'services', test: (p) => hasList(p.services) },
        { label: 'expertise levels', test: (p) => Object.values(p.expertise || {}).some((v) => atLeast(v, 1)), weight: 4 },
        { label: 'music training or process', test: (p) => hasText(p.musicalJourney?.educationalBackground) || hasText(p.musicalJourney?.songwritingProcess) },
      ],
    },
    {
      id: 'catalog',
      label: 'Catalog Assets',
      icon: 'fa-database',
      purpose: 'Released and unreleased works with their metadata.',
      elements: [
        { label: 'catalog items', test: (p) => hasList(p.catalog), weight: 5 },
        { label: 'catalog depth (3+)', test: (p) => (p.catalog?.length || 0) >= 3, weight: 3 },
        { label: 'release identifiers', test: (p) => (p.catalog || []).some((item: any) => hasText(item?.isrc) || hasText(item?.upc)) },
        { label: 'release dates', test: (p) => (p.catalog || []).some((item: any) => isSet(item?.releaseDate)) },
      ],
    },
    {
      id: 'fingerprint',
      label: 'Online Fingerprint',
      icon: 'fa-fingerprint',
      purpose: 'For Artists dashboards, rights organisations, and analytics.',
      elements: [
        { label: 'at least one official link', test: (p) => hasList(p.officialArtistProfiles), weight: 5 },
        { label: 'delivery or distributor link', test: (p) => hasLink(p, 'delivery'), weight: 4 },
        { label: 'For Artists dashboard link', test: (p) => hasLink(p, 'for-artists'), weight: 5 },
        { label: 'rights organisation listed', test: (p) => hasLink(p, 'pro'), weight: 4 },
        { label: 'analytics source linked', test: (p) => hasLink(p, 'analytics'), weight: 3 },
        { label: 'links marked verified', test: (p) => (p.officialArtistProfiles || []).some((link: any) => link?.verified === true), weight: 4 },
        { label: 'at least three official links', test: (p) => (p.officialArtistProfiles?.length || 0) >= 3 },
      ],
    },
    {
      id: 'music-history',
      label: 'Official Music History',
      icon: 'fa-timeline',
      purpose: 'Chronological release record with complete documentation.',
      elements: [
        { label: 'dated releases', test: (p) => (p.catalog || []).some((item: any) => hasText(item?.releaseDate)), weight: 5 },
        { label: 'release identifiers', test: (p) => (p.catalog || []).some((item: any) => hasText(item?.isrc) || hasText(item?.upc)), weight: 4 },
        { label: 'distributor recorded', test: (p) => (p.catalog || []).some((item: any) => hasText(item?.distributor)), weight: 4 },
        { label: 'platform placements', test: (p) => (p.catalog || []).some((item: any) => hasList(item?.platforms)) },
        { label: 'credits recorded', test: (p) => (p.catalog || []).some((item: any) => hasText(item?.credits)) },
        { label: 'ownership references', test: (p) => (p.catalog || []).some((item: any) => hasText(item?.splitSheetRef)) },
        { label: 'release types', test: (p) => (p.catalog || []).some((item: any) => hasText(item?.releaseType)) },
      ],
    },
    {
      id: 'business',
      label: 'Business & Financials',
      icon: 'fa-briefcase',
      purpose: 'Money, campaigns, and the commercial mission.',
      elements: [
        { label: 'financial accounts', test: (p) => hasList(p.financials?.accounts), weight: 5 },
        { label: 'monthly budget', test: (p) => atLeast(p.financials?.monthlyBudget, 1), weight: 3 },
        { label: 'revenue history', test: (p) => hasList(p.financials?.revenueHistory) || atLeast(p.financials?.totalRevenue, 1) },
        { label: 'marketing campaigns', test: (p) => hasList(p.marketingCampaigns), weight: 4 },
        { label: 'career goals', test: (p) => hasList(p.careerGoals), weight: 4 },
        { label: 'current focus and success metric', test: (p) => hasText(p.musicalJourney?.currentFocus) || hasText(p.musicalJourney?.primarySuccessMetric), weight: 4 },
        { label: 'release velocity', test: (p) => hasText(p.musicalJourney?.releaseVelocity) },
        { label: 'income streams', test: (p) => hasList(p.musicalJourney?.incomeStreams) },
      ],
    },
    {
      id: 'sync-licensing',
      label: 'Sync & Licensing',
      icon: 'fa-film',
      purpose: 'Sync readiness: versions, stems, clearance, and catalogue.',
      elements: [
        { label: 'sync readiness state', test: (p) => hasText(p.syncDetails?.isSyncReady), weight: 5 },
        { label: 'clean versions', test: (p) => p.syncDetails?.hasCleanVersions === true, weight: 4 },
        { label: 'instrumentals', test: (p) => p.syncDetails?.hasInstrumentals === true, weight: 4 },
        { label: 'stems available', test: (p) => hasText(p.syncDetails?.hasStems) && p.syncDetails?.hasStems !== 'No', weight: 4 },
        { label: 'one-stop clearance', test: (p) => p.syncDetails?.oneStopClearance === true, weight: 5 },
        { label: 'sync catalogue size', test: (p) => atLeast(p.syncDetails?.catalogSize, 1) },
        { label: 'pitch keywords', test: (p) => hasList(p.syncDetails?.preferredKeywords), weight: 4 },
      ],
    },
    {
      id: 'legal-infrastructure',
      label: 'Legal Infrastructure',
      icon: 'fa-file-contract',
      purpose: 'Ownership, registration, and entity protection.',
      elements: [
        { label: 'registered works', test: (p) => p.legalInfrastructure?.hasRegisteredWorks === true, weight: 5 },
        { label: 'PRO affiliation', test: (p) => hasText(p.legalInfrastructure?.proAffiliation) && p.legalInfrastructure?.proAffiliation !== 'None', weight: 5 },
        { label: 'PRO name and IPI', test: (p) => hasText(p.proName) || hasText(p.proIpi), weight: 4 },
        { label: 'standard split sheet', test: (p) => hasText(p.legalInfrastructure?.hasStandardSplitSheet) && p.legalInfrastructure?.hasStandardSplitSheet !== 'Never', weight: 4 },
        { label: 'business incorporation', test: (p) => p.legalInfrastructure?.isIncorporated === true },
        { label: 'trademark status', test: (p) => hasText(p.legalInfrastructure?.trademarkStatus) && p.legalInfrastructure?.trademarkStatus !== 'None' },
      ],
    },
    {
      id: 'touring',
      label: 'Touring & Live',
      icon: 'fa-route',
      purpose: 'Live capability, routing, and travel reality.',
      elements: [
        { label: 'travel preference', test: (p) => hasText(p.touringDetails?.travelPreference), weight: 3 },
        { label: 'target regions', test: (p) => hasList(p.touringDetails?.regions), weight: 4 },
        { label: 'tour readiness', test: (p) => hasText(p.touringDetails?.isTourReady) && p.touringDetails?.isTourReady !== 'Studio Only', weight: 4 },
        { label: 'backline', test: (p) => hasText(p.touringDetails?.hasBackline) && p.touringDetails?.hasBackline !== 'No' },
        { label: 'performances per year', test: (p) => hasText(p.performancesPerYear) && p.performancesPerYear !== 'None', weight: 4 },
      ],
    },
    {
      id: 'team',
      label: 'Professional Team',
      icon: 'fa-users-gear',
      purpose: 'Roster, roles, and delegation coverage.',
      elements: [
        { label: 'team members', test: (p) => hasList(p.team), weight: 5 },
        { label: 'defined member roles', test: (p) => (p.team || []).some((member: any) => hasText(member?.role)), weight: 4 },
        { label: 'collaboration goals', test: (p) => hasText(p.musicalJourney?.collaborationGoals), weight: 3 },
      ],
    },
  ];

  /** Pane definitions excluding the mastery dashboard (which has no elements). */
  get navigableSections(): ProfileSectionDefinition[] {
    return this.sections.filter((section) => section.elements.length > 0);
  }

  sectionCoverage(
    profile: UserProfile | null | undefined,
    id: ProfileSectionId
  ): ProfileSectionCoverage {
    const definition = this.sections.find((section) => section.id === id);
    if (!definition || definition.elements.length === 0) {
      return {
        id,
        label: definition?.label ?? id,
        icon: definition?.icon ?? 'fa-circle-question',
        purpose: definition?.purpose ?? '',
        score: 0,
        present: 0,
        total: 0,
        missing: [],
      };
    }

    const safe = (profile || {}) as UserProfile;
    let earned = 0;
    let possible = 0;
    let present = 0;
    const missing: string[] = [];

    for (const element of definition.elements) {
      const weight = element.weight ?? 3;
      possible += weight;
      let ok = false;
      try {
        ok = element.test(safe);
      } catch {
        ok = false;
      }
      if (ok) {
        earned += weight;
        present += 1;
      } else {
        missing.push(element.label);
      }
    }

    return {
      id: definition.id,
      label: definition.label,
      icon: definition.icon,
      purpose: definition.purpose,
      score: possible > 0 ? Math.round((earned / possible) * 100) : 0,
      present,
      total: definition.elements.length,
      missing,
    };
  }

  /**
   * Whole-module mastery: every pane scored, weakest first, with the highest
   * value next actions so the builder can guide the artist instead of just
   * displaying fields.
   */
  mastery(profile: UserProfile | null | undefined): ProfileMastery {
    const sections = this.navigableSections.map((section) =>
      this.sectionCoverage(profile, section.id)
    );
    const overall = sections.length
      ? Math.round(sections.reduce((sum, section) => sum + section.score, 0) / sections.length)
      : 0;
    const weakest = [...sections].sort((a, b) => a.score - b.score);

    const nextActions: string[] = [];
    for (const section of weakest) {
      for (const element of section.missing) {
        nextActions.push(`${section.label}: add ${element}`);
        if (nextActions.length >= 6) break;
      }
      if (nextActions.length >= 6) break;
    }

    return {
      overall,
      sections,
      weakest: weakest.slice(0, 3),
      nextActions,
      calibrated: sections.length > 0 && weakest.every((section) => section.score >= 75),
    };
  }

  coverageFor(
    profile: UserProfile | null | undefined
  ): Record<string, ProfileSectionCoverage> {
    const map: Record<string, ProfileSectionCoverage> = {};
    for (const section of this.navigableSections) {
      map[section.id] = this.sectionCoverage(profile, section.id);
    }
    return map;
  }
}
