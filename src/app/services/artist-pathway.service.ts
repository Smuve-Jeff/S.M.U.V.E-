import { Injectable, inject } from '@angular/core';
import { UserProfile } from './user-profile.service';
import { ArtistOnlineFingerprintService } from './artist-online-fingerprint.service';

/**
 * Every area an independent artist has to become official in. "Official" is not
 * a single event (a release, a deal, a blue check) — it is eight separate areas,
 * each of which can be official or not on its own.
 */
export type PathwayArea =
  | 'identity'
  | 'craft'
  | 'release'
  | 'rights'
  | 'presence'
  | 'business'
  | 'money'
  | 'audience';

/** How much of the artist's time a step realistically takes. */
export type PathwayEffort = 'one sitting' | 'days' | 'weeks';

/** What the step costs in money. Most of the pathway is free on purpose. */
export type PathwayCost = 'free' | 'low' | 'paid';

/**
 * The surface that owns a step's evidence. Every step must name one that really
 * has a control for it, otherwise the CTA sends the artist somewhere the field
 * cannot be edited.
 */
export type PathwayRecordSurface = 'profile' | 'questionnaire' | 'hub';

export interface PathwayStep {
  id: string;
  area: PathwayArea;
  /** Order inside the area. */
  order: number;
  title: string;
  /** What is true about the artist once this step is done. */
  outcome: string;
  why: string;
  /** Concrete actions, written for someone who has never done this. */
  actions: string[];
  /** What S.M.U.V.E. checks to confirm the step is genuinely done. */
  evidence: string;
  /** Real sign-up/dashboard page, from the online-fingerprint registry. */
  destinationId?: string;
  /**
   * Which surface actually owns the evidence for this step. The Artist DNA
   * questionnaire writes most of the artistic-decision fields, the Artist
   * Development Hub owns the registrations and the financial record, and the
   * profile builder has no control for either — so sending an artist to the
   * builder would leave them hunting for a field that does not exist.
   * Defaults to `profile`.
   */
  recordedWith?: PathwayRecordSurface;
  effort: PathwayEffort;
  cost: PathwayCost;
  /** Step ids that must be complete first. */
  requires: string[];
}

export type PathwayStepStatus = 'complete' | 'in-progress' | 'ready' | 'blocked';

export interface PathwayStepProgress {
  step: PathwayStep;
  status: PathwayStepStatus;
  /** Human labels of the evidence still missing for this step. */
  needs: string[];
  /** Titles of the steps holding this one up. */
  blockedBy: string[];
  /** The first action to take, or an empty string when complete. */
  nextMove: string;
}

export interface PathwayAreaStanding {
  area: PathwayArea;
  label: string;
  /** One line explaining what official means in this area. */
  means: string;
  standing: 'unofficial' | 'in-progress' | 'official';
  completed: number;
  total: number;
  score: number;
  /** The area's outstanding work, in order. */
  outstanding: string[];
}

export interface PathwayReadout {
  steps: PathwayStepProgress[];
  areas: PathwayAreaStanding[];
  /** 0-100 across every step. */
  overall: number;
  completedSteps: number;
  totalSteps: number;
  officialAreas: PathwayArea[];
  unofficialAreas: PathwayArea[];
  stage: 'getting-started' | 'building' | 'consolidating' | 'official';
  /** Exactly one recommended next move, so the pathway never overwhelms. */
  nextAction: PathwayStepProgress | null;
  /** Independent ready steps, for an artist with spare capacity. */
  parallelActions: PathwayStepProgress[];
  /** Steps that are blocked or in progress right now. */
  openSteps: number;
}

export const AREA_LABEL: Record<PathwayArea, string> = {
  identity: 'Identity',
  craft: 'Craft',
  release: 'Release',
  rights: 'Rights & Ownership',
  presence: 'Official Presence',
  business: 'Business',
  money: 'Money & Royalties',
  audience: 'Audience & Live',
};

/** One line per area describing what being official in it actually means. */
export const AREA_MEANS: Record<PathwayArea, string> = {
  identity: 'One name, one story, one signature that people can find and repeat.',
  craft: 'A working chain and a repeatable way of finishing a record.',
  release: 'Finished work that is delivered, dated, and documented, not just recorded.',
  rights: 'Ownership registered in writing before money exists to argue about.',
  presence: 'Claimed, verified artist profiles on every platform the music is live on.',
  business: 'A structure that can hold contracts, payouts, and liability.',
  money: 'Income routed into accounts the artist controls, with royalties actually collected.',
  audience: 'A defined listener, a channel the artist owns, and a place to perform.',
};

export const AREA_ORDER: PathwayArea[] = [
  'identity',
  'craft',
  'release',
  'rights',
  'presence',
  'business',
  'money',
  'audience',
];

/** Everything a step needs to decide its own status, computed once. */
interface Evidence {
  p: any;
  journey: any;
  blueprint: any;
  catalog: any[];
  links: any[];
  list: (value: any) => string[];
  str: (value: any) => string;
  /** Fingerprint registry facts. */
  hasDeliveryLink: boolean;
  hasProLink: boolean;
  hasAnalyticsLink: boolean;
  hasForArtistsLink: boolean;
  verifiedForArtistsLink: boolean;
  verifiedLinkCount: number;
  unrecognisedLinkCount: number;
  /** Release-record facts. */
  documentedReleaseCount: number;
  deliveredReleaseCount: number;
  /** PRO / legal facts. */
  proAffiliation: string;
  proIdentity: string;
  registeredWorks: boolean;
  standardSplitSheet: string;
  incorporated: boolean;
  trademarkStatus: string;
  /** Money facts. */
  accounts: number;
  monthlyBudget: number;
  revenueHistory: number;
  /** Live facts. */
  showsPerYear: number;
  /** Roster and press facts. */
  roster: number;
  pressAssets: number;
}

const check = (
  done: boolean,
  partial: boolean,
  needs: string[]
): { done: boolean; partial: boolean; needs: string[] } => ({ done, partial, needs });

/**
 * The pathway. Ordered so that each step is only reachable once the steps it
 * genuinely depends on are done — a beginner should never be told to verify a
 * dashboard for a release that does not exist.
 */
const STEPS: Array<
  PathwayStep & {
    evaluate: (e: Evidence) => { done: boolean; partial: boolean; needs: string[] };
  }
> = [
  // ── Identity ────────────────────────────────────────────────────────────
  {
    id: 'identity-name',
    area: 'identity',
    order: 1,
    title: 'Lock the official artist name',
    outcome: 'The artist has one fixed name to release, register, and promote under.',
    why: 'Every later step — PRO registration, distribution, trademarks — is filed against this name. Changing it after a release means re-registering everything.',
    actions: [
      'Write down the name exactly as it should appear on a platform.',
      'Search the name on Spotify, Apple Music, Bandcamp, and a PRO repertoire search.',
      'If it is taken, adjust the spelling now rather than after a release.',
    ],
    evidence: 'A saved artist name on the profile.',
    effort: 'one sitting',
    cost: 'free',
    requires: [],
    evaluate: (e) =>
      check(Boolean(e.str(e.p.artistName)), false, [
        'Save the artist name on the profile.',
      ]),
  },
  {
    id: 'identity-story',
    area: 'identity',
    order: 2,
    title: 'Write the story only this artist can tell',
    outcome: 'A short origin story and name meaning that press, pitch, and fans can repeat.',
    why: 'Promotion copies whatever story exists. With no story, the pitch becomes a genre label that describes a thousand other artists.',
    actions: [
      'Write why the name was chosen and what it means.',
      'Write the origin: where the music started and what it cost.',
      'Keep every sentence specific — places, people, objects, not adjectives.',
    ],
    evidence: 'An origin story and a name meaning recorded on the musical journey.',
    recordedWith: 'questionnaire',
    effort: 'one sitting',
    cost: 'free',
    requires: ['identity-name'],
    evaluate: (e) =>
      check(
        Boolean(e.str(e.journey.originStory) && e.str(e.journey.artistNameMeaning)),
        Boolean(e.str(e.journey.originStory) || e.str(e.journey.artistNameMeaning)),
        [
          ...(e.str(e.journey.originStory) ? [] : ['an origin story']),
          ...(e.str(e.journey.artistNameMeaning) ? [] : ['what the artist name means']),
        ]
      ),
  },
  {
    id: 'identity-signature',
    area: 'identity',
    order: 3,
    title: 'Define the signature people will recognise',
    outcome: 'A stated signature sound, tension, non-negotiables, and a first-ten-seconds cue.',
    why: 'A signature is what makes the catalogue recognisable across releases. Without it every release restarts the audience from zero.',
    actions: [
      'Name the sound in plain words, not genre words.',
      'Name the contradiction the artist writes from.',
      'Decide what must never change, even when a trend says otherwise.',
      'Pick the cue that should land in the first ten seconds.',
    ],
    evidence: 'Signature sound, signature tension, sonic non-negotiables, and a recognition cue.',
    recordedWith: 'questionnaire',
    effort: 'one sitting',
    cost: 'free',
    requires: ['identity-name'],
    evaluate: (e) =>
      check(
        Boolean(
          e.str(e.journey.signatureSound) &&
            e.str(e.blueprint.signatureTension) &&
            e.str(e.blueprint.sonicNonNegotiables) &&
            e.str(e.blueprint.recognitionCue)
        ),
        Boolean(e.str(e.journey.signatureSound) || e.str(e.blueprint.signatureTension)),
        [
          ...(e.str(e.journey.signatureSound) ? [] : ['a signature sound']),
          ...(e.str(e.blueprint.signatureTension) ? [] : ['the signature tension']),
          ...(e.str(e.blueprint.sonicNonNegotiables) ? [] : ['sonic non-negotiables']),
          ...(e.str(e.blueprint.recognitionCue) ? [] : ['a recognition cue']),
        ]
      ),
  },

  // ── Craft ───────────────────────────────────────────────────────────────
  {
    id: 'craft-tools',
    area: 'craft',
    order: 1,
    title: 'Get a chain that can finish a record',
    outcome: 'A named DAW plus at least one way to capture sound.',
    why: 'Nothing downstream can start without a way to record and export. A phone and a free DAW is a complete answer at this stage.',
    actions: [
      'Install one DAW and commit to it — switching costs months.',
      'Add a microphone or interface, or confirm the phone/built-in path is enough.',
      'Proof it works by recording ten seconds and exporting a file.',
    ],
    evidence: 'A DAW plus equipment or capture skills recorded on the profile.',
    effort: 'days',
    cost: 'free',
    requires: [],
    evaluate: (e) =>
      check(
        e.list(e.p.daw).length > 0 &&
          (e.list(e.p.equipment).length > 0 || e.list(e.p.skills).length > 0),
        e.list(e.p.daw).length > 0,
        [
          ...(e.list(e.p.daw).length ? [] : ['the DAW being used']),
          ...(e.list(e.p.equipment).length || e.list(e.p.skills).length
            ? []
            : ['the microphone, interface, or capture skills']),
        ]
      ),
  },
  {
    id: 'craft-skills',
    area: 'craft',
    order: 2,
    title: 'Name the skills and the gaps',
    outcome: 'Honest skill levels across production, writing, performance, marketing, business, and legal.',
    why: 'The gaps decide what to learn and what to hire. Unmeasured skills get overestimated at exactly the wrong moment.',
    actions: [
      'Rate each area honestly on the profile.',
      'Pick the one skill that blocks the next release.',
      'Decide whether to learn it or pay for it.',
    ],
    evidence: 'At least one expertise area rated above zero.',
    effort: 'one sitting',
    cost: 'free',
    requires: ['craft-tools'],
    evaluate: (e) => {
      const rated = Object.values(e.p.expertise || {}).filter(
        (value) => typeof value === 'number' && (value as number) > 0
      );
      return check(rated.length >= 3, rated.length > 0, [
        'Rate at least three skill areas so S.M.U.V.E. can target the gaps.',
      ]);
    },
  },
  {
    id: 'craft-philosophy',
    area: 'craft',
    order: 3,
    title: 'Decide how this artist records and mixes',
    outcome: 'Stated recording priorities, mixing priorities, and a production philosophy.',
    why: 'A stated approach stops every session from re-deciding the sound, and keeps the catalogue coherent across engineers and time.',
    actions: [
      'Write what must be protected on every recording.',
      'Write what the mix must do for the vocal and the low end.',
      'Write the one sentence that settles arguments in the room.',
    ],
    evidence: 'A production philosophy plus recording or mixing priorities.',
    recordedWith: 'questionnaire',
    effort: 'one sitting',
    cost: 'free',
    requires: ['craft-tools'],
    evaluate: (e) =>
      check(
        Boolean(
          e.str(e.journey.productionPhilosophy) &&
            (e.list(e.blueprint.recordingPriorities).length > 0 ||
              e.list(e.blueprint.mixingPriorities).length > 0)
        ),
        Boolean(e.str(e.journey.productionPhilosophy)),
        [
          ...(e.str(e.journey.productionPhilosophy)
            ? []
            : ['a production philosophy']),
          ...(e.list(e.blueprint.recordingPriorities).length ||
          e.list(e.blueprint.mixingPriorities).length
            ? []
            : ['recording or mixing priorities']),
        ]
      ),
  },

  // ── Release ─────────────────────────────────────────────────────────────
  {
    id: 'release-first-work',
    area: 'release',
    order: 1,
    title: 'Finish one work end to end',
    outcome: 'One finished work in the catalogue. This is the step that makes the artist real.',
    why: 'Every other area — rights, presence, money, live — is unreachable without a finished work. Finishing is a different skill from starting, and it is the one that counts.',
    actions: [
      'Pick one song and declare the others later.',
      'Set a finish date and work backwards from it.',
      'Export a final master at the highest quality available.',
      'Add it to the catalogue with its real title.',
    ],
    evidence: 'At least one catalogue item with a title.',
    effort: 'weeks',
    cost: 'free',
    requires: ['identity-name', 'craft-tools'],
    evaluate: (e) =>
      check(e.catalog.length > 0, false, [
        'Finish and catalogue one work. Nothing else in the pathway unlocks first.',
      ]),
  },
  {
    id: 'release-metadata',
    area: 'release',
    order: 2,
    title: 'Document the work properly',
    outcome: 'The work has a type, credits, and an ownership reference before it goes anywhere.',
    why: 'Undocumented releases cannot be registered, pitched, licensed, or defended. This is the step beginners skip and later pay for.',
    actions: [
      'Set the release type (single, EP, album).',
      'Write the credits exactly as they should appear.',
      'Agree splits in writing and store the split sheet reference.',
    ],
    evidence: 'Release type, credits, and a split sheet reference on the work.',
    effort: 'one sitting',
    cost: 'free',
    requires: ['release-first-work'],
    evaluate: (e) => {
      const item = e.catalog[0] || {};
      return check(
        Boolean(item.releaseType && item.credits && item.splitSheetRef),
        Boolean(item.releaseType || item.credits),
        [
          ...(item.releaseType ? [] : ['the release type']),
          ...(item.credits ? [] : ['the credits']),
          ...(item.splitSheetRef ? [] : ['a split sheet reference']),
        ]
      );
    },
  },
  {
    id: 'release-delivery',
    area: 'release',
    order: 3,
    title: 'Deliver the work through a distributor',
    outcome: 'A release date, a distributor, and the platforms the work is live on.',
    why: 'Delivery is what turns a file into a release with an ISRC, a store presence, and a date that analytics can be measured against.',
    actions: [
      'Choose a distributor and set up the account.',
      'Assign artwork, metadata, and a release date at least three weeks out.',
      'Deliver, then record the distributor, date, and platforms on the work.',
    ],
    evidence: 'A distributor, a release date, and platform placements on at least one work.',
    // A free-tier distributor, so the step is reachable with no budget.
    destinationId: 'amuse',
    effort: 'days',
    cost: 'free',
    requires: ['release-metadata'],
    evaluate: (e) => {
      const item = e.catalog[0] || {};
      return check(
        Boolean(
          item.distributor &&
            item.releaseDate &&
            Array.isArray(item.platforms) &&
            item.platforms.length > 0
        ),
        Boolean(item.distributor || item.releaseDate),
        [
          ...(item.distributor ? [] : ['the distributor used']),
          ...(item.releaseDate ? [] : ['the release date']),
          ...(Array.isArray(item.platforms) && item.platforms.length
            ? []
            : ['the platforms the work is live on']),
        ]
      );
    },
  },

  // ── Rights & Ownership ──────────────────────────────────────────────────
  {
    id: 'rights-splits',
    area: 'rights',
    order: 1,
    title: 'Agree splits before money appears',
    outcome: 'A standing split-sheet practice and a recorded ownership reference on the work.',
    why: 'Splits are cheap to agree while nobody is being paid and expensive to agree once a song starts earning. This is the single most common avoidable dispute.',
    actions: [
      'Write a one-page split sheet and reuse it for every session.',
      'Get every contributor to sign before the files leave the room.',
      'Store the reference against the work in the catalogue.',
    ],
    evidence: 'A standing split-sheet practice plus an ownership reference on a work.',
    effort: 'days',
    cost: 'free',
    requires: ['release-first-work'],
    evaluate: (e) =>
      check(
        e.standardSplitSheet !== '' &&
          e.standardSplitSheet !== 'Never' &&
          e.documentedReleaseCount > 0,
        Boolean(e.standardSplitSheet && e.standardSplitSheet !== 'Never'),
        [
          ...(e.standardSplitSheet && e.standardSplitSheet !== 'Never'
            ? []
            : ['a standing split-sheet practice']),
          ...(e.documentedReleaseCount > 0
            ? []
            : ['a split sheet reference on at least one work']),
        ]
      ),
  },
  {
    id: 'rights-pro',
    area: 'rights',
    order: 2,
    title: 'Join a rights organisation and get an IPI',
    outcome: 'A PRO affiliation with an IPI/CAE number in S.M.U.V.E.',
    why: 'Performance royalties are collected through a PRO, not through a store or distributor. Signing up is usually free and does not require a catalogue.',
    actions: [
      'Pick the PRO for the artist’s territory and register as a writer.',
      'Save the membership and IPI/CAE numbers on the profile.',
      'Check any existing release is credited to the same name.',
    ],
    evidence: 'A PRO affiliation other than "None" plus a recorded IPI or member number.',
    destinationId: 'ascap',
    effort: 'days',
    cost: 'free',
    requires: ['identity-name'],
    evaluate: (e) =>
      check(
        e.proAffiliation !== '' && e.proAffiliation !== 'None' && e.proIdentity !== '',
        e.proAffiliation !== '' && e.proAffiliation !== 'None',
        [
          ...(e.proAffiliation && e.proAffiliation !== 'None'
            ? []
            : ['the PRO the artist is joining']),
          ...(e.proIdentity ? [] : ['the IPI/CAE or member number']),
        ]
      ),
  },
  {
    id: 'rights-works',
    area: 'rights',
    order: 3,
    title: 'Register the works with the PRO',
    outcome: 'Works registered against the PRO membership with an ISRC or ISWC on record.',
    why: 'An unregistered work earns nothing even when it is played, because the PRO has no way to attribute the performance.',
    actions: [
      'Register every released work title with the PRO.',
      'Match each registration to the artist’s IPI and the split sheet.',
      'Store the ISRC/ISWC against the work in the catalogue.',
    ],
    evidence: 'Registered works flag plus an ISRC or UPC on a catalogue item.',
    effort: 'days',
    cost: 'free',
    requires: ['rights-pro', 'release-first-work'],
    evaluate: (e) =>
      check(
        e.registeredWorks && e.catalog.some((item) => item.isrc || item.upc),
        Boolean(e.registeredWorks),
        [
          ...(e.registeredWorks ? [] : ['registering the works with the PRO']),
          ...(e.catalog.some((item) => item.isrc || item.upc)
            ? []
            : ['an ISRC or UPC recorded on a work']),
        ]
      ),
  },

  // ── Official Presence ───────────────────────────────────────────────────
  {
    id: 'presence-distributor',
    area: 'presence',
    order: 1,
    title: 'Open the distributor dashboard',
    outcome: 'A recorded delivery account that the artist or their team can log into.',
    why: 'The distributor dashboard is where metadata is corrected, releases are scheduled, and splits to collaborators are paid out. It is the artist’s only control point over the stores.',
    actions: [
      'Claim the reporting dashboard for the distributor used.',
      'Save the link and mark it verified on the profile.',
    ],
    evidence: 'A verified delivery destination link on the official fingerprint.',
    destinationId: 'distrokid',
    effort: 'one sitting',
    cost: 'free',
    requires: ['release-delivery'],
    evaluate: (e) =>
      check(e.hasDeliveryLink, false, [
        'Record the distributor dashboard link and confirm it is the artist’s own.',
      ]),
  },
  {
    id: 'presence-for-artists',
    area: 'presence',
    order: 2,
    title: 'Claim and verify the For Artists dashboards',
    outcome: 'A verified Spotify for Artists (or equivalent) profile controlling artwork, bio, and pitching.',
    why: 'The dashboard is the only route to editorial pitching and the only trustworthy source of listener data. An unclaimed profile can be edited by anyone.',
    actions: [
      'Claim the artist profile on every store the music is live on.',
      'Verify ownership through the distributor or the platform.',
      'Mark each claimed profile verified so S.M.U.V.E. can rely on it.',
    ],
    evidence: 'A verified for-artists destination link.',
    destinationId: 'spotify-for-artists',
    effort: 'days',
    cost: 'free',
    requires: ['release-delivery'],
    evaluate: (e) =>
      check(e.verifiedForArtistsLink, e.hasForArtistsLink, [
        ...(e.hasForArtistsLink
          ? ['verifying the claimed dashboard so it counts as evidence']
          : ['claiming the For Artists dashboard']),
      ]),
  },
  {
    id: 'presence-analytics',
    area: 'presence',
    order: 3,
    title: 'Connect one source of proof',
    outcome: 'A linked analytics source so performance claims are measured, not guessed.',
    why: 'Without a measurement source the artist cannot tell a real listener from a favour, and cannot prove growth to a partner, sync buyer, or grant.',
    actions: [
      'Pick one analytics tool and connect it.',
      'Use the same tool for every release so the numbers compare.',
      'Record the link on the official fingerprint.',
    ],
    evidence: 'An analytics destination link.',
    destinationId: 'viberate',
    effort: 'one sitting',
    cost: 'free',
    requires: ['presence-for-artists'],
    evaluate: (e) =>
      check(e.hasAnalyticsLink, false, [
        'Connect and record one analytics source.',
      ]),
  },
  {
    id: 'presence-social',
    area: 'presence',
    order: 4,
    title: 'Hold the same handle everywhere',
    outcome: 'At least three of the artist’s own accounts recorded under one consistent handle.',
    why: 'A listener who searches the name should land on the artist, not on someone else with the same name. Consistency is also what platforms use to confirm identity.',
    actions: [
      'Register the same handle on at least three platforms.',
      'Put the release link in every bio.',
      'Record each account as an official profile link and mark it verified.',
    ],
    evidence: 'At least three official profile links recorded on the fingerprint.',
    effort: 'days',
    cost: 'free',
    requires: ['identity-name'],
    // Deliberately NOT judged from artistIdentity.linkedAccounts: that array is
    // generated by the identity service as one synthetic row per connector, so
    // it is always six entries long and would mark this complete for an artist
    // who holds no accounts at all. Only links the artist recorded count.
    evaluate: (e) =>
      check(e.links.length >= 3, e.links.length > 0, [
        'Record at least three of the artist’s own accounts as official profile links.',
      ]),
  },

  // ── Business ────────────────────────────────────────────────────────────
  {
    id: 'business-entity',
    area: 'business',
    order: 1,
    title: 'Put a structure around the money',
    outcome: 'A registered entity, or a deliberate decision to stay sole-trader for now.',
    why: 'An entity is what signs contracts, holds masters, receives payouts, and keeps personal liability off the artist. It is far cheaper before revenue than after.',
    actions: [
      'Decide the structure with an accountant for the artist’s territory.',
      'Register it and open a dedicated account.',
      'Record the entity name on the profile.',
    ],
    evidence: 'The incorporated flag set on the legal infrastructure.',
    effort: 'weeks',
    cost: 'low',
    // Forming an entity only needs a locked name. Requiring a released record
    // with split sheets in place pushed the cheapest, most protective step
    // behind months of release work.
    requires: ['identity-name'],
    evaluate: (e) =>
      check(e.incorporated, false, [
        'Record the business entity, or note the deliberate decision to wait.',
      ]),
  },
  {
    id: 'business-team',
    area: 'business',
    order: 2,
    title: 'Get the first professional on the team',
    outcome: 'One named professional — engineer, manager, booker, or designer — on the roster.',
    why: 'The first hire removes whichever bottleneck is actually limiting output. Doing everything alone caps the release rate.',
    actions: [
      'Pick the single task that most slows releases down.',
      'Find one person who does only that, and agree terms in writing.',
      'Add them to the roster with their real role.',
    ],
    evidence: 'At least one team member with a role on the roster.',
    effort: 'weeks',
    cost: 'low',
    requires: ['release-first-work'],
    evaluate: (e) =>
      check(e.roster > 0, false, [
        'Add one professional to the roster with their real role.',
      ]),
  },
  {
    id: 'business-trademark',
    area: 'business',
    order: 3,
    title: 'Protect the name',
    outcome: 'A trademark filed or registered for the artist name.',
    why: 'The name is the asset every release, playlist, and contract is attached to. A filing also strengthens takedowns against impostor profiles.',
    actions: [
      'Search the trademark register in the artist’s territory and class.',
      'File for the name, or record why it is not yet sensible to.',
      'Save the status on the profile.',
    ],
    evidence: 'A trademark status other than "None".',
    effort: 'weeks',
    cost: 'paid',
    requires: ['identity-name'],
    evaluate: (e) =>
      check(
        e.trademarkStatus !== '' && e.trademarkStatus !== 'None',
        false,
        ['File the trademark, or record the decision to wait.']
      ),
  },
  {
    id: 'business-press',
    area: 'business',
    order: 4,
    title: 'Build the press kit',
    outcome: 'A bio, a photo set, and a website or landing page a journalist can use without asking.',
    why: 'Press, playlist curators, and booking agents all work from the same assets. Without them, every opportunity costs a week of back-and-forth.',
    actions: [
      'Write a 100-word and a 300-word bio in the artist’s own words.',
      'Upload at least three usable photos.',
      'Stand up a website or landing page with the music and contact.',
    ],
    evidence: 'Press assets, a website, and the origin story on record.',
    effort: 'days',
    cost: 'low',
    requires: ['identity-story'],
    evaluate: (e) =>
      check(
        e.pressAssets > 0 && Boolean(e.str(e.p.website)) && Boolean(e.str(e.journey.originStory)),
        e.pressAssets > 0 || Boolean(e.str(e.p.website)),
        [
          ...(e.pressAssets > 0 ? [] : ['press photos and a written bio']),
          ...(e.str(e.p.website) ? [] : ['a website or landing page']),
        ]
      ),
  },

  // ── Money & Royalties ───────────────────────────────────────────────────
  {
    id: 'money-streams',
    area: 'money',
    order: 1,
    title: 'Name every income stream',
    outcome: 'A declared list of income streams and goals tied to them.',
    why: 'Independent artists routinely leave whole streams unclaimed — publishing, sync, merch — because nobody wrote them down. Naming them is what makes them findable.',
    actions: [
      'List the streams that apply: streaming, sales, sync, merch, live, commissions.',
      'Mark which ones are already earning and which are unopened.',
      'Set a goal against the one to open next.',
    ],
    evidence: 'At least two declared income streams plus a strategic goal.',
    recordedWith: 'questionnaire',
    effort: 'one sitting',
    cost: 'free',
    // Naming the streams is planning work that a pre-release artist benefits
    // from most, so it must not sit behind delivery.
    requires: ['identity-name'],
    evaluate: (e) =>
      check(
        e.list(e.journey.incomeStreams).length >= 2 && e.list(e.p.strategicGoals).length > 0,
        e.list(e.journey.incomeStreams).length > 0,
        [
          ...(e.list(e.journey.incomeStreams).length >= 2
            ? []
            : ['at least two declared income streams']),
          ...(e.list(e.p.strategicGoals).length ? [] : ['a goal tied to those streams']),
        ]
      ),
  },
  {
    id: 'money-accounts',
    area: 'money',
    order: 2,
    title: 'Route the money to accounts the artist controls',
    outcome: 'At least one real payout account on record with royalties collecting.',
    why: 'Money that lands in an unmonitored or shared account is money the artist cannot audit, budget, or prove to a collaborator.',
    actions: [
      'Confirm every payout route points at an account in the artist’s name.',
      'Confirm the PRO and distributor both have correct payment details.',
      'Record the accounts in S.M.U.V.E.',
    ],
    evidence: 'At least one account on record plus a PRO identity for royalty collection.',
    recordedWith: 'hub',
    effort: 'days',
    cost: 'free',
    requires: ['rights-pro'],
    evaluate: (e) =>
      check(
        e.accounts > 0 && e.proIdentity !== '',
        // The PRO being set up but no account yet is partial progress, not a
        // step that has not been started.
        e.accounts > 0 || e.proIdentity !== '',
        [
          ...(e.accounts > 0 ? [] : ['the accounts receiving payouts']),
          ...(e.proIdentity ? [] : ['PRO payment details so royalties are collected']),
        ]
      ),
  },
  {
    id: 'money-budget',
    area: 'money',
    order: 3,
    title: 'Track what a release costs and earns',
    outcome: 'A monthly budget and revenue history that let the artist price the next release.',
    why: 'An artist who does not know the cost of a release cannot decide whether to make one, and cannot negotiate when they do.',
    actions: [
      'Set a monthly budget the artist can actually sustain.',
      'Record what the last release cost and earned.',
      'Keep it running — one month of data beats a plan.',
    ],
    evidence: 'A monthly budget plus at least one revenue history entry.',
    recordedWith: 'hub',
    effort: 'one sitting',
    cost: 'free',
    requires: ['money-streams'],
    evaluate: (e) =>
      check(
        e.monthlyBudget > 0 && e.revenueHistory > 0,
        e.monthlyBudget > 0 || e.revenueHistory > 0,
        [
          ...(e.monthlyBudget > 0 ? [] : ['a sustainable monthly budget']),
          ...(e.revenueHistory > 0 ? [] : ['the first revenue record']),
        ]
      ),
  },

  // ── Audience & Live ─────────────────────────────────────────────────────
  {
    id: 'audience-profile',
    area: 'audience',
    order: 1,
    title: 'Define exactly who it is for',
    outcome: 'A stated audience and a stated artistic intent.',
    why: 'Every marketing and live decision is made against this. Without it, campaigns chase reach and performances chase whoever will book them.',
    actions: [
      'Describe the listener in one sentence, concretely.',
      'State what the music is meant to do for them.',
      'Write what the artist will refuse to do to reach them.',
    ],
    evidence: 'An audience profile and artistic intent on the music blueprint.',
    recordedWith: 'questionnaire',
    effort: 'one sitting',
    cost: 'free',
    requires: ['identity-story'],
    evaluate: (e) =>
      check(
        Boolean(e.str(e.blueprint.audienceProfile) && e.str(e.blueprint.artisticIntent)),
        Boolean(e.str(e.blueprint.audienceProfile)),
        [
          ...(e.str(e.blueprint.audienceProfile) ? [] : ['an audience profile']),
          ...(e.str(e.blueprint.artisticIntent) ? [] : ['the artistic intent']),
        ]
      ),
  },
  {
    id: 'audience-channel',
    area: 'audience',
    order: 2,
    title: 'Own a channel the platforms cannot take away',
    outcome: 'A website plus a stated content strategy and a captured contact route.',
    why: 'Follower counts belong to the platform. An email list or owned site is the only audience asset that survives an algorithm change or a suspended account.',
    actions: [
      'Stand up a page with the music and one sign-up field.',
      'Decide the content cadence and write it down.',
      'Point every platform bio at the owned channel.',
    ],
    evidence: 'A website and a stated content strategy.',
    effort: 'days',
    cost: 'low',
    requires: ['identity-name'],
    evaluate: (e) =>
      check(
        Boolean(e.str(e.p.website) && e.str(e.journey.contentStrategy)),
        Boolean(e.str(e.p.website) || e.str(e.journey.contentStrategy)),
        [
          ...(e.str(e.p.website) ? [] : ['an owned website or landing page']),
          ...(e.str(e.journey.contentStrategy) ? [] : ['a content strategy']),
        ]
      ),
  },
  {
    id: 'audience-first-show',
    area: 'audience',
    order: 3,
    title: 'Play the first show',
    outcome: 'At least one performance played and counted.',
    why: 'Live is where the material is tested and where the first real fans come from. It also produces the performance history that promoters and grants ask for.',
    evidence: 'A performances-per-year figure above zero.',
    actions: [
      'Book the smallest possible room — an open mic counts.',
      'Play the strongest three songs and film one of them.',
      'Record the show and how many people came.',
    ],
    effort: 'weeks',
    cost: 'free',
    requires: ['release-first-work'],
    evaluate: (e) =>
      check(e.showsPerYear > 0, false, [
        'Record the first performance, even if the count is one.',
      ]),
  },
  {
    id: 'audience-content',
    area: 'audience',
    order: 4,
    title: 'Set a repeatable release and content rhythm',
    outcome: 'A stated release velocity and a content strategy that runs without a campaign.',
    why: 'Momentum comes from rhythm, not from one big push. A sustainable cadence compounds; a launch spike does not.',
    actions: [
      'Pick a cadence the artist can hold while working.',
      'Batch content so it does not depend on inspiration.',
      'Review one metric per cycle and change one thing.',
    ],
    evidence: 'A release velocity, a content strategy, and a success metric.',
    recordedWith: 'questionnaire',
    effort: 'one sitting',
    cost: 'free',
    requires: ['audience-profile'],
    evaluate: (e) =>
      check(
        Boolean(
          e.str(e.journey.releaseVelocity) &&
            e.str(e.journey.contentStrategy) &&
            e.str(e.journey.primarySuccessMetric)
        ),
        Boolean(e.str(e.journey.releaseVelocity) || e.str(e.journey.primarySuccessMetric)),
        [
          ...(e.str(e.journey.releaseVelocity) ? [] : ['a release cadence']),
          ...(e.str(e.journey.contentStrategy) ? [] : ['a content strategy']),
          ...(e.str(e.journey.primarySuccessMetric) ? [] : ['one success metric']),
        ]
      ),
  },
];

@Injectable({ providedIn: 'root' })
export class ArtistPathwayService {
  private fingerprint = inject(ArtistOnlineFingerprintService);

  readonly steps: PathwayStep[] = STEPS.map(
    ({ evaluate: _evaluate, ...step }) => step as PathwayStep
  );

  /** Full pathway readout for a profile, including an unsaved draft. */
  readout(profile: UserProfile | null | undefined): PathwayReadout {
    const evidence = this.buildEvidence(profile);
    const evaluation = new Map<
      string,
      { done: boolean; partial: boolean; needs: string[] }
    >();
    STEPS.forEach((step) => evaluation.set(step.id, step.evaluate(evidence)));

    const ordered = [...STEPS].sort(
      (a, b) => AREA_ORDER.indexOf(a.area) - AREA_ORDER.indexOf(b.area) || a.order - b.order
    );
    const byId = new Map(ordered.map((step) => [step.id, step]));

    const progress: PathwayStepProgress[] = ordered.map((step) => {
      const result = evaluation.get(step.id)!;
      // A dependency is only satisfied by a genuinely complete step, so an
      // artist can never arrive at "verify your dashboard" with no release.
      const blockers = step.requires.filter(
        (id) => byId.has(id) && !evaluation.get(id)!.done
      );
      const status: PathwayStepStatus = result.done
        ? 'complete'
        : blockers.length
          ? 'blocked'
          : result.partial
            ? 'in-progress'
            : 'ready';
      return {
        step,
        status,
        needs: result.done ? [] : result.needs,
        blockedBy: blockers
          .map((id) => byId.get(id)?.title || id)
          .filter(Boolean),
        nextMove: result.done ? '' : step.actions[0] || '',
      };
    });

    const areas = AREA_ORDER.map((area) => {
      const areaSteps = progress.filter((entry) => entry.step.area === area);
      const completed = areaSteps.filter((entry) => entry.status === 'complete').length;
      const total = areaSteps.length;
      const score = total ? Math.round((completed / total) * 100) : 0;
      return {
        area,
        label: AREA_LABEL[area],
        means: AREA_MEANS[area],
        standing:
          score === 100
            ? ('official' as const)
            : completed > 0
              ? ('in-progress' as const)
              : ('unofficial' as const),
        completed,
        total,
        score,
        outstanding: areaSteps
          .filter((entry) => entry.status !== 'complete')
          .map((entry) => entry.step.title),
      };
    });

    const completedSteps = progress.filter((entry) => entry.status === 'complete').length;
    const totalSteps = progress.length;
    const overall = totalSteps ? Math.round((completedSteps / totalSteps) * 100) : 0;
    const officialAreas = areas.filter((a) => a.standing === 'official').map((a) => a.area);
    const unofficialAreas = areas.filter((a) => a.standing !== 'official').map((a) => a.area);

    // One ordering rule for every surface. `nextAction` and `todayList` both
    // read from `openInPriorityOrder`, so the hero and the tip queue can never
    // recommend different things.
    const priority = this.openInPriorityOrder(progress);
    const nextAction = priority[0] || null;

    // Genuinely independent work: neither step is a prerequisite of the other,
    // so an artist with spare capacity can advance two areas at once. Filtering
    // on "unblocks nothing" instead would empty this list for every beginner,
    // because at the start almost every useful step unblocks something.
    const parallelActions = nextAction
      ? progress
          .filter(
            (entry) =>
              entry !== nextAction &&
              (entry.status === 'ready' || entry.status === 'in-progress') &&
              !nextAction.step.requires.includes(entry.step.id) &&
              !entry.step.requires.includes(nextAction.step.id)
          )
          .slice(0, 3)
      : [];

    return {
      steps: progress,
      areas,
      overall,
      completedSteps,
      totalSteps,
      officialAreas,
      unofficialAreas,
      stage:
        officialAreas.length === AREA_ORDER.length
          ? 'official'
          : overall >= 70
            ? 'consolidating'
            : completedSteps > 0
              ? 'building'
              : 'getting-started',
      nextAction,
      parallelActions,
      openSteps: progress.filter((entry) => entry.status !== 'complete').length,
    };
  }

  /** Progress for one area only, for area-scoped panels. */
  area(area: PathwayArea, profile: UserProfile | null | undefined): PathwayAreaStanding {
    const readout = this.readout(profile);
    return (
      readout.areas.find((entry) => entry.area === area) || {
        area,
        label: AREA_LABEL[area],
        means: AREA_MEANS[area],
        standing: 'unofficial',
        completed: 0,
        total: 0,
        score: 0,
        outstanding: [],
      }
    );
  }

  /** Ordered steps for one area, with statuses. */
  areaSteps(
    area: PathwayArea,
    profile: UserProfile | null | undefined
  ): PathwayStepProgress[] {
    return this.readout(profile).steps.filter((entry) => entry.step.area === area);
  }

  /**
   * Which surface owns the evidence, so the UI routes the artist to the place
   * that actually has a control for it.
   */
  recordIn(step: PathwayStep): PathwayRecordSurface {
    return step.recordedWith || 'profile';
  }

  /**
   * The real sign-up or dashboard page for a step, so the pathway can send the
   * artist somewhere that actually exists instead of describing it.
   */
  destination(
    id: string | undefined
  ): { label: string; url: string; category: string } | null {
    if (!id) return null;
    const match = this.fingerprint.destination(id);
    return match
      ? { label: match.label, url: match.url, category: match.category }
      : null;
  }

  /** Steps that are ready to start right now. */
  actionable(profile: UserProfile | null | undefined): PathwayStepProgress[] {
    return this.readout(profile).steps.filter((entry) => entry.status === 'ready');
  }

  /**
   * A short, ordered to-do list for today, drawn from the pathway.
   *
   * Blocked steps are excluded rather than ranked last: an artist cannot act on
   * a step whose prerequisites are unmet, so listing it would be busywork. It
   * stays visible in its area card with the reason it is blocked.
   */
  todayList(profile: UserProfile | null | undefined, limit = 3): string[] {
    return this.openInPriorityOrder(this.readout(profile).steps)
      .slice(0, Math.max(0, limit))
      .map((entry) => entry.step.title);
  }

  /**
   * The single action ordering used everywhere: actionable steps only, with a
   * partially finished step ahead of a fresh one — finishing beats starting —
   * and area order breaking the tie.
   */
  private openInPriorityOrder(
    steps: PathwayStepProgress[]
  ): PathwayStepProgress[] {
    return steps
      .filter(
        (entry) => entry.status === 'ready' || entry.status === 'in-progress'
      )
      .sort(
        (a, b) =>
          this.openRank(a) - this.openRank(b) ||
          AREA_ORDER.indexOf(a.step.area) - AREA_ORDER.indexOf(b.step.area) ||
          a.step.order - b.step.order
      );
  }

  /**
   * Lower ranks are acted on sooner. A partially finished step outranks any
   * untouched one; among untouched steps the earliest area leads.
   */
  private openRank(entry: PathwayStepProgress): number {
    const areaIndex = AREA_ORDER.indexOf(entry.step.area);
    return entry.status === 'in-progress' ? areaIndex : areaIndex + 100;
  }

  private buildEvidence(profile: UserProfile | null | undefined): Evidence {
    const p: any = profile || {};
    const journey: any = p.musicalJourney || {};
    const blueprint: any = journey.musicBlueprint || {};
    const legal: any = p.legalInfrastructure || {};
    const financials: any = p.financials || {};
    const live: any = p.touringDetails || {};

    const list = (value: any): any[] => (Array.isArray(value) ? value.filter(Boolean) : []);
    const str = (value: any): string =>
      typeof value === 'string' && value.trim() ? value.trim() : '';

    const catalog: any[] = list(p.catalog);
    const links: any[] = list(p.officialArtistProfiles);
    const readout = this.fingerprint.readout(p as UserProfile);

    const categoryOf = (link: any): string | undefined =>
      this.fingerprint.destination(String(link?.destinationId || ''))?.category;

    const shows = Number.parseInt(String(p.performancesPerYear ?? ''), 10);

    return {
      p,
      journey,
      blueprint,
      catalog,
      links,
      list,
      str,
      hasDeliveryLink: links.some((link) => categoryOf(link) === 'delivery'),
      hasProLink: links.some((link) => categoryOf(link) === 'pro'),
      hasAnalyticsLink: links.some((link) => categoryOf(link) === 'analytics'),
      hasForArtistsLink: links.some((link) => categoryOf(link) === 'for-artists'),
      verifiedForArtistsLink: links.some(
        (link) => categoryOf(link) === 'for-artists' && link?.verified === true
      ),
      verifiedLinkCount: links.filter((link) => link?.verified === true).length,
      unrecognisedLinkCount: readout.unrecognised,
      documentedReleaseCount: this.fingerprint
        .history(p as UserProfile)
        .releases.filter((entry) => entry.missing.length === 0).length,
      deliveredReleaseCount: catalog.filter(
        (item) => item.distributor && item.releaseDate
      ).length,
      proAffiliation: str(legal.proAffiliation),
      proIdentity: [str(p.proName), str(p.proIpi)].filter(Boolean).join(' / '),
      registeredWorks: legal.hasRegisteredWorks === true,
      standardSplitSheet: str(legal.hasStandardSplitSheet),
      incorporated: legal.isIncorporated === true,
      trademarkStatus: str(legal.trademarkStatus),
      accounts: list(financials.accounts).length,
      monthlyBudget: typeof financials.monthlyBudget === 'number' ? financials.monthlyBudget : 0,
      revenueHistory: list(financials.revenueHistory).length,
      showsPerYear: Number.isFinite(shows) ? shows : 0,
      roster: list(p.team).length,
      pressAssets: list(p.pressGallery).length,
    };
  }
}
