import { Injectable } from '@angular/core';
import { UserProfile } from './user-profile.service';
import {
  GrowthDimension,
  GrowthReadiness,
} from '../types/growth-readiness.types';

/**
 * Reads the growth signals a profile can actually hold.
 *
 * Every dimension is answered from a named field: no listener counts, no
 * follower estimates, no conversion model. A dimension with nothing recorded is
 * `missing` rather than scored, and a dimension with one half present is
 * `partial` with the missing half named — "you have platform profiles but no
 * channel you own" is the useful answer, not 50%.
 */
@Injectable({ providedIn: 'root' })
export class GrowthReadinessService {
  assess(profile: UserProfile | null | undefined): GrowthReadiness {
    const p: any = profile ?? {};
    const journey: any = p.musicalJourney ?? {};
    const blueprint: any = journey.musicBlueprint ?? {};
    const touring: any = p.touringDetails ?? {};
    const text = (value: unknown): string =>
      typeof value === 'string' ? value.trim() : '';
    const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
    const cap = (value: string, max = 110): string =>
      value.length > max ? `${value.slice(0, max - 1)}…` : value;

    const audience = text(blueprint.audienceProfile);
    const website = text(p.website);
    const contentStrategy = text(journey.contentStrategy);
    const collaborationGoals = text(journey.collaborationGoals);
    // `initialProfile` seeds 'Organic', which is not one of the questionnaire's
    // answer values ('Organic Only', 'Paid Growth', …). Counting the seed as a
    // declared cadence would claim a decision the artist never made.
    const cadence = contentStrategy === 'Organic' ? '' : contentStrategy;
    const performances = this.count(p.performancesPerYear);
    const tourReady = text(touring.isTourReady) || 'Studio Only';
    const press = list(p.pressGallery).filter((item) => Boolean(item));
    const links = list(p.officialArtistProfiles);
    const verifiedLinks = links.filter((link: any) => link?.verified === true);
    const tourReadyEnough = tourReady !== 'Studio Only';

    const dimensions: GrowthDimension[] = [
      {
        id: 'audience',
        label: 'Named audience',
        why: 'Growth starts from a named listener. Without one, promotion aims at a genre.',
        state: audience ? 'evidenced' : 'missing',
        evidence: audience ? [cap(audience)] : [],
        gap: audience
          ? null
          : 'Describe who the music is for, and the moment they reach for it.',
        recordedWith: 'questionnaire',
      },
      {
        id: 'owned-channel',
        label: 'Owned channel',
        why: 'A site or list survives an algorithm change. A platform profile does not.',
        state: website ? 'evidenced' : links.length ? 'partial' : 'missing',
        evidence: website
          ? [cap(website)]
          : links.length
            ? [
                `${links.length} official profile${links.length === 1 ? '' : 's'} recorded, ${verifiedLinks.length} verified — none is a channel you own.`,
              ]
            : [],
        gap: website
          ? null
          : 'Stand up a page with the music and one sign-up field, then point every bio at it.',
        recordedWith: 'profile',
      },
      {
        id: 'content-cadence',
        label: 'Content cadence',
        why: 'A declared cadence is what makes audience work repeatable instead of occasional.',
        state: cadence ? 'evidenced' : 'missing',
        evidence: cadence ? [cap(cadence)] : [],
        gap: cadence
          ? null
          : 'Decide the posting rhythm you can sustain and write it down.',
        recordedWith: 'questionnaire',
      },
      {
        id: 'live',
        label: 'Live readiness',
        why: 'Live is where the material is tested and where the first real fans come from.',
        state: performances > 0 && tourReadyEnough ? 'evidenced' : performances > 0 || tourReadyEnough ? 'partial' : 'missing',
        evidence: [
          ...(performances > 0 ? [`${performances} performances per year recorded.`] : []),
          ...(tourReadyEnough ? [`Tour readiness: ${tourReady}.`] : []),
        ],
        gap:
          performances > 0 && tourReadyEnough
            ? null
            : performances > 0
              ? 'Record how ready the live show is — studio-only is an answer, not a failure.'
              : 'Play one small room — an open mic counts — and record it.',
        recordedWith: 'profile',
      },
      {
        id: 'collaboration',
        label: 'Collaboration direction',
        why: 'Collaboration reaches rooms and audiences the artist does not have yet.',
        state: collaborationGoals ? 'evidenced' : 'missing',
        evidence: collaborationGoals ? [cap(collaborationGoals)] : [],
        gap: collaborationGoals
          ? null
          : 'Name who the artist wants to work with and what each one unlocks.',
        recordedWith: 'questionnaire',
      },
      {
        id: 'press',
        label: 'Press assets',
        why: 'Press assets are what a promoter, journalist, or sync supervisor asks for first.',
        state: press.length ? 'evidenced' : 'missing',
        evidence: press.length
          ? [`${press.length} press image${press.length === 1 ? '' : 's'} on record.`]
          : [],
        gap: press.length
          ? null
          : 'Add a small set of images a promoter can use without asking.',
        recordedWith: 'profile',
      },
    ];

    const evidenced = dimensions.filter((entry) => entry.state === 'evidenced').length;
    const partial = dimensions.filter((entry) => entry.state === 'partial').length;

    const notes = [
      'This inventory counts what is recorded on the profile. No listener, follower, or conversion feed is connected, so nothing here is a measured audience.',
    ];
    if (evidenced === 0) {
      notes.push(
        'No growth signal is recorded yet, so every dimension is reported as missing rather than assumed to be weak.'
      );
    } else if (partial > 0) {
      notes.push(
        `${partial} dimension${partial === 1 ? '' : 's'} ${partial === 1 ? 'is' : 'are'} only half recorded; the missing half is named rather than averaged into a score.`
      );
    }

    return {
      dimensions,
      evidenced,
      partial,
      total: dimensions.length,
      notes,
    };
  }

  /** `'22'`, `'22 shows'` and `22` all resolve; anything unreadable is zero. */
  private count(value: unknown): number {
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    if (typeof value !== 'string') return 0;
    const parsed = Number(value.replace(/[^0-9.]/g, ''));
    return Number.isFinite(parsed) ? parsed : 0;
  }
}
