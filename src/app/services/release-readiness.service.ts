import { Injectable } from '@angular/core';
import { UserProfile } from './user-profile.service';
import { ReleaseProject } from '../types/release.types';
import {
  ReadinessCheck,
  ReadinessState,
  ReleaseReadiness,
} from '../types/release-readiness.types';

/** The catalogue fields readiness can actually check against. */
interface CatalogWork {
  title?: string;
  isrc?: string;
  upc?: string;
  releaseDate?: string;
  distributor?: string;
  platforms?: string[];
  splitSheetRef?: string;
}

/** Fields a distributor rejects a delivery without. */
const DELIVERY_IDENTIFIERS = ['ISRC', 'UPC', 'Release date', 'Distributor'];

const normalize = (value: string): string =>
  value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

const present = (value: unknown): boolean => {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
};

/**
 * Judges whether a release can be pushed, using only what the app knows.
 *
 * Everything here is derived from the release project, the artist's catalogue,
 * and the legal fields on the profile. There is no distributor, DSP, royalty, or
 * analytics feed connected, so this service never claims to know delivery
 * status or campaign performance — it reports those as unscored.
 */
@Injectable({ providedIn: 'root' })
export class ReleaseReadinessService {
  assess(
    profile: UserProfile | null | undefined,
    release: ReleaseProject | null | undefined
  ): ReleaseReadiness {
    const generatedAt = new Date().toISOString();

    if (!release) {
      return {
        generatedAt,
        status: 'no-release',
        releaseId: null,
        releaseName: null,
        state: 'insufficient-data',
        overallScore: null,
        checks: [],
        blockingGaps: [],
        verdict:
          'No release is in the pipeline yet, so there is nothing to judge readiness against.',
        provenanceNotes: [
          'Readiness is scored from a release project and the artist catalogue. With no release project, the only honest state is insufficient data.',
        ],
      };
    }

    const works = ((profile as any)?.catalog ?? []) as CatalogWork[];
    const work = this.matchCatalogWork(works, release.name);
    const checks: ReadinessCheck[] = [
      this.productionCheck(release),
      this.metadataCheck(release, work),
      this.rightsCheck(profile, release, work),
      this.campaignCheck(release),
      this.timingCheck(work),
    ];

    const blockingGaps = checks
      .filter((check) => check.blocking)
      .flatMap((check) => check.gaps);
    const scored = checks.filter((check) => check.score !== null);
    const overallScore = scored.length
      ? Math.round(
          scored.reduce((sum, check) => sum + (check.score ?? 0), 0) /
            scored.length
        )
      : null;

    const blockingUnready = checks.filter(
      (check) => check.blocking && check.state !== 'ready'
    );
    const campaign = checks.find((check) => check.id === 'campaign')!;

    const state: ReadinessState =
      overallScore === null
        ? 'insufficient-data'
        : blockingUnready.length
          ? 'not-ready'
          : campaign.state === 'ready'
            ? 'ready'
            : 'almost';

    return {
      generatedAt,
      status: 'assessed',
      releaseId: release.id,
      releaseName: release.name,
      state,
      overallScore,
      checks,
      blockingGaps,
      verdict: this.verdict(state, release, blockingGaps, checks),
      provenanceNotes: this.notes(work, checks),
    };
  }

  private matchCatalogWork(
    works: CatalogWork[],
    releaseName: string
  ): CatalogWork | null {
    const target = normalize(releaseName || '');
    if (!target) return null;
    return (
      works.find((work) => normalize(work.title || '') === target) ?? null
    );
  }

  private productionCheck(release: ReleaseProject): ReadinessCheck {
    const tracks = release.tracks ?? [];
    if (!tracks.length) {
      return {
        id: 'production',
        label: 'Production',
        blocking: true,
        state: 'insufficient-data',
        score: null,
        provenance: 'missing',
        evidence: [],
        gaps: ['Add the tracks for this release before judging production.'],
      };
    }

    const mastered = tracks.filter((track) =>
      Object.values(track.stages ?? {}).every((stage) => stage === 'Completed')
    );
    const score = Math.round((mastered.length / tracks.length) * 100);
    const unfinished = tracks.filter((track) => !mastered.includes(track));

    return {
      id: 'production',
      label: 'Production',
      blocking: true,
      state: this.stateFor(score),
      score,
      // Stage flags are the artist's own checklist state, not a verified export.
      provenance: 'inferred',
      evidence: [
        `${mastered.length} of ${tracks.length} track${tracks.length === 1 ? '' : 's'} finished every stage.`,
      ],
      gaps: unfinished.map((track) => `Finish "${track.title}" through mastering.`),
    };
  }

  private metadataCheck(
    release: ReleaseProject,
    work: CatalogWork | null
  ): ReadinessCheck {
    const fields: Array<{ label: string; value: unknown }> = [
      { label: 'Release name', value: release.name },
      { label: 'Release type', value: release.type },
      { label: 'Description', value: release.description },
      { label: 'Cover artwork', value: (release as any).artworkUrl },
      { label: 'Artist credit', value: release.credits?.artistName },
      { label: 'ISRC', value: work?.isrc },
      { label: 'UPC', value: work?.upc },
      { label: 'Release date', value: work?.releaseDate },
      { label: 'Distributor', value: work?.distributor },
      { label: 'Delivery platforms', value: work?.platforms },
    ];

    const found = fields.filter((field) => present(field.value));
    const missing = fields.filter((field) => !present(field.value));
    const score = Math.round((found.length / fields.length) * 100);

    return {
      id: 'metadata',
      label: 'Metadata',
      blocking: true,
      state: this.stateFor(score),
      score,
      // Only a catalogue record with real identifiers counts as confirmed.
      provenance: work?.isrc && work?.upc ? 'verified' : 'inferred',
      evidence: work
        ? [`Catalogue entry "${work.title}" matched this release.`]
        : [],
      gaps: missing.map((field) => this.metadataGap(field.label)),
    };
  }

  private rightsCheck(
    profile: UserProfile | null | undefined,
    release: ReleaseProject,
    work: CatalogWork | null
  ): ReadinessCheck {
    const p: any = profile ?? {};
    const proName = release.credits?.proName || p.proName;
    const proIpi = release.credits?.proIpi || p.proIpi;
    const collaborators = release.credits?.collaborators ?? [];
    const hasSplitDocument =
      present(release.splitSheetRef) ||
      Boolean(work?.splitSheetRef) ||
      present(p.legalInfrastructure?.hasStandardSplitSheet) &&
        p.legalInfrastructure?.hasStandardSplitSheet !== 'Never';

    const fields = [
      { label: 'PRO affiliation', value: proName, gap: 'Register the release with a PRO (ASCAP, BMI, or equivalent).' },
      { label: 'PRO IPI', value: proIpi, gap: 'Add the IPI number from the PRO account.' },
    ];
    if (collaborators.length) {
      fields.push({
        label: 'Split document',
        value: hasSplitDocument ? 'on file' : '',
        gap: `Document the splits for ${collaborators.length} collaborator${collaborators.length === 1 ? '' : 's'} before release.`,
      });
    }

    const found = fields.filter((field) => present(field.value));
    const missing = fields.filter((field) => !present(field.value));
    const score = Math.round((found.length / fields.length) * 100);

    return {
      id: 'rights',
      label: 'Rights',
      blocking: true,
      state: this.stateFor(score),
      score,
      provenance: 'inferred',
      evidence: [
        ...found.map((field) => `${field.label} is recorded.`),
        ...(present(release.splitSheetRef)
          ? [`Split reference recorded on the release: "${release.splitSheetRef}".`]
          : []),
      ],
      gaps: missing.map((field) => field.gap),
    };
  }

  private campaignCheck(release: ReleaseProject): ReadinessCheck {
    const attached = present(release.marketingCampaignId);
    return {
      id: 'campaign',
      label: 'Campaign',
      blocking: false,
      state: attached ? 'ready' : 'not-ready',
      score: attached ? 100 : 0,
      provenance: 'inferred',
      evidence: attached
        ? ['A marketing campaign is attached to this release.']
        : [],
      gaps: attached
        ? []
        : ['Attach a campaign so the release has a plan beyond delivery.'],
    };
  }

  /**
   * Always unscored. The release project has no planned date field, and there is
   * no audience, catalogue-momentum, or DSP feed to judge timing against, so any
   * number here would be invented.
   */
  private timingCheck(work: CatalogWork | null): ReadinessCheck {
    return {
      id: 'timing',
      label: 'Market timing',
      blocking: false,
      state: 'insufficient-data',
      score: null,
      provenance: 'missing',
      evidence: work?.releaseDate
        ? [`The catalogue records ${work.releaseDate} as this release's date.`]
        : [],
      gaps: [
        'Timing is not scored: the release project has no planned date, and no audience or catalogue-momentum signal exists to compare it with.',
      ],
    };
  }

  private stateFor(score: number): ReadinessState {
    if (score === 100) return 'ready';
    return score > 0 ? 'almost' : 'not-ready';
  }

  private metadataGap(label: string): string {
    if (DELIVERY_IDENTIFIERS.includes(label)) {
      return `Add the ${label.toLowerCase()} a distributor requires.`;
    }
    return `Complete the ${label.toLowerCase()} on the release.`;
  }

  private verdict(
    state: ReadinessState,
    release: ReleaseProject,
    blockingGaps: string[],
    checks: ReadinessCheck[]
  ): string {
    if (state === 'insufficient-data') {
      return `There is not enough on "${release.name}" to judge readiness yet.`;
    }
    if (state === 'not-ready') {
      const extra =
        blockingGaps.length > 1
          ? ` and ${blockingGaps.length - 1} more gap${blockingGaps.length - 1 === 1 ? '' : 's'}`
          : '';
      return `This release is not ready to push: ${blockingGaps[0]}${extra}`;
    }
    if (state === 'ready') {
      const timing = checks.find((check) => check.id === 'timing');
      return `This release is deliverable and has a campaign behind it.${
        timing?.score === null ? ' Market timing could not be assessed.' : ''
      }`;
    }
    return 'This release can be delivered, but the campaign behind it is not in place yet.';
  }

  private notes(
    work: CatalogWork | null,
    checks: ReadinessCheck[]
  ): string[] {
    const notes = [
      'Readiness is computed from the release project and the artist catalogue. No distributor, DSP, royalty, or analytics feed is connected, so delivery and campaign performance are never confirmed by a platform.',
      'Checks the app cannot score are reported as insufficient data and left out of the overall score rather than counted as zero.',
    ];
    if (!work) {
      notes.push(
        'No catalogue entry matched this release name, so identifiers, date, and distributor are judged from the release project alone.'
      );
    }
    const unscored = checks.filter((check) => check.score === null).length;
    if (unscored) {
      notes.push(
        `${unscored} of ${checks.length} checks have no data to score.`
      );
    }
    return notes;
  }
}
