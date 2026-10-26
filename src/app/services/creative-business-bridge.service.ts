import { Injectable } from '@angular/core';
import { UserProfile } from './user-profile.service';
import { ReleaseProject } from '../types/release.types';
import { CatalogItem } from '../types/profile.types';
import {
  CREATIVE_DIMENSION_LABEL,
  CREATIVE_DIMENSION_ORDER,
  CreativeBusinessBridge,
  CreativeConsequence,
  CreativeDimensionId,
} from '../types/creative-business.types';

/** Cadences the app reads as "this artist releases rarely", quoted back to them. */
const LOW_CADENCE = ['occasional', 'rare', 'seldom', 'slow', 'seasonal'];

const normalize = (value: unknown): string =>
  typeof value === 'string'
    ? value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
    : '';

const present = (value: unknown): boolean => {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
};

/**
 * Translates a creative decision — the release the artist is about to put out —
 * into the career consequences that follow from it.
 *
 * This is the bridge the rest of the app was missing: readiness says whether a
 * release can be delivered, this says what delivering it commits the artist to
 * in rights, schedule, audience, legal exposure, monetization and growth. Every
 * line below quotes the field it came from. Where no field exists the dimension
 * is reported as `unknown`, never as clear, because "we cannot tell" and "you
 * are fine" are different answers and only one of them is true.
 */
@Injectable({ providedIn: 'root' })
export class CreativeBusinessBridgeService {
  assess(
    profile: UserProfile | null | undefined,
    release: ReleaseProject | null | undefined
  ): CreativeBusinessBridge {
    const generatedAt = new Date().toISOString();

    if (!release) {
      return {
        generatedAt,
        status: 'no-release',
        releaseId: null,
        releaseName: null,
        headline:
          'No release is in the pipeline, so there is no creative decision to carry into the business yet.',
        consequences: [],
        blocking: [],
        unclear: [],
        provenanceNotes: [
          'The bridge reads a release project, the artist catalogue, and the named profile fields. With no release project there is nothing to translate.',
        ],
      };
    }

    const works = ((profile as any)?.catalog ?? []) as CatalogItem[];
    const work = this.matchCatalogWork(works, release.name);
    const consequences: CreativeConsequence[] = CREATIVE_DIMENSION_ORDER.map(
      (dimension) => this.consequence(dimension, profile, release, work)
    );

    const blocking = consequences
      .filter((entry) => entry.severity === 'blocking')
      .map((entry) => entry.dimension);
    const unclear = consequences
      .filter((entry) => entry.severity === 'unknown')
      .map((entry) => entry.dimension);

    return {
      generatedAt,
      status: 'assessed',
      releaseId: release.id,
      releaseName: release.name,
      headline: this.headline(release, blocking, unclear),
      consequences,
      blocking,
      unclear,
      provenanceNotes: this.notes(work, unclear),
    };
  }

  private consequence(
    dimension: CreativeDimensionId,
    profile: UserProfile | null | undefined,
    release: ReleaseProject,
    work: CatalogItem | null
  ): CreativeConsequence {
    switch (dimension) {
      case 'rights':
        return this.rights(profile, release, work);
      case 'schedule':
        return this.schedule(profile, release, work);
      case 'audience':
        return this.audience(profile, release);
      case 'legal':
        return this.legal(profile, release);
      case 'monetization':
        return this.monetization(profile, release);
      default:
        return this.growth(profile, release);
    }
  }

  private rights(
    profile: UserProfile | null | undefined,
    release: ReleaseProject,
    work: CatalogItem | null
  ): CreativeConsequence {
    const collaborators = release.credits?.collaborators ?? [];
    const artist = (release.credits?.artistName || '').trim();
    // The release's own reference wins: it was recorded against this release,
    // while the catalogue entry may describe a different delivery of it.
    const releaseSplitRef = (release.splitSheetRef || '').trim();
    const catalogSplitRef = (work?.splitSheetRef || '').trim();
    const splitRef = releaseSplitRef || catalogSplitRef;
    const splitSource = releaseSplitRef
      ? `release.splitSheetRef = "${releaseSplitRef}"`
      : `catalog[].splitSheetRef = "${catalogSplitRef}"`;
    const profileSplit = (profile as any)?.legalInfrastructure
      ?.hasStandardSplitSheet;
    const splitHabit =
      present(profileSplit) &&
      !['never', 'none', 'no'].includes(normalize(profileSplit));

    if (!collaborators.length) {
      return {
        id: 'creative:rights',
        dimension: 'rights',
        label: CREATIVE_DIMENSION_LABEL.rights,
        observation: artist
          ? `"${release.name}" carries a solo artist credit (${artist}).`
          : `"${release.name}" records no artist credit.`,
        consequence: artist
          ? 'There are no collaborator shares on this release, so shipping it adds no new rights holders to keep in agreement.'
          : 'A release with no recorded credit cannot say whose master it is, which makes any later licensing conversation start from doubt.',
        decision: artist
          ? 'No split work is owed for this release.'
          : 'Record the artist credit on the release before it is delivered.',
        severity: artist ? 'clear' : 'unknown',
        provenance: artist ? 'inferred' : 'missing',
        evidence: artist
          ? [`credits.artistName = "${artist}"`, 'credits.collaborators is empty.']
          : ['credits.artistName is empty.', 'credits.collaborators is empty.'],
      };
    }

    const count = collaborators.length;
    const names = collaborators.slice(0, 4).join(', ');
    const sharedEvidence = [
      `credits.collaborators = ${count} (${names}${count > 4 ? ', …' : ''})`,
    ];

    if (splitRef) {
      /*
       * A reference recorded on the release carries the collaborator list it was
       * confirmed against. That list is what makes the reference checkable: a
       * split recorded while the release was solo does not cover someone who
       * joined afterwards, and the app must not keep calling it settled.
       */
      if (releaseSplitRef) {
        const confirmedFor = release.splitSheetFor ?? null;
        if (!confirmedFor) {
          return {
            id: 'creative:rights',
            dimension: 'rights',
            label: CREATIVE_DIMENSION_LABEL.rights,
            observation: `A split reference is recorded on "${release.name}", but nothing records which collaborators it covers.`,
            consequence:
              'A reference with no coverage list cannot be checked against the people who actually share this release, so its protection is assumed rather than shown.',
            decision:
              'Record the split reference again so it is confirmed against this collaborator list.',
            severity: 'watch',
            provenance: 'inferred',
            evidence: [
              ...sharedEvidence,
              splitSource,
              'release.splitSheetFor is empty.',
            ],
          };
        }

        const covered = confirmedFor.map((name) => normalize(name));
        const uncovered = collaborators.filter(
          (name) => !covered.includes(normalize(name))
        );

        if (uncovered.length) {
          return {
            id: 'creative:rights',
            dimension: 'rights',
            label: CREATIVE_DIMENSION_LABEL.rights,
            observation: confirmedFor.length
              ? `The split recorded for "${release.name}" was confirmed against ${confirmedFor.join(', ')}, and ${uncovered.join(', ')} ${uncovered.length === 1 ? 'is' : 'are'} not named in it.`
              : `The split recorded for "${release.name}" was confirmed before ${uncovered.join(', ')} joined the release.`,
            consequence:
              'A split that does not name everyone splits nothing for the person it omits: that share is still unagreed, and the release can earn before it is settled.',
            decision:
              'Update the split so it names every collaborator, then record it here again.',
            severity: 'blocking',
            provenance: 'inferred',
            evidence: [
              ...sharedEvidence,
              splitSource,
              confirmedFor.length
                ? `release.splitSheetFor = ${confirmedFor.join(', ')}`
                : 'release.splitSheetFor is empty; the split predates this lineup.',
              `Not named in the split: ${uncovered.join(', ')}`,
            ],
          };
        }
      }

      return {
        id: 'creative:rights',
        dimension: 'rights',
        label: CREATIVE_DIMENSION_LABEL.rights,
        observation: `A split document is recorded for "${release.name}".`,
        consequence: `${count === 1 ? 'The collaborator’s share is' : 'Every collaborator’s share is'} on paper before the money arrives, so the release can earn without renegotiating afterwards.`,
        decision: releaseSplitRef
          ? 'Keep the split covering this lineup as it stands.'
          : 'Keep the split reference attached to the catalogue entry.',
        severity: 'clear',
        provenance: 'verified',
        evidence: releaseSplitRef
          ? [
              ...sharedEvidence,
              splitSource,
              `release.splitSheetFor = ${(release.splitSheetFor ?? []).join(', ') || 'no collaborators'}`,
            ]
          : [...sharedEvidence, splitSource],
      };
    }

    if (splitHabit) {
      return {
        id: 'creative:rights',
        dimension: 'rights',
        label: CREATIVE_DIMENSION_LABEL.rights,
        observation: `You work with ${count} collaborator${count === 1 ? '' : 's'}, and the profile says split sheets are "${profileSplit}", but no split is recorded for this release.`,
        consequence:
          'A split habit is not a split. If this release earns, the shares exist only in memory, and the first disagreement has nothing to point at.',
        decision: 'Attach the split reference to this release’s catalogue entry.',
        severity: 'watch',
        provenance: 'inferred',
        evidence: [
          ...sharedEvidence,
          `legalInfrastructure.hasStandardSplitSheet = "${profileSplit}"`,
          'release.splitSheetRef is empty.',
        ],
      };
    }

    return {
      id: 'creative:rights',
      dimension: 'rights',
      label: CREATIVE_DIMENSION_LABEL.rights,
      observation: `${count} collaborator${count === 1 ? '' : 's'} share this release and no split document is recorded anywhere in the app.`,
      consequence:
        'Undocumented co-ownership is the one thing a release cannot fix after it earns: the recording can generate money that nobody is able to divide with authority.',
      decision:
        'Write and attach the splits before delivery — not after the first statement.',
      severity: 'blocking',
      provenance: 'inferred',
      evidence: [
        ...sharedEvidence,
        'release.splitSheetRef is empty.',
        work
          ? 'catalog[].splitSheetRef is empty for this release.'
          : 'No catalogue entry matched this release, so no split reference exists there either.',
        'legalInfrastructure.hasStandardSplitSheet does not record an in-use sheet.',
      ],
    };
  }

  private schedule(
    profile: UserProfile | null | undefined,
    release: ReleaseProject,
    work: CatalogItem | null
  ): CreativeConsequence {
    const journey = (profile as any)?.musicalJourney ?? {};
    const velocity = (journey.releaseVelocity || '').trim();
    const tracks = release.tracks?.length ?? 0;
    const isProject = release.type !== 'Single' || tracks > 1;
    const dateEvidence = work?.releaseDate
      ? [`catalog[].releaseDate = "${work.releaseDate}"`]
      : ['catalog[].releaseDate is empty.'];

    if (!velocity || normalize(velocity) === 'unspecified') {
      return {
        id: 'creative:schedule',
        dimension: 'schedule',
        label: CREATIVE_DIMENSION_LABEL.schedule,
        observation: `"${release.name}" is ${this.describeSize(release, tracks)}, and the profile does not record a release cadence.`,
        consequence:
          'Without a stated cadence the app cannot tell whether this release is on plan or ahead of it, so it will not call the timing early or late.',
        decision: 'Record the cadence you actually keep, then judge this release against it.',
        severity: 'unknown',
        provenance: 'missing',
        evidence: [
          'musicalJourney.releaseVelocity is empty or "Unspecified".',
          `${tracks} track${tracks === 1 ? '' : 's'} on the release project.`,
          ...dateEvidence,
        ],
      };
    }

    const low = LOW_CADENCE.includes(normalize(velocity));

    if (low && isProject) {
      return {
        id: 'creative:schedule',
        dimension: 'schedule',
        label: CREATIVE_DIMENSION_LABEL.schedule,
        observation: `You describe your cadence as "${velocity}", and "${release.name}" is ${this.describeSize(release, tracks)}.`,
        consequence:
          'A project this size asks for a rollout window — artwork, sequencing and follow-up all come due together — which is longer than the cadence you described.',
        decision:
          'Either commit to the rollout the project needs, or cut it to what your cadence can carry.',
        severity: 'watch',
        provenance: 'inferred',
        evidence: [
          `musicalJourney.releaseVelocity = "${velocity}"`,
          `${release.type}, ${tracks} track${tracks === 1 ? '' : 's'}.`,
          ...dateEvidence,
        ],
      };
    }

    return {
      id: 'creative:schedule',
      dimension: 'schedule',
      label: CREATIVE_DIMENSION_LABEL.schedule,
      observation: `A "${velocity}" cadence against ${this.describeSize(release, tracks)}.`,
      consequence:
        'The project is the size your cadence assumes, so it does not by itself add pressure to the schedule.',
      decision: work?.releaseDate
        ? `Hold the recorded date (${work.releaseDate}) or change it deliberately.`
        : 'Record the intended release date so the campaign and the delivery agree on it.',
      severity: 'clear',
      provenance: 'inferred',
      evidence: [
        `musicalJourney.releaseVelocity = "${velocity}"`,
        `${release.type}, ${tracks} track${tracks === 1 ? '' : 's'}.`,
        ...dateEvidence,
      ],
    };
  }

  private describeSize(release: ReleaseProject, tracks: number): string {
    return `a ${tracks}-track ${release.type}`;
  }

  private audience(
    profile: UserProfile | null | undefined,
    release: ReleaseProject
  ): CreativeConsequence {
    const audience = (
      (profile as any)?.musicalJourney?.musicBlueprint?.audienceProfile || ''
    ).trim();
    const description = (release.description || '').trim();

    if (!audience) {
      return {
        id: 'creative:audience',
        dimension: 'audience',
        label: CREATIVE_DIMENSION_LABEL.audience,
        observation: `The profile does not say who "${release.name}" is meant to reach.`,
        consequence:
          'Audience fit is unjudged: nothing recorded says who this release is for, so a claim that it lands well would be invented rather than observed.',
        decision:
          'Name the audience you are aiming at, then check this release’s own copy speaks to them.',
        severity: 'unknown',
        provenance: 'missing',
        evidence: [
          'musicalJourney.musicBlueprint.audienceProfile is empty.',
          description
            ? `release.description = "${description}"`
            : 'release.description is empty.',
        ],
      };
    }

    return {
      id: 'creative:audience',
      dimension: 'audience',
      label: CREATIVE_DIMENSION_LABEL.audience,
      observation: `You describe the audience as "${audience}".`,
      consequence: description
        ? `The release describes itself as "${description}". Both statements are the artist's own; the app cannot verify that they are the same promise to the same people.`
        : 'The release carries no description, so that positioning exists only on the profile and nowhere a listener would meet it.',
      decision: description
        ? 'Read the profile line and the release copy side by side once before delivery.'
        : 'Write the release description so it says what the profile says the audience wants.',
      // Recorded, but consistency is not something the app can verify.
      severity: 'watch',
      provenance: 'inferred',
      evidence: [
        `musicalJourney.musicBlueprint.audienceProfile = "${audience}"`,
        description
          ? `release.description = "${description}"`
          : 'release.description is empty.',
      ],
    };
  }

  private legal(
    profile: UserProfile | null | undefined,
    release: ReleaseProject
  ): CreativeConsequence {
    const legal = (profile as any)?.legalInfrastructure;
    const collaborators = release.credits?.collaborators ?? [];
    const artist = (release.credits?.artistName || '').trim();

    if (!legal) {
      return {
        id: 'creative:legal',
        dimension: 'legal',
        label: CREATIVE_DIMENSION_LABEL.legal,
        observation: 'The profile records no legal infrastructure at all.',
        consequence:
          'Whether this release is contracted personally or through an entity is unknown, so the app cannot say who carries the exposure.',
        decision: 'Record your entity and trademark position once, and it applies to every release.',
        severity: 'unknown',
        provenance: 'missing',
        evidence: ['legalInfrastructure is not recorded on the profile.'],
      };
    }

    const incorporated = legal.isIncorporated === true;
    const trademark = normalize(legal.trademarkStatus);
    const trademarked = trademark && trademark !== 'none';

    if (!incorporated) {
      return {
        id: 'creative:legal',
        dimension: 'legal',
        label: CREATIVE_DIMENSION_LABEL.legal,
        observation: collaborators.length
          ? `"${release.name}" is released with ${collaborators.length} collaborator${collaborators.length === 1 ? '' : 's'} and no business entity is recorded for ${artist || 'the artist'}.`
          : `No business entity is recorded for ${artist || 'the artist'}.`,
        consequence:
          'Released personally, the obligations this recording creates — splits, promises to collaborators, claims about the work — attach to the artist rather than to a company.',
        decision:
          'Decide whether releases should run through an entity before the catalogue grows any further.',
        severity: 'watch',
        provenance: 'inferred',
        evidence: [
          'legalInfrastructure.isIncorporated = false',
          `credits.collaborators = ${collaborators.length}`,
          `legalInfrastructure.trademarkStatus = "${legal.trademarkStatus}"`,
        ],
      };
    }

    if (!trademarked) {
      return {
        id: 'creative:legal',
        dimension: 'legal',
        label: CREATIVE_DIMENSION_LABEL.legal,
        observation: `The entity is registered, but the name "${artist || 'the artist name'}" has no trademark status recorded.`,
        consequence:
          'The release trades under a name the app has no record of protecting, so the brand this release builds is the part with the least paperwork behind it.',
        decision: 'Decide whether the artist name should be filed before the catalogue grows.',
        severity: 'watch',
        provenance: 'inferred',
        evidence: [
          'legalInfrastructure.isIncorporated = true',
          `legalInfrastructure.trademarkStatus = "${legal.trademarkStatus}"`,
        ],
      };
    }

    return {
      id: 'creative:legal',
      dimension: 'legal',
      label: CREATIVE_DIMENSION_LABEL.legal,
      observation: `An entity is recorded and the name is "${legal.trademarkStatus}".`,
      consequence:
        'The recorded structure separates the release from the artist personally, with the name registered as recorded.',
      decision: 'Keep the entity and the release credit pointing at the same name.',
      severity: 'clear',
      provenance: 'inferred',
      evidence: [
        'legalInfrastructure.isIncorporated = true',
        `legalInfrastructure.trademarkStatus = "${legal.trademarkStatus}"`,
      ],
    };
  }

  private monetization(
    profile: UserProfile | null | undefined,
    release: ReleaseProject
  ): CreativeConsequence {
    const proName =
      (release.credits?.proName || (profile as any)?.proName || '').trim();
    const proIpi =
      (release.credits?.proIpi || (profile as any)?.proIpi || '').trim();
    const campaignId = (release.marketingCampaignId || '').trim();
    // A reference to a campaign that no longer exists is not a plan.
    const campaigns = ((profile as any)?.marketingCampaigns ?? []) as Array<{
      id?: string;
      name?: string;
    }>;
    const campaign = campaignId
      ? campaigns.find((entry) => entry.id === campaignId)
      : undefined;
    const streams = ((profile as any)?.musicalJourney?.incomeStreams ?? []) as string[];

    if (!proName || !proIpi) {
      return {
        id: 'creative:monetization',
        dimension: 'monetization',
        label: CREATIVE_DIMENSION_LABEL.monetization,
        observation: `"${release.name}" has no PRO and IPI recorded ${proName || proIpi ? 'as a pair' : 'at all'}.`,
        consequence:
          'Performance royalties for these works have no account to land in. The plays still happen; the money simply has nowhere of yours to go.',
        decision:
          'Complete the PRO registration and record the IPI before this release is delivered.',
        severity: 'watch',
        provenance: 'inferred',
        evidence: [
          `credits.proName = "${proName}"`,
          `credits.proIpi = "${proIpi}"`,
        ],
      };
    }

    if (!campaign) {
      return {
        id: 'creative:monetization',
        dimension: 'monetization',
        label: CREATIVE_DIMENSION_LABEL.monetization,
        observation: campaignId
          ? `Rights are collectable (${proName}, IPI ${proIpi}), but the campaign this release points at no longer exists.`
          : `Rights are collectable (${proName}, IPI ${proIpi}), but no campaign is attached to the release.`,
        consequence:
          'The release can be delivered and earn collection royalties, but nothing in the app spends or schedules promotion behind it — the income path is passive.',
        decision: campaignId
          ? 'Attach a campaign that exists, or accept a release with no planned push.'
          : 'Attach a campaign, or accept a release with no planned push and judge it accordingly.',
        severity: 'watch',
        provenance: 'inferred',
        evidence: [
          `credits.proName = "${proName}"`,
          `credits.proIpi = "${proIpi}"`,
          campaignId
            ? `release.marketingCampaignId = "${campaignId}", but no campaign with that id exists in the profile.`
            : 'release.marketingCampaignId is empty.',
          streams.length
            ? `musicalJourney.incomeStreams = ${streams.join(', ')}`
            : 'musicalJourney.incomeStreams is empty.',
        ],
      };
    }

    return {
      id: 'creative:monetization',
      dimension: 'monetization',
      label: CREATIVE_DIMENSION_LABEL.monetization,
      observation: `Rights are collectable (${proName}, IPI ${proIpi}) and a campaign is attached.`,
      consequence:
        'The works have an account to earn into and the release has a spending plan behind it. What the campaign returns is not observed anywhere in the app.',
      decision: 'Set the spend and the success measure before the campaign starts.',
      severity: 'clear',
      provenance: 'inferred',
      evidence: [
        `credits.proName = "${proName}"`,
        `credits.proIpi = "${proIpi}"`,
        `release.marketingCampaignId = "${campaign.id}" (${campaign.name || 'unnamed campaign'})`,
      ],
    };
  }

  private growth(
    profile: UserProfile | null | undefined,
    release: ReleaseProject
  ): CreativeConsequence {
    const links = ((profile as any)?.officialArtistProfiles ?? []) as Array<{
      label?: string;
      url?: string;
      verified?: boolean;
    }>;
    const usable = links.filter((link) => present(link?.url));
    const verified = usable.filter((link) => link.verified === true).length;
    const strategy = (
      (profile as any)?.musicalJourney?.contentStrategy || ''
    ).trim();

    if (!usable.length) {
      return {
        id: 'creative:growth',
        dimension: 'growth',
        label: CREATIVE_DIMENSION_LABEL.growth,
        observation: 'No official artist profile links are recorded.',
        consequence:
          'The release has no owned destination of record: every listener it earns arrives on a platform the artist does not control, and the app cannot point anyone to an official home.',
        decision:
          'Record at least one owned channel before the release goes out, so the release has somewhere to send people.',
        severity: 'watch',
        provenance: 'missing',
        evidence: [
          'officialArtistProfiles is empty.',
          strategy
            ? `musicalJourney.contentStrategy = "${strategy}"`
            : 'musicalJourney.contentStrategy is empty.',
        ],
      };
    }

    return {
      id: 'creative:growth',
      dimension: 'growth',
      label: CREATIVE_DIMENSION_LABEL.growth,
      observation: `${usable.length} official link${usable.length === 1 ? '' : 's'} recorded, ${verified} marked verified.`,
      consequence: strategy
        ? `The release can route listeners to an owned destination. The profile describes the content strategy as "${strategy}", and nothing here confirms that cadence is being kept.`
        : 'The release can route listeners to an owned destination, but the profile records no content strategy, so nothing says what keeps bringing them back.',
      decision: strategy
        ? 'Point the campaign at these links and measure the cadence against the strategy you wrote.'
        : 'Write the content cadence, then point the campaign at these links.',
      severity: strategy ? 'clear' : 'watch',
      provenance: 'inferred',
      evidence: [
        `officialArtistProfiles = ${usable.length} link(s), ${verified} verified.`,
        strategy
          ? `musicalJourney.contentStrategy = "${strategy}"`
          : 'musicalJourney.contentStrategy is empty.',
      ],
    };
  }

  private matchCatalogWork(
    works: CatalogItem[],
    releaseName: string
  ): CatalogItem | null {
    const target = normalize(releaseName);
    if (!target) return null;
    return works.find((work) => normalize(work.title) === target) ?? null;
  }

  private headline(
    release: ReleaseProject,
    blocking: CreativeDimensionId[],
    unclear: CreativeDimensionId[]
  ): string {
    if (blocking.length) {
      return `${blocking.length} consequence${blocking.length === 1 ? '' : 's'} of shipping "${release.name}" need settling before delivery, starting with ${CREATIVE_DIMENSION_LABEL[blocking[0]]}.`;
    }
    if (unclear.length) {
      return `"${release.name}" shows no unresolved exposure in what is recorded, but ${unclear.length} of ${CREATIVE_DIMENSION_ORDER.length} dimensions cannot be judged at all.`;
    }
    return `"${release.name}" carries no unresolved exposure across the six dimensions the bridge reads.`;
  }

  private notes(
    work: CatalogItem | null,
    unclear: CreativeDimensionId[]
  ): string[] {
    const notes = [
      'Every consequence quotes the release project, the catalogue, or a named profile field. No distributor, DSP, royalty, or analytics feed is connected, so none of these readings is observed from a platform.',
      'Release readiness asks whether a release can be delivered; this asks what delivering it commits the artist to. Both read the same facts and never overwrite each other.',
      'This describes exposure in the recorded data. It is not legal, tax, or financial advice.',
    ];
    if (!work) {
      notes.push(
        'No catalogue entry matched this release name, so identifiers, split references, and dates are judged from the release project alone.',
      );
    }
    if (unclear.length) {
      notes.push(
        `${unclear.length} dimension${unclear.length === 1 ? '' : 's'} had no recorded fact and ${unclear.length === 1 ? 'is' : 'are'} reported as unknown rather than clear.`,
      );
    }
    return notes;
  }
}
