import { Injectable, computed, inject } from '@angular/core';
import { UserProfileService, UserProfile } from './user-profile.service';
import { ArtistOnlineFingerprintService } from './artist-online-fingerprint.service';
import { ArtistPathwayService, AREA_LABEL } from './artist-pathway.service';

/** S.M.U.V.E. operating roles that adapt to the artist’s completed profile. */
export type FinetuneRole =
  | 'producer'
  | 'songwriter'
  | 'manager'
  | 'ar'
  | 'promotion'
  | 'marketing'
  | 'legal'
  | 'brand';

export interface ArtistProfileKnowledge {
  state: 'calibrated' | 'partial' | 'foundational';
  completeness: number;
  genre: string;
  roles: string[];
  identity: {
    name: string;
    meaning: string;
    origin: string;
    breakthrough: string;
    tension: string;
    livedWorld: string;
  };
  sonic: {
    signatureSound: string;
    subgenres: string[];
    influences: string[];
    delivery: string;
    groove: string;
    harmony: string;
    arrangement: string;
    nonNegotiables: string;
    tempoZone: string;
  };
  craft: {
    productionPhilosophy: string;
    songwritingProcess: string;
    recordingPriorities: string[];
    mixingPriorities: string[];
    gear: string[];
    lyricalThemes: string[];
  };
  audience: {
    profile: string;
    intent: string;
    recognitionCue: string;
    brandVoices: string[];
    visualAesthetic: string[];
    contentStrategy: string;
    marketPosition: string;
  };
  business: {
    goals: string[];
    focus: string;
    successMetric: string;
    velocity: string;
    streams: string[];
    challenge: string;
    collaborations: string[];
  };
  live: {
    readiness: string;
    regions: string[];
    travel: string;
    hasBackline: boolean;
    performancesPerYear: string;
  };
  sync: {
    readiness: string;
    hasCleanVersions: boolean;
    hasInstrumentals: boolean;
    hasStems: boolean;
    oneStopClearance: boolean;
    catalogSize: number;
    keywords: string[];
  };
  legal: {
    registeredWorks: boolean;
    proAffiliation: string;
    proIdentity: string;
    splitSheet: string;
    incorporated: boolean;
    trademark: string;
  };
  operations: {
    roster: string[];
    catalogSize: number;
    equipment: string[];
    daw: string[];
    services: string[];
    skills: string[];
    expertise: string[];
    pressAssets: number;
  };
  /**
   * The artist's official online footprint. S.M.U.V.E. must know the difference
   * between an artist with no presence at all and one who already has dashboards
   * and registrations, because the advice is opposite in each case.
   */
  presence: {
    /** Beginner, developing, or established — judged from evidence. */
    track: 'emerging' | 'developing' | 'established';
    hasFingerprint: boolean;
    coverage: number;
    verified: string[];
    unverified: string[];
    missingCategories: string[];
    hasForArtists: boolean;
    hasPro: boolean;
    hasAnalytics: boolean;
    hasDelivery: boolean;
    /** Release-record integrity, so catalogue advice is grounded. */
    catalogAverageCompleteness: number;
    undatedWorks: number;
    historyIssues: string[];
    nextStep: string;
  };
  /**
   * Where the artist sits on the official pathway, and the single next move.
   * Every role should steer toward this step rather than inventing its own
   * priority order.
   */
  pathway: {
    stage: 'getting-started' | 'building' | 'consolidating' | 'official';
    overall: number;
    officialAreas: string[];
    unofficialAreas: string[];
    nextStep: string;
    nextStepWhy: string;
    nextStepAction: string;
    nextStepEvidence: string;
    nextStepDestination: string;
    /** Independent moves the artist could take instead, if they have capacity. */
    parallel: string[];
  };
  differentiators: string[];
  missing: string[];
}

export interface RoleDirective {
  role: FinetuneRole;
  profileState: ArtistProfileKnowledge['state'];
  directive: string;
  tips: string[];
  guardrails: string[];
}

export interface ArtistVoiceSpec {
  tone: string;
  vocabulary: string;
  imagery: string[];
  avoid: string[];
}

const ROLE_LABEL: Record<FinetuneRole, string> = {
  producer: 'PRODUCER',
  songwriter: 'SONGWRITER',
  manager: 'MANAGER',
  ar: 'A&R',
  promotion: 'PROMOTION',
  marketing: 'MARKETING',
  legal: 'LEGAL',
  brand: 'BRAND',
};

const ALL_ROLES: FinetuneRole[] = [
  'producer',
  'songwriter',
  'manager',
  'ar',
  'promotion',
  'marketing',
  'legal',
  'brand',
];

/**
 * Compiles the complete artist profile into deterministic operating knowledge.
 *
 * This is the fine-tuning boundary for S.M.U.V.E.: production, songwriting,
 * marketing, promotion, legal, and recommendation surfaces all read from here,
 * so the experience adapts to one specific artist instead of generic genre
 * advice. It performs no network calls, so it also powers offline mode.
 */
@Injectable({ providedIn: 'root' })
export class ArtistProfileFinetuneService {
  private profileService = inject(UserProfileService);
  private fingerprint = inject(ArtistOnlineFingerprintService);
  private pathwayService = inject(ArtistPathwayService);

  readonly knowledge = computed(() => this.compile(this.profileService.profile()));

  /**
   * Compiles any profile object — including an unsaved builder draft — so
   * surfaces can preview what S.M.U.V.E. would adapt to before committing.
   */
  compileProfile(profile: UserProfile | null | undefined): ArtistProfileKnowledge {
    return this.compile(profile);
  }

  /** Role directive for an arbitrary profile (draft preview). */
  directiveForProfile(role: FinetuneRole, profile: UserProfile | null | undefined): RoleDirective {
    const knowledge = this.compile(profile);
    const { directive, tips } = this.buildRole(role, knowledge);
    return {
      role,
      profileState: knowledge.state,
      directive,
      tips,
      guardrails: this.guardrails(knowledge),
    };
  }

  /** Role-specific operating directive derived from the artist’s own evidence. */
  directiveFor(role: FinetuneRole): RoleDirective {
    const knowledge = this.knowledge();
    const guardrails = this.guardrails(knowledge);
    const { directive, tips } = this.buildRole(role, knowledge);
    const missing = knowledge.missing.slice(0, 3).join('; ') || 'n/a';
    return {
      role,
      profileState: knowledge.state,
      directive:
        knowledge.state === 'foundational'
          ? `${directive} Profile evidence is thin (${knowledge.completeness}%) — keep this foundational and ask for: ${missing}.`
          : directive,
      tips,
      guardrails,
    };
  }

  /** How S.M.U.V.E. should sound when writing as or for this artist. */
  voiceSpec(): ArtistVoiceSpec {
    const knowledge = this.knowledge();
    return {
      tone: knowledge.craft.productionPhilosophy
        ? `Mirror the artist’s stated philosophy: ${knowledge.craft.productionPhilosophy}`
        : 'Stay plain and direct until the artist’s creative philosophy is captured.',
      vocabulary: knowledge.identity.livedWorld
        ? `Reuse the artist’s own concrete language: ${knowledge.identity.livedWorld}`
        : 'Use the artist’s own words; do not substitute industry filler.',
      imagery: [
        ...(knowledge.identity.tension
          ? [`Their central tension: ${knowledge.identity.tension}`]
          : []),
        ...(knowledge.sonic.signatureSound
          ? [`Their sonic world: ${knowledge.sonic.signatureSound}`]
          : []),
        ...(knowledge.audience.recognitionCue
          ? [`Their recognition cue: ${knowledge.audience.recognitionCue}`]
          : []),
      ],
      avoid: [
        'Impersonating or imitating another artist’s identity or likeness.',
        'Inventing biography, chart positions, press quotes, or audience numbers.',
        'Writing lyrics or copy that contradicts the artist’s stated intent or boundaries.',
        ...(knowledge.sonic.nonNegotiables
          ? [`Overriding the sonic non-negotiable: ${knowledge.sonic.nonNegotiables}`]
          : []),
      ],
    };
  }

  /**
   * Full prompt-ready block injected into S.M.U.V.E.’s persona so the model
   * adapts production, songwriting, marketing, promotion, and legal answers.
   */
  promptBlock(): string {
    const k = this.knowledge();
    if (k.state === 'foundational') {
      // The presence line matters most here: a beginner must not be handed
      // dashboard or analytics tactics for accounts they have never created.
      return `ARTIST PROFILE FINE-TUNE: incomplete (${k.completeness}% evidence). Genre reference: ${k.genre}. ${this.presenceLine(k)} ${this.pathwayLine(k)} Keep guidance foundational and explicitly ask for: ${k.missing.join('; ')}.`;
    }
    const sections = ALL_ROLES.map(
      (role) => `${ROLE_LABEL[role]}: ${this.directiveFor(role).directive}`
    ).join('\n');
    const voice = this.voiceSpec();
    return [
      `ARTIST PROFILE FINE-TUNE (${k.state}, ${k.completeness}% evidence) — adapt every answer to this artist:`,
      `GENRE CONTEXT: ${k.genre} is a reference frame, not an identity verdict.`,
      `DIFFERENTIATORS: ${k.differentiators.join(' | ') || 'none captured yet'}`,
      `MISSING EVIDENCE: ${k.missing.join('; ') || 'none — profile is calibrated'}`,
      sections,
      `STUDIO CHAIN: ${[...k.operations.equipment, ...k.operations.daw, ...k.operations.services].join(', ') || 'not captured'}`,
      `ROSTER: ${k.operations.roster.join(' | ') || 'independent, no roster'}`,
      `SYNC AND LEGAL: sync=${k.sync.readiness || 'unset'}, oneStop=${k.sync.oneStopClearance}, stems=${k.sync.hasStems}, worksRegistered=${k.legal.registeredWorks}, pro=${k.legal.proAffiliation || 'none'}, splitSheet=${k.legal.splitSheet || 'unknown'}, incorporated=${k.legal.incorporated}, trademark=${k.legal.trademark || 'none'}`,
      `LIVE: readiness=${k.live.readiness || 'unset'}, regions=${k.live.regions.join(', ') || 'none'}, travel=${k.live.travel || 'unset'}, backline=${k.live.hasBackline}, showsPerYear=${k.live.performancesPerYear || 'unset'}`,
      `CATALOGUE: ${k.operations.catalogSize} item(s), sync-ready=${k.sync.catalogSize}, releaseRecord=${k.presence.catalogAverageCompleteness}% documented, undated=${k.presence.undatedWorks}, historyIssues=${k.presence.historyIssues.join(' | ') || 'none'}`,
      this.presenceLine(k),
      this.pathwayLine(k),
      `VOICE: ${voice.tone} ${voice.vocabulary}`,
      `NEVER: ${voice.avoid.join(' | ')}`,
      `ALWAYS: ${this.guardrails(k).join(' | ')}`,
      `TIP QUEUE: ${this.tips().join(' | ')}`,
    ].join('\n');
  }

  /**
   * S.M.U.V.E. must never suggest “optimise your Spotify for Artists pitch” to
   * an artist who has no profile at all, nor “get your first release out” to an
   * artist with a live catalogue. The plan and the state come from this line.
   */
  /**
   * The pathway line. S.M.U.V.E. must recommend the same next step the pathway
   * does, otherwise the artist gets contradictory priorities from different
   * roles on the same day.
   */
  private pathwayLine(k: ArtistProfileKnowledge): string {
    const p = k.pathway;
    if (!p.nextStep) {
      return `OFFICIAL PATHWAY: every area is official (${p.overall}%). Protect the record and keep it current as new releases go out.`;
    }
    return [
      `OFFICIAL PATHWAY (${p.stage}, ${p.overall}%):`,
      `official areas=[${p.officialAreas.join(', ') || 'none yet'}]`,
      `not yet official=[${p.unofficialAreas.join(', ')}]`,
      `NEXT STEP: ${p.nextStep} — ${p.nextStepWhy} First action: ${p.nextStepAction} Evidence S.M.U.V.E. looks for: ${p.nextStepEvidence}`,
      p.nextStepDestination ? `Where: ${p.nextStepDestination}.` : '',
      p.parallel.length
        ? `Acceptable in parallel: ${p.parallel.join(' | ')}.`
        : '',
    ]
      .filter(Boolean)
      .join(' ');
  }

  private presenceLine(k: ArtistProfileKnowledge): string {
    const p = k.presence;
    if (p.track === 'emerging' && !p.hasFingerprint) {
      return `ONLINE PRESENCE: none yet — the artist is a beginner with no official profiles. Do not reference dashboards, analytics, or royalty statements they do not have. Start from: ${p.nextStep || 'first release through a free distributor'}.`;
    }
    return [
      `ONLINE PRESENCE (${p.track}, ${p.coverage}% coverage):`,
      `verified=[${p.verified.join(', ') || 'none'}]`,
      `unverified=[${p.unverified.join(', ') || 'none'}]`,
      `missing=[${p.missingCategories.join(', ') || 'none'}]`,
      `forArtists=${p.hasForArtists}, pro=${p.hasPro}, analytics=${p.hasAnalytics}, delivery=${p.hasDelivery}`,
      `nextStep=${p.nextStep || 'consolidate the official record'}`,
    ].join(' ');
  }

  /** Concrete, profile-derived actions the artist can act on today. */
  tips(): string[] {
    return this.tipsFor(this.knowledge());
  }

  /** Tips for an arbitrary profile, so drafts can preview them before commit. */
  tipsForProfile(profile: UserProfile | null | undefined): string[] {
    return this.tipsFor(this.compile(profile));
  }

  private tipsFor(k: ArtistProfileKnowledge): string[] {
    const tips: string[] = [];
    // The pathway's next step leads, so the tip queue and the pathway panel
    // never disagree about what matters now.
    if (k.pathway.nextStep) {
      tips.push(
        `Pathway is ${k.pathway.overall}% complete — next step: ${k.pathway.nextStep}. ${k.pathway.nextStepAction}`
      );
    }
    const presence = this.presenceTips(k);
    // Unresolved presence blocks everything downstream — verification, claims,
    // and release documentation lead the queue rather than getting trimmed off.
    const presenceLeads =
      !k.presence.hasFingerprint ||
      k.presence.unverified.length > 0 ||
      k.presence.catalogAverageCompleteness < 60 ||
      k.presence.undatedWorks > 0;
    if (presenceLeads) {
      tips.push(...presence.slice(0, 3));
    }
    if (k.craft.mixingPriorities.length) {
      tips.push(`Lock the mix around ${k.craft.mixingPriorities.join(', ')} before chasing loudness.`);
    }
    if (k.sonic.nonNegotiables) {
      tips.push(`Treat “${k.sonic.nonNegotiables}” as a session rule and check it before every bounce.`);
    }
    if (k.audience.recognitionCue) {
      tips.push(`Front-load the recognition cue in intros, shorts, and pitch assets: ${k.audience.recognitionCue}.`);
    }
    if (k.business.successMetric) {
      tips.push(`Measure the next release against one metric: ${k.business.successMetric}.`);
    }
    if (k.craft.lyricalThemes.length) {
      tips.push(`Keep lyrics anchored in ${k.craft.lyricalThemes.join(', ')} instead of trend-chasing topics.`);
    }
    if (k.business.velocity) {
      tips.push(`Hold a ${k.business.velocity} release cadence only while quality holds — protect the catalogue.`);
    }
    if (k.business.streams.length) {
      tips.push(`Route effort toward ${k.business.streams.join(', ')} and cut channels that do not serve ${k.audience.profile || 'this audience'}.`);
    }
    if (k.identity.livedWorld) {
      tips.push(`Mine lived-world detail for content: ${k.identity.livedWorld}.`);
    }
    if (!presenceLeads) {
      tips.push(...presence.slice(0, 2));
    }
    return tips.slice(0, 10);
  }

  /**
   * Stage-correct presence advice. A beginner hears setup steps; an artist
   * already online hears verification and consolidation steps.
   */
  private presenceTips(k: ArtistProfileKnowledge): string[] {
    const p = k.presence;
    const tips: string[] = [];

    if (!p.hasFingerprint) {
      tips.push(
        `No official online fingerprint yet — the first move is: ${p.nextStep || 'one release through a free distributor'} (no budget required).`
      );
      tips.push(
        'Until a release exists, skip dashboard and analytics tactics entirely; build the first work instead.'
      );
      return tips;
    }

    if (p.unverified.length) {
      tips.push(
        `Claim and verify the accounts already created: ${p.unverified.slice(0, 4).join(', ')}.`
      );
    }
    if (!p.hasForArtists) {
      tips.push(
        'No For Artists dashboard is recorded — claim the platform dashboards so pitching and audience data become possible.'
      );
    }
    // Release-record integrity outranks tooling: an undocumented catalogue
    // cannot support royalty, pitch, or catalogue claims in any tool.
    if (p.catalogAverageCompleteness < 60) {
      tips.push(
        `Release record is ${p.catalogAverageCompleteness}% documented — fill ISRC/UPC, credits, and split references so the history is provable.`
      );
    }
    if (p.undatedWorks) {
      tips.push(
        `${p.undatedWorks} work(s) have no release date in the official history — date them so sequencing is trustworthy.`
      );
    }
    p.historyIssues.slice(0, 1).forEach((issue) => tips.push(issue));
    if (!p.hasPro && k.legal.proAffiliation !== 'None') {
      tips.push(
        'No performance rights organisation is recorded — royalties for plays may be going uncollected.'
      );
    }
    if (!p.hasAnalytics) {
      tips.push('No analytics tool is recorded — add one so release claims are evidenced, not guessed.');
    }
    if (p.verified.length) {
      tips.push(
        `Verified presence anchors the official record: ${p.verified.slice(0, 4).join(', ')}. Link new releases to those same profiles.`
      );
    }
    return tips;
  }

  private guardrails(k: ArtistProfileKnowledge): string[] {
    return [
      'Never invent biography, audience data, achievements, or credits.',
      'Treat reference tracks as learning references, not imitation targets.',
      'Keep every recommendation inside the artist’s stated intent and boundaries.',
      k.state === 'calibrated'
        ? 'Use the completed profile directly instead of asking the artist to restate it.'
        : `Ask for missing evidence before high-confidence claims: ${k.missing.slice(0, 3).join('; ') || 'n/a'}.`,
      'Legal output is drafting guidance, not representation — flag anything needing a licensed attorney in the artist’s jurisdiction.',
      k.pathway.nextStep
        ? `Do not propose priorities that conflict with the pathway step “${k.pathway.nextStep}” unless the artist explicitly redirects.`
        : 'The pathway is complete — focus on protecting and extending what already exists.',
    ];
  }

  private buildRole(
    role: FinetuneRole,
    k: ArtistProfileKnowledge
  ): { directive: string; tips: string[] } {
    const audience = k.audience.profile || 'the intended listener';
    switch (role) {
      case 'producer':
        return {
          directive: `Produce ${k.genre} around ${k.sonic.signatureSound || 'an undefined signature sound'}. Protect ${k.craft.mixingPriorities.join(', ') || 'translation and clarity'} and the sonic rule “${k.sonic.nonNegotiables || 'none set yet'}”. Keep the ${k.sonic.delivery || 'lead'} delivery intelligible against the ${k.sonic.groove || 'chosen'} groove in ${k.sonic.tempoZone || 'the artist’s tempo zone'}.`,
          tips: [
            `Arrangement follows: ${k.sonic.arrangement || 'define an energy arc before producing'}.`,
            `Harmony stays inside: ${k.sonic.harmony || 'capture the harmonic language'}.`,
            k.craft.gear.length
              ? `Work with the artist’s actual chain: ${k.craft.gear.join(', ')}.`
              : 'Confirm the artist’s real recording chain before suggesting gear.',
            `Studio reality: ${[...k.operations.equipment, ...k.operations.daw, ...k.operations.services].join(', ') || 'equipment, DAW, and services are not captured yet'}.`,
          ],
        };
      case 'songwriter':
        return {
          directive: `Write inside the artist’s world: ${k.identity.livedWorld || 'capture lived-world detail first'}. Hold the point of view “${k.identity.tension || 'not yet defined'}” and serve the intent “${k.audience.intent || 'not yet defined'}”. Keep themes on ${k.craft.lyricalThemes.join(', ') || 'the artist’s own subject matter'} and let the ${k.sonic.delivery || 'lead'} delivery carry the emotion.`,
          tips: [
            k.craft.songwritingProcess
              ? `Follow their process: ${k.craft.songwritingProcess}.`
              : 'Capture the artist’s writing process so drafts match how they actually create.',
            `Every section must earn the recognition cue: ${k.audience.recognitionCue || 'not yet defined'}.`,
            'Rewrite toward specificity — replace abstractions with the artist’s own nouns and places.',
          ],
        };
      case 'manager':
        return {
          directive: `Route the next move toward ${k.business.focus || k.business.goals[0] || 'one measurable career milestone'}. Remove the bottleneck: ${k.business.challenge || 'unclear — ask'}. Reject activity that does not serve ${audience}.`,
          tips: [
            `Sequence work so it produces evidence toward ${k.business.successMetric || 'a defined success metric'}.`,
            `Protect the release cadence (${k.business.velocity || 'not set'}) without diluting quality.`,
            k.business.collaborations.length
              ? `Prioritise the stated collaborations: ${k.business.collaborations.join(', ')}.`
              : 'Define collaboration goals before pitching partners.',
            k.operations.roster.length
              ? `Delegate through the real roster: ${k.operations.roster.join(' | ')}.`
              : 'The artist is running solo — flag where a manager, engineer, or booker removes the bottleneck.',
            `Live reality: ${k.live.readiness || 'readiness unset'}${k.live.regions.length ? `, routing ${k.live.regions.join(', ')}` : ''}${k.live.performancesPerYear ? `, ${k.live.performancesPerYear} shows a year` : ''}.`,
            k.presence.hasFingerprint
              ? `Official presence is at ${k.presence.coverage}% coverage — consolidate before adding new channels (next: ${k.presence.nextStep || 'verify existing accounts'}).`
              : 'No official footprint exists — sequence the first release before any partnership conversation.',
          ],
        };
      case 'ar':
        return {
          directive: `Evaluate songs against the signature sound (${k.sonic.signatureSound || 'undefined'}), the stated intent (${k.audience.intent || 'unstated'}), and ${audience}. Recommend development only when it strengthens the artist’s point of view.`,
          tips: [
            `Reject anything that trades away “${k.sonic.nonNegotiables || 'the sonic non-negotiable'}”.`,
            `Judge hooks by whether the first ten seconds deliver: ${k.audience.recognitionCue || 'an undefined cue'}.`,
            `Position releases for ${k.audience.marketPosition || 'an undefined market position'}.`,
            k.presence.catalogAverageCompleteness < 60
              ? `Catalogue claims are thin (${k.presence.catalogAverageCompleteness}% documented) — judge the song, not a record that cannot be evidenced.`
              : 'Use the documented release history when comparing a new work against the artist’s own catalogue.',
          ],
        };
      case 'promotion':
        return {
          directive: `Build campaign angles from the artist’s own story and language: ${k.identity.origin || 'origin not captured'}. Lead with ${k.audience.recognitionCue ? `the recognition cue “${k.audience.recognitionCue}”` : 'a concrete recognizable moment'} and speak to ${audience} — never generic genre claims.`,
          tips: [
            k.audience.contentStrategy
              ? `Match assets to the stated content strategy: ${k.audience.contentStrategy}.`
              : 'Ask how the artist wants to be seen week to week before planning content.',
            k.audience.visualAesthetic.length
              ? `Keep visuals inside: ${k.audience.visualAesthetic.join(', ')}.`
              : 'Capture the visual aesthetic before producing campaign art.',
            'Pitch the story only in the artist’s own words; no invented accolades.',
            k.presence.hasForArtists
              ? 'Pitch through the claimed For Artists dashboards, and only cite data those dashboards actually show.'
              : 'Without a claimed For Artists dashboard there is no editorial pitch route — claim it first, then pitch.',
          ],
        };
      case 'marketing':
        return {
          directive: `Convert only through the artist’s real routes: ${k.business.streams.join(', ') || 'define income streams first'}. Match every asset to ${audience} and validate a repeatable recognition cue before spending on reach.`,
          tips: [
            k.business.goals.length
              ? `Tie spend to goals: ${k.business.goals.join(', ')}.`
              : 'Set one commercial goal before any paid push.',
            `Test messaging with ${k.craft.lyricalThemes.join(', ') || 'the artist’s actual themes'} rather than broad genre keywords.`,
            `Report against ${k.business.successMetric || 'one agreed metric'} — not vanity reach.`,
            `Reuse the artist’s own press assets (${k.operations.pressAssets || 0} stored) instead of inventing coverage.`,
            k.presence.hasAnalytics
              ? 'Analytics sources are connected — quote their real numbers and label the date range.'
              : 'No analytics source is connected — ask for real figures rather than estimating performance.',
          ],
        };
      case 'legal':
        return {
          directive: `Draft and review agreements around this artist’s real relationships: collaborators on ${k.craft.lyricalThemes.join(', ') || 'songwriting'}, revenue from ${k.business.streams.join(', ') || 'undefined streams'}, and the boundary “${k.sonic.nonNegotiables || k.identity.tension || 'not yet captured'}” that must be protected contractually.`,
          tips: [
            k.legal.splitSheet && k.legal.splitSheet !== 'Never'
              ? `Split sheet practice on file: ${k.legal.splitSheet} — keep it ahead of every release.`
              : 'Split sheets before release, not after interest arrives.',
            k.legal.registeredWorks
              ? 'Works are registered — keep new releases on the same registration cadence.'
              : 'Register the works before a dispute can define ownership.',
            k.legal.proAffiliation && k.legal.proAffiliation !== 'None'
              ? `PRO affiliation: ${k.legal.proAffiliation}${k.legal.proIdentity ? ` (${k.legal.proIdentity})` : ''} — confirm IPI details match every registration.`
              : 'Affiliate with a PRO so performance royalties are actually collected.',
            k.legal.incorporated
              ? 'Business entity exists — keep masters, contracts, and payouts flowing through it.'
              : 'Consider a business entity before revenue grows, so liability stays off the individual.',
            ...(k.presence.hasFingerprint && k.presence.verified.length === 0
              ? [
                  'No account is verified yet — unverified profiles cannot prove control if a dispute arises over the artist’s own name.',
                ]
              : []),
            k.sync.oneStopClearance
              ? 'One-stop clearance is in place — make it explicit in every sync pitch.'
              : 'Sync buyers need one-stop clearance; resolve sample and feature splits in writing first.',
            'Keep masters and publishing ownership explicit in every session and producer agreement.',
            'Flag sample, feature, and sync usage in writing before delivery.',
            'Legal output is drafting guidance only — confirm jurisdiction-specific terms with a licensed attorney.',
          ],
        };
      case 'brand':
        return {
          directive: `Maintain one coherent signal: ${k.audience.visualAesthetic.join(', ') || 'visual language not captured'} for ${k.genre}, delivered in the artist’s own voice using ${k.audience.brandVoices.join(', ') || 'their stated brand voices'}.`,
          tips: [
            `Keep the tension visible: ${k.identity.tension || 'define the artist’s contradiction'}.`,
            'Repeat the same recognition cue across art, intros, and copy.',
            'Remove any asset that could belong to any other artist in the genre.',
          ],
        };
    }
  }

  /**
   * Compiles the artist's position on the official pathway, so every role steers
   * toward the same ordered next move instead of inventing its own priorities.
   */
  private compilePathway(p: any): ArtistProfileKnowledge['pathway'] {
    const readout = this.pathwayService.readout(p as UserProfile);
    const next = readout.nextAction;
    const label = (areas: typeof readout.unofficialAreas): string[] =>
      areas.map((area) => AREA_LABEL[area]);

    return {
      stage: readout.stage,
      overall: readout.overall,
      officialAreas: label(readout.officialAreas),
      unofficialAreas: label(readout.unofficialAreas),
      nextStep: next?.step.title || '',
      nextStepWhy: next?.step.why || '',
      nextStepAction: next?.nextMove || '',
      nextStepEvidence: next?.step.evidence || '',
      nextStepDestination:
        this.pathwayService.destination(next?.step.destinationId)?.label || '',
      parallel: readout.parallelActions.map((entry) => entry.step.title),
    };
  }

  /**
   * Compiles the artist's online footprint and release-record integrity into
   * knowledge, so role advice matches the artist's actual stage.
   */
  private compilePresence(
    p: any,
    knowledge: ArtistProfileKnowledge
  ): ArtistProfileKnowledge['presence'] {
    const readout = this.fingerprint.readout(p as UserProfile);
    const history = this.fingerprint.history(p as UserProfile);
    const labels = (ids: string[]): string[] =>
      ids.map((id) => this.fingerprint.destination(id)?.label || id);

    const declared = readout.linked
      .filter((entry) => Boolean(entry.destination))
      .map((entry) => entry.link);
    const byCategory = (category: string) =>
      declared.some((link: any) =>
        readout.linked.some(
          (entry) => entry.link === link && entry.destination?.category === category
        )
      );

    // Verified evidence only, so S.M.U.V.E. cannot overstate the artist's reach.
    const verified = declared
      .filter((link: any) => link?.verified)
      .map((link: any) => this.fingerprint.destination(String(link.destinationId))?.label || link.label);
    const unverified = declared
      .filter((link: any) => !link?.verified)
      .map((link: any) => this.fingerprint.destination(String(link.destinationId))?.label || link.label);

    return {
      track: readout.track,
      hasFingerprint: readout.hasFingerprint,
      coverage: readout.overall,
      verified: verified.filter(Boolean),
      unverified: unverified.filter(Boolean),
      missingCategories: labels(
        readout.coverage.filter((entry) => entry.present === 0).map((entry) => entry.category)
      ),
      hasForArtists: byCategory('for-artists'),
      hasPro:
        byCategory('pro') ||
        (Boolean(knowledge.legal.proAffiliation) &&
          knowledge.legal.proAffiliation !== 'None'),
      hasAnalytics: byCategory('analytics'),
      hasDelivery: byCategory('delivery'),
      catalogAverageCompleteness: history.averageCompleteness,
      undatedWorks: history.undated,
      historyIssues: history.timelineIssues,
      nextStep: this.fingerprint.plan(p as UserProfile)[0]?.title || '',
    };
  }

  private compile(profile: UserProfile | null | undefined): ArtistProfileKnowledge {
    const p: any = profile || {};
    const journey: any = p.musicalJourney || {};
    const blueprint: any = journey.musicBlueprint || {};
    const list = (value: any): string[] =>
      Array.isArray(value)
        ? value.filter((v) => v !== null && v !== undefined && v !== '')
        : [];
    const str = (value: any): string =>
      typeof value === 'string' && value.trim() ? value.trim() : '';

    const knowledge: ArtistProfileKnowledge = {
      state: 'foundational',
      completeness: 0,
      genre: str(p.primaryGenre) || 'unspecified genre',
      roles: list(p.expertise?.roles ?? journey.roles),
      identity: {
        name: str(p.artistName),
        meaning: str(journey.artistNameMeaning),
        origin: str(journey.originStory),
        breakthrough: str(journey.breakthroughMoment ?? journey.firstSong),
        tension: str(blueprint.signatureTension),
        livedWorld: str(blueprint.livedWorldDetails),
      },
      sonic: {
        signatureSound: str(journey.signatureSound),
        subgenres: list(journey.subgenres),
        influences: list(journey.musicalInfluences),
        delivery: str(blueprint.vocalDelivery),
        groove: str(blueprint.rhythmicFeel),
        harmony: str(blueprint.harmonicLanguage),
        arrangement: str(blueprint.arrangementApproach),
        nonNegotiables: str(blueprint.sonicNonNegotiables),
        tempoZone: str(journey.preferredBpmRange)
          ? `${str(journey.preferredBpmRange)} BPM`
          : '',
      },
      craft: {
        productionPhilosophy: str(journey.productionPhilosophy),
        songwritingProcess: str(journey.songwritingProcess),
        recordingPriorities: list(blueprint.recordingPriorities),
        mixingPriorities: list(blueprint.mixingPriorities),
        gear: list(journey.signatureGear),
        lyricalThemes: list(blueprint.lyricalThemes),
      },
      audience: {
        profile: str(blueprint.audienceProfile),
        intent: str(blueprint.artisticIntent),
        recognitionCue: str(blueprint.recognitionCue),
        brandVoices: list(p.brandVoices),
        visualAesthetic: list(journey.visualAesthetic),
        contentStrategy: str(journey.contentStrategy),
        marketPosition: str(journey.marketPosition),
      },
      business: {
        goals: list(p.strategicGoals),
        focus: str(journey.currentFocus),
        successMetric: str(journey.primarySuccessMetric),
        velocity: str(journey.releaseVelocity),
        streams: list(journey.incomeStreams),
        challenge: str(journey.biggestChallenge),
        collaborations: list(journey.collaborationGoals),
      },
      live: {
        readiness: '',
        regions: [],
        travel: '',
        hasBackline: false,
        performancesPerYear: '',
      },
      sync: {
        readiness: '',
        hasCleanVersions: false,
        hasInstrumentals: false,
        hasStems: false,
        oneStopClearance: false,
        catalogSize: 0,
        keywords: [],
      },
      legal: {
        registeredWorks: false,
        proAffiliation: '',
        proIdentity: '',
        splitSheet: '',
        incorporated: false,
        trademark: '',
      },
      operations: {
        roster: [],
        catalogSize: 0,
        equipment: [],
        daw: [],
        services: [],
        skills: [],
        expertise: [],
        pressAssets: 0,
      },
      presence: {
        track: 'emerging',
        hasFingerprint: false,
        coverage: 0,
        verified: [],
        unverified: [],
        missingCategories: [],
        hasForArtists: false,
        hasPro: false,
        hasAnalytics: false,
        hasDelivery: false,
        catalogAverageCompleteness: 0,
        undatedWorks: 0,
        historyIssues: [],
        nextStep: '',
      },
      pathway: {
        stage: 'getting-started',
        overall: 0,
        officialAreas: [],
        unofficialAreas: [],
        nextStep: '',
        nextStepWhy: '',
        nextStepAction: '',
        nextStepEvidence: '',
        nextStepDestination: '',
        parallel: [],
      },
      differentiators: [],
      missing: [],
    };

    knowledge.pathway = this.compilePathway(p as UserProfile);

    knowledge.differentiators = [
      knowledge.sonic.signatureSound,
      knowledge.identity.tension,
      knowledge.identity.livedWorld,
      knowledge.sonic.nonNegotiables,
      knowledge.audience.recognitionCue,
      knowledge.audience.intent,
    ].filter(Boolean);

    const expertise = Object.entries(p.expertise || {})
      .filter(([, value]) => typeof value === 'number' && (value as number) > 0)
      .map(([key]) => key);

    knowledge.live = {
      readiness: str(p.touringDetails?.isTourReady),
      regions: list(p.touringDetails?.regions),
      travel: str(p.touringDetails?.travelPreference),
      hasBackline: p.touringDetails?.hasBackline === 'Yes',
      performancesPerYear: str(p.performancesPerYear),
    };
    knowledge.sync = {
      readiness: str(p.syncDetails?.isSyncReady),
      hasCleanVersions: p.syncDetails?.hasCleanVersions === true,
      hasInstrumentals: p.syncDetails?.hasInstrumentals === true,
      hasStems: Boolean(str(p.syncDetails?.hasStems)) && p.syncDetails?.hasStems !== 'No',
      oneStopClearance: p.syncDetails?.oneStopClearance === true,
      catalogSize: typeof p.syncDetails?.catalogSize === 'number' ? p.syncDetails.catalogSize : 0,
      keywords: list(p.syncDetails?.preferredKeywords),
    };
    knowledge.legal = {
      registeredWorks: p.legalInfrastructure?.hasRegisteredWorks === true,
      proAffiliation: str(p.legalInfrastructure?.proAffiliation),
      proIdentity: [str(p.proName), str(p.proIpi)].filter(Boolean).join(' / '),
      splitSheet: str(p.legalInfrastructure?.hasStandardSplitSheet),
      incorporated: p.legalInfrastructure?.isIncorporated === true,
      trademark: str(p.legalInfrastructure?.trademarkStatus),
    };
    knowledge.operations = {
      roster: (Array.isArray(p.team) ? p.team : [])
        .map((member: any) => [str(member?.name), str(member?.role)].filter(Boolean).join(' — '))
        .filter(Boolean),
      catalogSize: list(p.catalog).length,
      equipment: list(p.equipment),
      daw: list(p.daw),
      services: list(p.services),
      skills: list(p.skills),
      expertise,
      pressAssets: list(p.pressGallery).length,
    };

    knowledge.presence = this.compilePresence(p, knowledge);

    const checks: Array<[string, boolean]> = [
      ['artist identity and journey', Boolean(knowledge.identity.name && knowledge.identity.origin)],
      ['musical subgenre and influences', knowledge.sonic.subgenres.length > 0 || knowledge.sonic.influences.length > 0],
      ['signature sound', Boolean(knowledge.sonic.signatureSound)],
      ['vocal or instrument delivery', Boolean(knowledge.sonic.delivery)],
      ['rhythmic feel and tempo zone', Boolean(knowledge.sonic.groove || knowledge.sonic.tempoZone)],
      ['harmonic language', Boolean(knowledge.sonic.harmony)],
      ['arrangement approach', Boolean(knowledge.sonic.arrangement)],
      ['signature tension', Boolean(knowledge.identity.tension)],
      ['lived-world details', Boolean(knowledge.identity.livedWorld)],
      ['sonic non-negotiables', Boolean(knowledge.sonic.nonNegotiables)],
      ['production philosophy', Boolean(knowledge.craft.productionPhilosophy)],
      ['songwriting process', Boolean(knowledge.craft.songwritingProcess)],
      ['recording and mixing priorities', knowledge.craft.recordingPriorities.length > 0 || knowledge.craft.mixingPriorities.length > 0],
      ['lyrical themes', knowledge.craft.lyricalThemes.length > 0],
      ['audience profile', Boolean(knowledge.audience.profile)],
      ['artistic intent', Boolean(knowledge.audience.intent)],
      ['recognition cue', Boolean(knowledge.audience.recognitionCue)],
      ['visual and brand language', knowledge.audience.visualAesthetic.length > 0 || knowledge.audience.brandVoices.length > 0],
      ['content strategy', Boolean(knowledge.audience.contentStrategy)],
      ['current focus and success metric', Boolean(knowledge.business.focus || knowledge.business.successMetric)],
      ['release velocity', Boolean(knowledge.business.velocity)],
      ['income streams', knowledge.business.streams.length > 0],
      ['studio equipment and DAW', knowledge.operations.equipment.length > 0 && knowledge.operations.daw.length > 0],
      ['operator skills and expertise', knowledge.operations.skills.length > 0 || knowledge.operations.expertise.length > 0],
      ['catalogue assets', knowledge.operations.catalogSize > 0],
      ['professional roster', knowledge.operations.roster.length > 0],
      ['press and media assets', knowledge.operations.pressAssets > 0],
      ['sync readiness', knowledge.sync.readiness !== '' && knowledge.sync.readiness !== 'Not Started'],
      ['sync clearance and stems', knowledge.sync.oneStopClearance && knowledge.sync.hasStems],
      ['works registration and PRO', knowledge.legal.registeredWorks || knowledge.legal.proAffiliation !== 'None' || Boolean(knowledge.legal.proIdentity)],
      ['split sheet practice', Boolean(knowledge.legal.splitSheet) && knowledge.legal.splitSheet !== 'Never'],
      ['business entity and trademark', knowledge.legal.incorporated || (Boolean(knowledge.legal.trademark) && knowledge.legal.trademark !== 'None')],
      ['live readiness and routing', knowledge.live.regions.length > 0 || (Boolean(knowledge.live.readiness) && knowledge.live.readiness !== 'Studio Only')],
      [
        'official artist profiles (For Artists, PRO, analytics)',
        knowledge.presence.hasForArtists || knowledge.presence.hasPro,
      ],
      ['release record documentation', knowledge.presence.catalogAverageCompleteness >= 60],
    ];

    const present = checks.filter(([, ok]) => ok).length;
    knowledge.completeness = Math.round((present / checks.length) * 100);
    knowledge.missing = checks.filter(([, ok]) => !ok).map(([label]) => label);
    knowledge.state =
      knowledge.missing.length === 0
        ? 'calibrated'
        : knowledge.completeness >= 60
          ? 'partial'
          : 'foundational';

    return knowledge;
  }
}
