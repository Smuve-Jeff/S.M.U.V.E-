import { Injectable } from '@angular/core';
import { UserProfile } from './user-profile.service';
import { ReleaseProject } from '../types/release.types';
import {
  ReadinessCheck,
  ReadinessState,
  ReleaseReadiness,
} from '../types/release-readiness.types';
import { findCatalogWork } from './release-split.util';
import {
  findReleaseDateMismatch,
  parseReleaseDay,
  releaseDateMismatchMessage,
} from './release-window.util';

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
    release: ReleaseProject | null | undefined,
    now: Date = new Date()
  ): ReleaseReadiness {
    const generatedAt = now.toISOString();

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

    const work = findCatalogWork(profile, release) as CatalogWork | null;
    const checks: ReadinessCheck[] = [
      this.productionCheck(release),
      this.metadataCheck(release, work),
      this.rightsCheck(profile, release, work),
      this.campaignCheck(profile, release),
      this.timingCheck(release, work, now),
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

  /**
   * The release only counts as having a campaign if that campaign still exists.
   * A reference to a deleted campaign is worse than no reference: it would read
   * as a plan while the profile holds nothing behind it.
   */
  private campaignCheck(
    profile: UserProfile | null | undefined,
    release: ReleaseProject
  ): ReadinessCheck {
    const id = (release.marketingCampaignId || '').trim();
    const campaigns = ((profile as any)?.marketingCampaigns ?? []) as Array<{
      id?: string;
      name?: string;
    }>;
    const campaign = id ? campaigns.find((entry) => entry.id === id) : undefined;

    if (campaign) {
      return {
        id: 'campaign',
        label: 'Campaign',
        blocking: false,
        state: 'ready',
        score: 100,
        provenance: 'inferred',
        evidence: [`Campaign "${campaign.name || campaign.id}" is attached.`],
        gaps: [],
      };
    }

    return {
      id: 'campaign',
      label: 'Campaign',
      blocking: false,
      state: 'not-ready',
      score: 0,
      provenance: 'inferred',
      evidence: id
        ? [`release.marketingCampaignId = "${id}"`]
        : [],
      gaps: [
        id
          ? 'The campaign this release points at is not in the profile any more. Attach a campaign that exists.'
          : 'Attach a campaign so the release has a plan beyond delivery.',
      ],
    };
  }

  /**
   * Scores the artist's planned release date as delivery runway. The score is a
   * policy over the time remaining — four weeks or more, two weeks, one week,
   * this week — not a prediction about audience or market conditions, and the
   * evidence says so. The catalogue date is the fallback when no planned date
   * is recorded, and no date at all stays unscored rather than guessed.
   */
  private timingCheck(
    release: ReleaseProject,
    work: CatalogWork | null,
    now: Date
  ): ReadinessCheck {
    const planned = (release.plannedReleaseDate || '').trim();
    const catalogue = (work?.releaseDate || '').trim();
    const date = planned || catalogue;
    const source = planned ? 'planned release date' : 'catalogue release date';

    if (!date) {
      return {
        id: 'timing',
        label: 'Market timing',
        blocking: false,
        state: 'insufficient-data',
        score: null,
        provenance: 'missing',
        evidence: [],
        gaps: [
          'Set a planned release date on the release. Until a date is recorded, timing cannot be scored.',
        ],
      };
    }

    const parsed = parseReleaseDay(date);
    if (parsed === null) {
      return {
        id: 'timing',
        label: 'Market timing',
        blocking: false,
        state: 'not-ready',
        score: 0,
        provenance: 'inferred',
        evidence: [
          `The ${source} "${date}" cannot be read as a calendar date.`,
        ],
        gaps: [
          `Replace "${date}" with a calendar date (YYYY-MM-DD) so timing can be scored.`,
        ],
      };
    }

    const dateLabel = planned
      ? `Planned date ${date}`
      : `Catalogue date ${date}`;
    const mismatch = findReleaseDateMismatch(planned, catalogue);
    const mismatchGap = mismatch
      ? releaseDateMismatchMessage(mismatch)
      : null;
    const mismatchEvidence = mismatch
      ? `The planned date ${mismatch.planned} and catalogue date ${mismatch.catalogue} are different days.`
      : null;

    if (release.status === 'Released') {
      return {
        id: 'timing',
        label: 'Market timing',
        blocking: false,
        state: 'ready',
        score: 100,
        provenance: 'inferred',
        evidence: [
          `${dateLabel} is recorded and the release is marked Released; there is no forward window left to score.`,
          ...(mismatchEvidence ? [mismatchEvidence] : []),
        ],
        gaps: mismatchGap ? [mismatchGap] : [],
      };
    }

    const days = Math.ceil((parsed - now.getTime()) / 86_400_000);

    if (days < 0) {
      return {
        id: 'timing',
        label: 'Market timing',
        blocking: false,
        state: 'not-ready',
        score: 0,
        provenance: 'inferred',
        evidence: [
          `${dateLabel} passed ${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} ago.`,
          ...(mismatchEvidence ? [mismatchEvidence] : []),
        ],
        gaps: [
          ...(mismatchGap ? [mismatchGap] : []),
          `The ${source} ${date} has passed while the release is still ${release.status}. Set a new date or mark the release released.`,
        ],
      };
    }

    // Delivery-runway bands, stated once here rather than inferred per call.
    const score = days >= 28 ? 100 : days >= 14 ? 75 : days >= 7 ? 50 : 25;
    const runway =
      days === 0 ? 'today' : `${days} day${days === 1 ? '' : 's'} away`;

    return {
      id: 'timing',
      label: 'Market timing',
      blocking: false,
      state: this.stateFor(score),
      score,
      provenance: 'inferred',
      evidence: [
        `${dateLabel} is ${runway}.`,
        ...(mismatchEvidence ? [mismatchEvidence] : []),
        'Scored on delivery runway only; no audience, DSP, or catalogue-momentum feed is connected.',
      ],
      gaps: [
        ...(mismatchGap ? [mismatchGap] : []),
        ...(score === 100
          ? []
          : [
              `Only ${days} day${days === 1 ? '' : 's'} remain${days === 1 ? 's' : ''} before the ${source}. Move the date or confirm the remaining work is finished.`,
            ]),
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
      const timingNote =
        timing?.score === null
          ? ' Market timing could not be assessed.'
          : timing?.gaps?.[0]
            ? ` ${timing.gaps[0]}`
            : '';
      return `This release is deliverable and has a campaign behind it.${timingNote}`;
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
        'No catalogue work is linked to this release and no entry matched its name, so identifiers, date, and distributor are judged from the release project alone. Link the release to its catalogue work to carry them over.'
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
