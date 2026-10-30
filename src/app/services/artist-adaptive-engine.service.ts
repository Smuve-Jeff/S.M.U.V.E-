import { Injectable, computed, inject } from '@angular/core';
import { UserProfile, UserProfileService } from './user-profile.service';
import { ArtistProfileFinetuneService, ArtistProfileKnowledge } from './artist-profile-finetune.service';
import { initialProfile } from './user-profile.service';
import { buildMusicalDnaContext, readMusicalDna } from '../types/musical-dna.types';

export interface GenreAdaptationProfile {
  id: string;
  label: string;
  primaryGenres: string[];
  productionDefaults: {
    recommendedDaw: string[];
    typicalBpmRange: [number, number];
    mixPriorities: string[];
    recordingFocus: string[];
    sonicSignatures: string[];
  };
  songwritingRules: {
    typicalStructures: string[];
    harmonyApproaches: string[];
    vocalDeliveryStyles: string[];
    lyricalThemePatterns: string[];
    arrangementPatterns: string[];
  };
  businessPlaybook: {
    releaseStrategy: string;
    typicalVelocity: string;
    incomeStreamPriority: string[];
    targetAudience: string;
    marketPosition: string;
    syncOpportunities: string[];
  };
  livePerformance: {
    isTourReady: boolean;
    tourReadinessRequirements: string[];
    typicalBacklineNeeds: string[];
    regionalStrength: string[];
  };
  legalSpecifics: {
    clearanceModel: string;
    sampleClearanceApproach: string;
    proAffiliation: string;
    splitSheetRequirement: string;
  };
}

export interface ArtistAdaptationState {
  profile: UserProfile;
  knowledge: ArtistProfileKnowledge;
  genreProfile: GenreAdaptationProfile;
  musicalDnaContext: string;
  productionDirective: string;
  businessStrategy: string;
  liveReadiness: {
    score: number;
    gaps: string[];
    nextMove: string;
  };
  syncReadiness: {
    score: number;
    clearanceModel: string;
    missingAssets: string[];
  };
  aiPersonaDirectives: {
    producer: string;
    songwriter: string;
    manager: string;
    ar: string;
  };
  nextPrioritizedAction: string;
  warningsAndProtections: string[];
}

const GENRE_PROFILES: GenreAdaptationProfile[] = [
  {
    id: 'hip-hop',
    label: 'Hip Hop',
    primaryGenres: ['Hip Hop', 'Rap', 'Trap', 'Boom Bap', 'Drill', 'Cloud Rap'],
    productionDefaults: {
      recommendedDaw: ['FL Studio', 'Ableton Live', 'Logic Pro', 'Pro Tools'],
      typicalBpmRange: [85, 100],
      mixPriorities: ['Kick clarity', '808 definition', 'Vocal presence', 'Bass-mid separation'],
      recordingFocus: ['Vocal takes variation', 'Ad-libs', 'Punch and clarity'],
      sonicSignatures: ['Sub-bass weight', 'Crisp hi-hats', 'Layered kicks', 'Vocal processing'],
    },
    songwritingRules: {
      typicalStructures: ['Intro + Hook + Verses + Outro', '16-bar verses', 'Catchy hooks'],
      harmonyApproaches: ['Minimalist (1-2 chords)', 'Loop-based', 'Melodic sample-based'],
      vocalDeliveryStyles: ['Aggressive', 'Flow-focused', 'Melodic rap', 'Singing hooks'],
      lyricalThemePatterns: ['Street narratives', 'Social commentary', 'Storytelling'],
      arrangementPatterns: ['Build-drop', 'Loop variation', 'Breakdown sections'],
    },
    businessPlaybook: {
      releaseStrategy: 'Frequent singles + mixtapes + albums',
      typicalVelocity: 'Monthly or every 2-3 weeks',
      incomeStreamPriority: ['Streaming', 'Sync (film/TV)', 'Merchandise', 'Live performance'],
      targetAudience: 'Streams-first, platform-native (TikTok, SoundCloud, YouTube)',
      marketPosition: 'Viral artist building a fanbase',
      syncOpportunities: ['Film/TV placement', 'Game soundtracks', 'Commercials'],
    },
    livePerformance: {
      isTourReady: true,
      tourReadinessRequirements: ['Recorded catalog', 'DJ setup', 'Backing track system'],
      typicalBacklineNeeds: ['Turntable/laptop', 'Microphone', 'Mixer'],
      regionalStrength: ['Major metro areas', 'University towns'],
    },
    legalSpecifics: {
      clearanceModel: 'Sample-dependent (every sample must clear)',
      sampleClearanceApproach: 'Master + publishing rights dual clearance',
      proAffiliation: 'Essential for royalty capture',
      splitSheetRequirement: 'Critical for sample-based works',
    },
  },
  {
    id: 'electronic-edm',
    label: 'Electronic/EDM',
    primaryGenres: ['Electronic', 'EDM', 'House', 'Techno', 'Ambient', 'Synthwave', 'Drum & Bass', 'Dubstep'],
    productionDefaults: {
      recommendedDaw: ['Ableton Live', 'FL Studio', 'Logic Pro', 'Max/MSP'],
      typicalBpmRange: [120, 140],
      mixPriorities: ['Synth clarity', 'Sidechain compression', 'Spatial depth', 'Sub bass tight'],
      recordingFocus: ['Synth programming', 'Drum sound design', 'Frequency separation'],
      sonicSignatures: ['Layered synths', 'Punchy drums', 'Sub bass dominance', 'Reverb/delay depth'],
    },
    songwritingRules: {
      typicalStructures: ['Intro build + Drop + Verse + Build + Drop + Outro', 'Progressive buildups'],
      harmonyApproaches: ['Harmonic stabs', 'Chord pads', 'Arpeggio patterns'],
      vocalDeliveryStyles: ['Robotic/processed', 'Ethereal/atmospheric', 'Vocoder-heavy'],
      lyricalThemePatterns: ['Dance/movement', 'Emotional atmosphere', 'Abstract imagery'],
      arrangementPatterns: ['Tension-release', 'Filter automation', 'Layered transitions'],
    },
    businessPlaybook: {
      releaseStrategy: 'EPs + singles + album project',
      typicalVelocity: 'Every 2-4 weeks for singles',
      incomeStreamPriority: ['Streaming', 'Live/Festival DJing', 'Sync (film/games)', 'Remixes'],
      targetAudience: 'Festival circuit + streaming playlists',
      marketPosition: 'Chart placement or festival headlining',
      syncOpportunities: ['Game soundtracks', 'Film trailers', 'Commercials'],
    },
    livePerformance: {
      isTourReady: true,
      tourReadinessRequirements: ['Complete track library', 'DJ software', 'Hardware (decks/mixer)'],
      typicalBacklineNeeds: ['Turntables/CDJs', 'Mixer', 'Headphones'],
      regionalStrength: ['Festival markets', 'Club circuit', 'Urban areas'],
    },
    legalSpecifics: {
      clearanceModel: 'Original composition priority + remixes may require originator consent',
      sampleClearanceApproach: 'Rare; emphasis on original synthesis',
      proAffiliation: 'Important for live performance royalties',
      splitSheetRequirement: 'Moderate; important for collaborations',
    },
  },
  {
    id: 'singer-songwriter',
    label: 'Singer-Songwriter',
    primaryGenres: ['Singer-Songwriter', 'Indie', 'Folk', 'Acoustic', 'Alternative'],
    productionDefaults: {
      recommendedDaw: ['Logic Pro', 'Pro Tools', 'Ableton', 'GarageBand'],
      typicalBpmRange: [80, 110],
      mixPriorities: ['Vocal intimacy', 'Acoustic clarity', 'Guitar definition', 'Lyrical presence'],
      recordingFocus: ['Vocal delivery nuance', 'Acoustic performance', 'Ambient recording'],
      sonicSignatures: ['Warm vocals', 'Natural acoustics', 'Minimal processing', 'Emotional space'],
    },
    songwritingRules: {
      typicalStructures: ['Verse-Chorus-Verse-Chorus-Bridge-Chorus-Outro', 'Long-form storytelling'],
      harmonyApproaches: ['Folk chord changes', 'Jazz voicing', 'Sus chords'],
      vocalDeliveryStyles: ['Conversational', 'Emotive', 'Falsetto moments', 'Harmony-led'],
      lyricalThemePatterns: ['Personal narrative', 'Relationship exploration', 'Introspection'],
      arrangementPatterns: ['Sparse-to-full', 'Instrumentation build', 'Dynamic arrangement'],
    },
    businessPlaybook: {
      releaseStrategy: 'Albums + EPs + singles',
      typicalVelocity: 'Every 6-12 months (album focus)',
      incomeStreamPriority: ['Streaming', 'Direct sales (Bandcamp)', 'Live performances', 'Sync'],
      targetAudience: 'Streaming + playlist consideration + critical acclaim',
      marketPosition: 'Artistic credibility + fan loyalty',
      syncOpportunities: ['Film/TV (emotional moments)', 'Documentaries', 'Commercials'],
    },
    livePerformance: {
      isTourReady: true,
      tourReadinessRequirements: ['Acoustic setup', 'Recorded album', 'Live arrangement'],
      typicalBacklineNeeds: ['Acoustic guitar', 'Microphone + stand', 'Minimal amplification'],
      regionalStrength: ['Intimate venues', 'College venues', 'Tour circuits'],
    },
    legalSpecifics: {
      clearanceModel: 'Self-written priority; minimal clearance unless covers/samples',
      sampleClearanceApproach: 'If samples: full clearance required',
      proAffiliation: 'Important for streaming + radio royalties',
      splitSheetRequirement: 'Important if co-writing',
    },
  },
  {
    id: 'rnb-soul',
    label: 'R&B/Soul',
    primaryGenres: ['R&B', 'Soul', 'Neo-Soul', 'Afrobeats', 'Funk'],
    productionDefaults: {
      recommendedDaw: ['Logic Pro', 'Pro Tools', 'Ableton', 'FL Studio'],
      typicalBpmRange: [90, 110],
      mixPriorities: ['Vocal warmth', 'Bass groove', 'Drum pocket', 'Emotional translation'],
      recordingFocus: ['Vocal takes', 'Live bass', 'Groove feel'],
      sonicSignatures: ['Warm low-end', 'Soulful vocals', 'Groove pocket', 'Lush harmonies'],
    },
    songwritingRules: {
      typicalStructures: ['Verse-Chorus-Verse-Chorus-Bridge-Chorus', 'Extended breakdowns'],
      harmonyApproaches: ['Extended chords (7ths, 9ths)', 'Gospel voicing', 'Jazz chords'],
      vocalDeliveryStyles: ['Soulful runs', 'Breathy delivery', 'Ad-libs', 'Vocal harmonies'],
      lyricalThemePatterns: ['Love/relationships', 'Self-empowerment', 'Storytelling'],
      arrangementPatterns: ['Groove-centric', 'Live instrumentation', 'Background vocal layering'],
    },
    businessPlaybook: {
      releaseStrategy: 'Albums + strategic singles',
      typicalVelocity: 'Every 3-6 months (single-led campaigns)',
      incomeStreamPriority: ['Streaming', 'Sync', 'Live performances', 'Radio'],
      targetAudience: 'Playlist placement + chart potential',
      marketPosition: 'Cultural relevance + radio potential',
      syncOpportunities: ['Film (romantic/drama)', 'TV shows', 'Commercials'],
    },
    livePerformance: {
      isTourReady: true,
      tourReadinessRequirements: ['Full band', 'Backing track system', 'Recorded catalog'],
      typicalBacklineNeeds: ['Full live band', 'Bass/drums', 'Backing vocals'],
      regionalStrength: ['All regions', 'Festival circuit', 'Theaters/arenas'],
    },
    legalSpecifics: {
      clearanceModel: 'Sample-dependent + original composition',
      sampleClearanceApproach: 'Master + publishing dual clearance',
      proAffiliation: 'Critical for radio + performance royalties',
      splitSheetRequirement: 'Critical for collaborative works',
    },
  },
];

@Injectable({ providedIn: 'root' })
export class ArtistAdaptiveEngineService {
  private profileService = inject(UserProfileService);
  private finetune = inject(ArtistProfileFinetuneService);

  readonly adaptationState = computed(() => this.buildAdaptationState(this.profileService.profile()));

  buildAdaptationState(profile: UserProfile | null | undefined): ArtistAdaptationState {
    if (profile?.settings?.security?.shareProfileAnswersWithAi !== true) {
      const safeProfile = {
        ...initialProfile,
        artistName: 'Private artist',
        primaryGenre: 'Artist-defined',
        musicalJourney: {
          ...initialProfile.musicalJourney,
          musicBlueprint: { ...initialProfile.musicalJourney.musicBlueprint },
        },
        settings: {
          ...initialProfile.settings,
          ai: { ...initialProfile.settings.ai, shareProfileAnswersWithAi: false } as any,
          security: {
            ...initialProfile.settings.security,
            hideSensitiveProfileDetails: true,
            shareProfileAnswersWithAi: false,
          },
        } as any,
      } as UserProfile;
      const knowledge = this.finetune.compileProfile(safeProfile);
      const genreProfile = this.detectGenreProfile(safeProfile, knowledge);
      return {
        profile: safeProfile,
        knowledge,
        genreProfile,
        musicalDnaContext: '',
        productionDirective: 'Use general production advice only; profile answers are private.',
        businessStrategy: 'Use general business guidance only; profile answers are private.',
        liveReadiness: { score: 0, gaps: [], nextMove: 'Ask before personalizing with artist answers.' },
        syncReadiness: { score: 0, clearanceModel: '', missingAssets: [] },
        aiPersonaDirectives: { producer: 'General advice only.', songwriter: 'General advice only.', manager: 'General advice only.', ar: 'General advice only.' },
        nextPrioritizedAction: 'Ask the artist before using profile answers for personalized advice.',
        warningsAndProtections: ['Artist profile answers are private from AI by the artist’s setting.'],
      };
    }
    const knowledge = this.finetune.compileProfile(profile);
    const genreProfile = this.detectGenreProfile(profile, knowledge);
    const dnaContext = buildMusicalDnaContext(profile);

    return {
      profile: (profile ?? {}) as UserProfile,
      knowledge,
      genreProfile,
      musicalDnaContext: dnaContext,
      productionDirective: this.buildProductionDirective(profile, knowledge, genreProfile),
      businessStrategy: this.buildBusinessStrategy(profile, knowledge, genreProfile),
      liveReadiness: this.assessLiveReadiness(profile, knowledge, genreProfile),
      syncReadiness: this.assessSyncReadiness(profile, knowledge, genreProfile),
      aiPersonaDirectives: this.buildAiPersonaDirectives(profile, knowledge, genreProfile),
      nextPrioritizedAction: this.derivePrioritizedAction(profile, knowledge, genreProfile),
      warningsAndProtections: this.deriveWarningsAndProtections(profile, knowledge, genreProfile),
    };
  }

  private detectGenreProfile(profile: UserProfile | null | undefined, knowledge: ArtistProfileKnowledge): GenreAdaptationProfile {
    const genreQuery = (profile?.primaryGenre || '').trim().toLowerCase();
    let match = GENRE_PROFILES.find((g) =>
      g.primaryGenres.some((pg) => pg.toLowerCase() === genreQuery)
    );
    if (!match) {
      match = GENRE_PROFILES.find((g) =>
        g.primaryGenres.some((pg) => genreQuery.includes(pg.toLowerCase()) || pg.toLowerCase().includes(genreQuery))
      );
    }
    const base: GenreAdaptationProfile = match || {
      id: 'artist-defined', label: profile?.primaryGenre || 'Artist-defined', primaryGenres: [],
      productionDefaults: { recommendedDaw: ['your existing DAW'], typicalBpmRange: [40, 240], mixPriorities: ['Artist intent', 'Translation and dynamics'], recordingFocus: ['Capture the intended performance'], sonicSignatures: ['Artist-defined sonic signature'] },
      songwritingRules: { typicalStructures: ['Artist-selected structure'], harmonyApproaches: ['Artist-defined harmony'], vocalDeliveryStyles: ['Declared delivery'], lyricalThemePatterns: ['Artist-owned themes'], arrangementPatterns: ['Artist-defined arrangement'] },
      businessPlaybook: { releaseStrategy: 'Readiness-led release plan within capacity and budget', typicalVelocity: 'Artist-selected sustainable cadence', incomeStreamPriority: ['Evaluate rights, direct support and live/sync fit'], targetAudience: 'Not declared — validate with listener evidence', marketPosition: 'Not declared', syncOpportunities: ['Assess catalog and clearance before pitching'] },
      livePerformance: { isTourReady: false, tourReadinessRequirements: ['Rehearsed set', 'Budget', 'Verified audience draw'], typicalBacklineNeeds: ['Verify requirements with the artist and venue'], regionalStrength: ['Use declared regions and demand evidence'] },
      legalSpecifics: { clearanceModel: 'Assess actual usage and jurisdiction, not genre', sampleClearanceApproach: 'Check recording and composition permissions when applicable', proAffiliation: 'Territory-dependent', splitSheetRequirement: 'Negotiate separate composition and master pools' },
    };
    // Explicit answers override suggestions, including hybrid/unlisted genres.
    const range = knowledge.sonic.tempoZone.match(/(\d{2,3})\s*[-–]\s*(\d{2,3})/);
    const bpm: [number, number] = range && Number(range[1]) >= 40 && Number(range[2]) <= 240 && Number(range[2]) >= Number(range[1]) ? [Number(range[1]), Number(range[2])] : base.productionDefaults.typicalBpmRange;
    return {
      ...base, label: profile?.primaryGenre || base.label,
      productionDefaults: { ...base.productionDefaults, recommendedDaw: profile?.daw?.length ? profile.daw : base.productionDefaults.recommendedDaw, typicalBpmRange: bpm, mixPriorities: knowledge.craft.mixingPriorities.length ? knowledge.craft.mixingPriorities : base.productionDefaults.mixPriorities, recordingFocus: knowledge.craft.recordingPriorities.length ? knowledge.craft.recordingPriorities : base.productionDefaults.recordingFocus, sonicSignatures: knowledge.sonic.signatureSound ? [knowledge.sonic.signatureSound] : base.productionDefaults.sonicSignatures },
      songwritingRules: { ...base.songwritingRules, typicalStructures: knowledge.sonic.arrangement ? [knowledge.sonic.arrangement] : base.songwritingRules.typicalStructures, harmonyApproaches: knowledge.sonic.harmony ? [knowledge.sonic.harmony] : base.songwritingRules.harmonyApproaches, vocalDeliveryStyles: knowledge.sonic.delivery ? [knowledge.sonic.delivery] : base.songwritingRules.vocalDeliveryStyles, lyricalThemePatterns: knowledge.craft.lyricalThemes.length ? knowledge.craft.lyricalThemes : base.songwritingRules.lyricalThemePatterns },
      businessPlaybook: { ...base.businessPlaybook, typicalVelocity: knowledge.business.velocity || base.businessPlaybook.typicalVelocity, incomeStreamPriority: knowledge.business.streams.length ? knowledge.business.streams : base.businessPlaybook.incomeStreamPriority, targetAudience: knowledge.audience.profile || base.businessPlaybook.targetAudience, marketPosition: knowledge.audience.marketPosition || base.businessPlaybook.marketPosition },
    };
  }

  private buildProductionDirective(profile: UserProfile | null | undefined, knowledge: ArtistProfileKnowledge, genre: GenreAdaptationProfile): string {
    if (!profile) return '';
    const daw = profile.daw?.[0] || genre.productionDefaults.recommendedDaw[0] || 'your DAW';
    const declaredTempo = profile.musicalJourney?.preferredBpmRange || '';
    const fallbackTempo = `${genre.productionDefaults.typicalBpmRange[0]}-${genre.productionDefaults.typicalBpmRange[1]} BPM`;
    // The profile may already carry the unit; appending it again produced
    // "60-80 BPM BPM" in the production directive.
    const bpm = !declaredTempo
      ? fallbackTempo
      : /bpm/i.test(declaredTempo)
        ? declaredTempo
        : `${declaredTempo} BPM`;
    const sonicRule = knowledge.sonic.nonNegotiables || `Protect the ${genre.productionDefaults.sonicSignatures[0] || 'signature sound'}`;

    return [
      `PRODUCTION FOR ${genre.label.toUpperCase()}`,
      `Working DAW: ${daw}`,
      `Tempo zone: ${bpm}`,
      `Mix priorities: ${genre.productionDefaults.mixPriorities.join(' > ')}`,
      `Recording focus: ${genre.productionDefaults.recordingFocus.join(', ')}`,
      `Sonic rule: ${sonicRule}`,
      knowledge.craft.productionPhilosophy ? `Philosophy: ${knowledge.craft.productionPhilosophy}` : '',
    ].filter(Boolean).join('\n');
  }

  private buildBusinessStrategy(profile: UserProfile | null | undefined, knowledge: ArtistProfileKnowledge, genre: GenreAdaptationProfile): string {
    if (!profile) return '';
    const velocity = profile.musicalJourney?.releaseVelocity || genre.businessPlaybook.typicalVelocity;
    const focus = profile.musicalJourney?.currentFocus || genre.businessPlaybook.marketPosition;
    const metric = profile.musicalJourney?.primarySuccessMetric || 'Monthly listeners';
    const streams = knowledge.business.streams.length ? knowledge.business.streams : genre.businessPlaybook.incomeStreamPriority;

    return [
      `BUSINESS STRATEGY FOR ${genre.label.toUpperCase()}`,
      `Release velocity: ${velocity}`,
      `Current focus: ${focus}`,
      `Success metric: ${metric}`,
      `Income streams (priority): ${Array.isArray(streams) ? streams.slice(0, 3).join(', ') : streams}`,
      `Market position: ${genre.businessPlaybook.targetAudience}`,
      `Sync opportunities: ${genre.businessPlaybook.syncOpportunities.join(', ')}`,
    ].join('\n');
  }

  private assessLiveReadiness(profile: UserProfile | null | undefined, knowledge: ArtistProfileKnowledge, genre: GenreAdaptationProfile): { score: number; gaps: string[]; nextMove: string } {
    if (!profile) return { score: 0, gaps: [], nextMove: '' };
    const readiness = String(profile.touringDetails?.isTourReady || 'Studio Only');
    const backline = String(profile.touringDetails?.hasBackline || 'No');
    const hasBackline = /^(yes|partial|available)$/i.test(backline);
    const regions = Array.isArray(profile.touringDetails?.regions) ? profile.touringDetails.regions : [];
    const catalogSize = Array.isArray(profile.catalog) ? profile.catalog.length : 0;
    let score = 0;
    const gaps: string[] = [];

    if (/^(global ready|ready to tour|tour ready)$/i.test(readiness)) score += 40;
    else if (/^(regional ready|can perform|performance ready)$/i.test(readiness)) score += 30;
    else if (/^local gigs$/i.test(readiness)) score += 20;
    if (hasBackline) score += 20;
    else gaps.push(`Backline: genre-typical needs are ${genre.livePerformance.typicalBacklineNeeds.join(', ')}`);
    if (regions.length > 0) score += 20;
    else gaps.push(`Regional routing: not set (genre hotspots: ${genre.livePerformance.regionalStrength.join(', ')})`);
    if (catalogSize >= 3) score += 20;
    else gaps.push('Catalog size: need at least 3 works before booking tours');

    const nextMove =
      score >= 80
        ? 'Declared live-preparation checklist is strong; verify rehearsals, audience draw, safety and tour budget before booking.'
        : score >= 40
          ? `Half-ready: ${gaps[0] || 'add live elements'}. Fix this before heavy promotion.`
          : `Early stage for live — secure the basics first: ${gaps[0] || 'recorded catalog + backline clarity'}.`;

    return { score, gaps, nextMove };
  }

  private assessSyncReadiness(profile: UserProfile | null | undefined, knowledge: ArtistProfileKnowledge, genre: GenreAdaptationProfile): { score: number; clearanceModel: string; missingAssets: string[] } {
    if (!profile) return { score: 0, clearanceModel: '', missingAssets: [] };
    const syncReady = String(profile.syncDetails?.isSyncReady || 'Not Started');
    const hasClean = profile.syncDetails?.hasCleanVersions;
    const hasInstrumentals = profile.syncDetails?.hasInstrumentals;
    const hasStems = profile.syncDetails?.hasStems || 'No';
    const oneStop = profile.syncDetails?.oneStopClearance;
    let score = 0;
    const missingAssets: string[] = [];

    // Rank the exact questionnaire/editor vocabulary rather than silently
    // treating every selected readiness tier as an unknown answer.
    if (syncReady === 'One-Stop Qualified') score += 25;
    else if (syncReady === 'Full Stem Mastery') score += 18;
    else if (syncReady === 'Basics Ready' || /^(ready|sync ready|ready to pitch)$/i.test(syncReady)) score += 10;
    else if (syncReady === 'In Progress') score += 5;

    if (hasClean === true || /^yes$/i.test(String(hasClean))) score += 15;
    else missingAssets.push('Clean versions (no profanity)');
    if (hasInstrumentals === true || /^yes$/i.test(String(hasInstrumentals))) score += 15;
    else missingAssets.push('Instrumental versions');
    if (hasStems === true || /^(partial|full multitrack|yes|all|full stems)$/i.test(String(hasStems))) {
      score += /^partial$/i.test(String(hasStems)) ? 10 : 20;
    } else {
      missingAssets.push('Stems (individual tracks)');
    }
    if (oneStop === true || /^yes$/i.test(String(oneStop))) score += 25;
    else missingAssets.push('One-stop clearance (sample resolution)');

    return {
      score: Math.min(100, score),
      clearanceModel: genre.legalSpecifics.clearanceModel,
      missingAssets,
    };
  }

  private buildAiPersonaDirectives(profile: UserProfile | null | undefined, knowledge: ArtistProfileKnowledge, genre: GenreAdaptationProfile): { producer: string; songwriter: string; manager: string; ar: string } {
    return {
      producer: `Produce ${genre.label} using the artist's actual chain (${(profile?.equipment || []).join(', ') || 'undefined'}). Protect: ${genre.productionDefaults.mixPriorities.join(', ')}.`,
      songwriter: `Write inside ${knowledge.identity.livedWorld || "the artist's lived world"}. Structure: ${genre.songwritingRules.typicalStructures[0]}. Theme: ${knowledge.craft.lyricalThemes.join(', ') || genre.songwritingRules.lyricalThemePatterns[0]}.`,
      manager: `Route toward ${knowledge.business.focus || genre.businessPlaybook.marketPosition}. Release cadence: ${knowledge.business.velocity || genre.businessPlaybook.typicalVelocity}. Success metric: ${knowledge.business.successMetric || 'streams + engagement'}.`,
      ar: `Evaluate against signature sound (${knowledge.sonic.signatureSound || 'undefined'}). Reject ideas that trade away "${genre.productionDefaults.sonicSignatures[0]}" or the artist's stated intent.`,
    };
  }

  private derivePrioritizedAction(profile: UserProfile | null | undefined, knowledge: ArtistProfileKnowledge, genre: GenreAdaptationProfile): string {
    if (!profile) return '';
    if (knowledge.pathway.nextStep) return knowledge.pathway.nextStep;
    const live = this.assessLiveReadiness(profile, knowledge, genre);
    if (live.score < 40 && (profile.catalog?.length || 0) > 0) {
      return `Build live readiness for ${genre.label}: ${live.gaps[0] || 'define the touring plan'}.`;
    }
    const sync = this.assessSyncReadiness(profile, knowledge, genre);
    if (sync.score < 60) {
      return `Prepare sync assets: ${sync.missingAssets[0] || 'complete versions'}.`;
    }
    return knowledge.pathway.nextStep || `Keep building: next release should prove ${knowledge.business.successMetric || "the artist's intent"}.`;
  }

  private deriveWarningsAndProtections(profile: UserProfile | null | undefined, knowledge: ArtistProfileKnowledge, genre: GenreAdaptationProfile): string[] {
    const warnings: string[] = [];
    if ((profile?.catalog || []).some((item) => !item.credits)) {
      warnings.push('Rights evidence incomplete: verify contributors and any samples/interpolations. Missing credits do not prove sampling; genre never proves clearance.');
    }
    if (knowledge.sonic.nonNegotiables && profile?.settings?.studio?.autoMixEnabled) {
      warnings.push(`⚠️ Auto-mix is on but "${knowledge.sonic.nonNegotiables}" is declared non-negotiable — review auto decisions.`);
    }
    if (knowledge.presence.catalogAverageCompleteness < 60) {
      warnings.push('⚠️ Release record is incomplete — fill ISRC/UPC/credits before syncing or licensing.');
    }
    return warnings;
  }
}

export { GENRE_PROFILES };
