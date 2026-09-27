import { Injectable, inject } from '@angular/core';
import { UserProfile } from './user-profile.service';
import {
  ArtistOnlineFingerprintService,
  ExperienceTrack,
} from './artist-online-fingerprint.service';

/**
 * How one genre family actually releases, markets, and gets paid. The registry
 * pathway is written generically; the lens is what makes it read like it was
 * written for THIS artist's genre instead of a template.
 */
export interface GenreLens {
  family: string;
  /** How this genre typically releases work. */
  cadence: string;
  /** Where the audience actually is, in claim order — registry destination ids. */
  channels: Array<{ id: string; label: string }>;
  /** The identifier/rights trap this genre falls into most often. */
  rightsNote: string;
  /** What "monitoring" means before the numbers get big. */
  monitorNote: string;
}

/** One concrete move on the registry pathway, with its current state. */
export interface RegistryPhaseStep {
  title: string;
  detail: string;
  /** Real sign-up page from the online-fingerprint registry, when there is one. */
  destinationId?: string;
  done: boolean;
}

export interface RegistryPhase {
  id: string;
  title: string;
  /** What this phase means for this genre and this journey. */
  summary: string;
  steps: RegistryPhaseStep[];
}

/**
 * The concrete registry pathway: from a brand-new musical journey to a fully
 * official online music fingerprint, in the order the industry actually wants
 * it, tuned to the artist's genre and profile build.
 */
export interface RegistryPathway {
  track: ExperienceTrack;
  genre: string;
  lens: GenreLens;
  /** One line tying the pathway to the artist's own recorded journey. */
  journeyNote: string;
  phases: RegistryPhase[];
  /** The single first move — the first unfinished step in order. */
  nextMove: string;
}

/** Genre families, matched against genre + subgenres + roles, lower-cased. */
const GENRE_LENSES: Array<{ match: RegExp; lens: GenreLens }> = [
  {
    match: /hip ?hop|rap|trap|drill|phonk|grime|boom ?bap/,
    lens: {
      family: 'Hip Hop & Rap',
      cadence: 'singles and mixtapes on a rolling cadence',
      channels: [
        { id: 'spotify-for-artists', label: 'Spotify for Artists' },
        { id: 'youtube-for-artists', label: 'YouTube for Artists' },
        { id: 'audiomack', label: 'Audiomack' },
        { id: 'soundcloud-for-artists', label: 'SoundCloud for Artists' },
      ],
      rightsNote:
        'Beat licences, features, and producer points are the usual dispute here — lock the splits and the ISRC before anything leaks.',
      monitorNote:
        'YouTube Content ID claims and Audiomack plays are the earliest signals in this genre — watch them before monthly listeners move.',
    },
  },
  {
    match: /r&b|soul|neo.?soul|gospel|funk|quiet storm/,
    lens: {
      family: 'R&B, Soul & Gospel',
      cadence: 'a lead single, then the project it belongs to',
      channels: [
        { id: 'spotify-for-artists', label: 'Spotify for Artists' },
        { id: 'apple-music-for-artists', label: 'Apple Music for Artists' },
        { id: 'youtube-for-artists', label: 'YouTube for Artists' },
        { id: 'bandcamp', label: 'Bandcamp' },
      ],
      rightsNote:
        'Live and session musicians appear fast in this genre — a signed split sheet per session keeps the master clean.',
      monitorNote:
        'Playlist adds and Shazam tags move first; read Apple Shazam data alongside Spotify saves.',
    },
  },
  {
    match: /pop|k.?pop|city.?pop|synth.?pop|indie.?pop|dance.?pop/,
    lens: {
      family: 'Pop',
      cadence: 'singles first, pitched three to four weeks ahead of release',
      channels: [
        { id: 'spotify-for-artists', label: 'Spotify for Artists' },
        { id: 'apple-music-for-artists', label: 'Apple Music for Artists' },
        { id: 'youtube-for-artists', label: 'YouTube for Artists' },
      ],
      rightsNote:
        'Co-writes are the norm — every session needs a split sheet and every release an ISRC before the pitch window.',
      monitorNote:
        'Editorial pitching is time-sensitive: monitor saves and skip rate in the first week, then adjust the next single.',
    },
  },
  {
    match:
      /edm|house|techno|trance|drum ?(&|and) ?bass|dubstep|garage|lo-?fi|\bbeats\b|ambient|electronic|synthwave|disco/,
    lens: {
      family: 'Electronic & Producer',
      cadence: 'singles and remix packs, often self-released',
      channels: [
        { id: 'soundcloud-for-artists', label: 'SoundCloud for Artists' },
        { id: 'spotify-for-artists', label: 'Spotify for Artists' },
        { id: 'bandcamp', label: 'Bandcamp' },
        { id: 'tidal-artist-home', label: 'TIDAL Artist Home' },
      ],
      rightsNote:
        'A remix is its own recording with its own ISRC — and the underlying composition still owes the original writers.',
      monitorNote:
        'DJ support and repost networks lead the curve here; track SoundCloud plays and playlist adds before streams.',
    },
  },
  {
    match: /rock|metal|punk|alternative|grunge|indie|emo|shoegaze/,
    lens: {
      family: 'Rock & Alternative',
      cadence: 'EPs and albums built around a release show',
      channels: [
        { id: 'spotify-for-artists', label: 'Spotify for Artists' },
        { id: 'apple-music-for-artists', label: 'Apple Music for Artists' },
        { id: 'bandcamp', label: 'Bandcamp' },
        { id: 'youtube-for-artists', label: 'YouTube for Artists' },
      ],
      rightsNote:
        'Band members come and go — keep the split sheet and the ISRC ownership named to the entity, not the line-up.',
      monitorNote:
        'Live shows drive the streams in this genre: time the analytics reads around the show calendar.',
    },
  },
  {
    match: /country|americana|bluegrass|folk|singer.?songwriter|acoustic|roots/,
    lens: {
      family: 'Country, Folk & Songwriter',
      cadence: 'singles with a story, then the album cycle',
      channels: [
        { id: 'spotify-for-artists', label: 'Spotify for Artists' },
        { id: 'apple-music-for-artists', label: 'Apple Music for Artists' },
        { id: 'bandcamp', label: 'Bandcamp' },
        { id: 'youtube-for-artists', label: 'YouTube for Artists' },
      ],
      rightsNote:
        'Songwriting is the asset here — the ISWC matters as much as the ISRC, and publishing administration pays long after the release.',
      monitorNote:
        'Sync placements and radio spins are the real trackers — link the PRO early and read its statements quarterly.',
    },
  },
  {
    match:
      /jazz|blues|classical|orchestral|chamber|instrumental|piano|contemporary classical|opera/,
    lens: {
      family: 'Jazz, Classical & Instrumental',
      cadence: 'works and albums rather than singles',
      channels: [
        { id: 'apple-music-for-artists', label: 'Apple Music for Artists' },
        { id: 'spotify-for-artists', label: 'Spotify for Artists' },
        { id: 'youtube-for-artists', label: 'YouTube for Artists' },
        { id: 'bandcamp', label: 'Bandcamp' },
      ],
      rightsNote:
        'Compositions are the catalogue here — register each work for an ISWC and keep performer credits precise.',
      monitorNote:
        'Performance income comes from concert and broadcast reporting; keep the works registered before the season starts.',
    },
  },
  {
    match:
      /latin|reggaeton|salsa|bachata|afro|afrobeats|dancehall|reggae|soca|cumbia|bongo/,
    lens: {
      family: 'Latin, Afro & Caribbean',
      cadence: 'high-cadence singles with remix and feature versions',
      channels: [
        { id: 'youtube-for-artists', label: 'YouTube for Artists' },
        { id: 'spotify-for-artists', label: 'Spotify for Artists' },
        { id: 'audiomack', label: 'Audiomack' },
        { id: 'amazon-for-artists', label: 'Amazon Music for Artists' },
      ],
      rightsNote:
        'Features and versions multiply fast — one ISRC per version and one split sheet per session, no exceptions.',
      monitorNote:
        'YouTube and Audiomack lead discovery across these markets; monitor them before the US-first dashboards move.',
    },
  },
];

const DEFAULT_GENRE_LENS: GenreLens = {
  family: 'Independent',
  cadence: 'a finished single first, then whatever the journey is building toward',
  channels: [
    { id: 'spotify-for-artists', label: 'Spotify for Artists' },
    { id: 'apple-music-for-artists', label: 'Apple Music for Artists' },
    { id: 'youtube-for-artists', label: 'YouTube for Artists' },
  ],
  rightsNote:
    'Identifiers and split sheets are genre-neutral: every recording needs an ISRC and every composition an ISWC.',
  monitorNote:
    'Pick one measurement source and read it on a fixed schedule — comparable data beats more data.',
};

/**
 * Turns a profile into the concrete registry pathway from a brand-new musical
 * journey to an official online music fingerprint.
 *
 * Two kinds of artist use it:
 * - someone with **nothing** official yet, who needs the ordered moves from a
 *   first name and a first song to registered, monitored, claimable presence, and
 * - someone with **existing** official profiles, who needs the remaining gaps
 *   named precisely (identifiers, collectors, unmonitored works).
 *
 * The pathway adapts to the genre family and the recorded journey, so a hip hop
 * artist chasing a rolling single cadence and a classical composer registering
 * works do not read the same roadmap.
 */
@Injectable({ providedIn: 'root' })
export class ArtistRegistryPathwayService {
  private fingerprint = inject(ArtistOnlineFingerprintService);

  /** How this artist's genre actually releases, markets, and gets paid. */
  genreLens(profile: UserProfile | null | undefined): GenreLens {
    const p: any = profile || {};
    const journey: any = p.musicalJourney || {};
    const haystack = [
      p.primaryGenre,
      ...(Array.isArray(journey.subgenres) ? journey.subgenres : []),
      ...(Array.isArray(journey.roles) ? journey.roles : []),
    ]
      .join(' ')
      .toLowerCase();
    const match = GENRE_LENSES.find((entry) => entry.match.test(haystack));
    return match ? match.lens : DEFAULT_GENRE_LENS;
  }

  /** The ordered pathway, tuned to genre, journey, and current evidence. */
  registryPathway(profile: UserProfile | null | undefined): RegistryPathway {
    const p: any = profile || {};
    const journey: any = p.musicalJourney || {};
    const text = (value: any): string =>
      typeof value === 'string' ? value.trim() : '';
    const lens = this.genreLens(profile);
    const readout = this.fingerprint.readout(profile as UserProfile);
    const uplink = this.fingerprint.catalogUplink(profile as UserProfile);

    const linkedIds = new Set(
      readout.linked
        .map((entry) => entry.destination?.id)
        .filter(Boolean) as string[]
    );
    const hasLink = (id: string) => linkedIds.has(id);
    const hasDelivery =
      hasLink('distrokid') ||
      hasLink('tunecore') ||
      hasLink('cdbaby') ||
      hasLink('amuse') ||
      hasLink('unitedmasters') ||
      hasLink('symphonic') ||
      uplink.totals.delivered > 0;
    const anyWorkIdentified =
      uplink.totals.withIsrc + uplink.totals.withIswc + uplink.totals.withUpc > 0;
    const dashboards = readout.coverage.find(
      (entry) => entry.category === 'for-artists'
    );
    const analytics = readout.coverage.find(
      (entry) => entry.category === 'analytics'
    );
    const legal: any = p.legalInfrastructure || {};
    const proAffiliation = text(legal.proAffiliation);
    const hasPro = proAffiliation !== '' && proAffiliation !== 'None';
    const primaryChannel = lens.channels[0];
    const worksIdentified = (which: 'withIsrc' | 'withIswc' | 'withUpc') =>
      uplink.totals.works > 0 && uplink.totals[which] === uplink.totals.works;

    const phases: RegistryPhase[] = [
      {
        id: 'official-identity',
        title: 'Lock the official identity',
        summary: `In ${lens.family}, everything is filed under one name — fix ${
          text(p.artistName) || 'the artist name'
        } before anything is registered.`,
        steps: [
          {
            title: 'Fix the artist name everywhere',
            detail:
              'One spelling on the profile, the stores, and the rights organisation. Every later registration is filed against it.',
            done: Boolean(text(p.artistName)),
          },
          {
            title: 'Write the origin story',
            detail:
              'Press, pitches, and platforms repeat whatever story exists — write the one only this artist can tell.',
            done: Boolean(
              text(journey.originStory) || text(journey.artistNameMeaning)
            ),
          },
          {
            title: 'Define the signature',
            detail:
              'Name the sound and the delivery so the fingerprint is recognisable before it is official.',
            done: Boolean(text(journey.signatureSound)),
          },
        ],
      },
      {
        id: 'work-identifiers',
        title: 'Give the work its official identifiers',
        summary: lens.rightsNote,
        steps: [
          {
            title: 'Assign an ISRC to every recording',
            detail:
              'The ISRC is the recording’s legal identity. A distributor assigns one per track — keep it in the catalog uplink.',
            destinationId: 'distrokid',
            done: worksIdentified('withIsrc'),
          },
          {
            title: 'Register the compositions for ISWC codes',
            detail:
              'The ISWC identifies the song itself. The PRO or a publishing administrator issues it.',
            destinationId: 'ascap',
            done: worksIdentified('withIswc'),
          },
          {
            title: 'Record the release UPC',
            detail:
              'The UPC identifies the release the work ships on — it is how stores and charts count it.',
            done: worksIdentified('withUpc'),
          },
        ],
      },
      {
        id: 'delivery-dsp',
        title: 'Deliver and claim the DSP uplinks',
        summary: `For ${lens.family}, the shape is ${lens.cadence}. Deliver through one distributor, then claim the dashboards where this audience actually listens.`,
        steps: [
          {
            title: 'Open the distributor account',
            detail:
              'Nothing is official anywhere until one release is delivered — this is the door to every store.',
            destinationId: 'amuse',
            done: hasDelivery,
          },
          {
            title: `Claim ${primaryChannel.label} first`,
            detail:
              'Claim the artist profile the day the release goes live, before anyone else can.',
            destinationId: primaryChannel.id,
            done: hasLink(primaryChannel.id),
          },
          {
            title: 'Claim the remaining DSP uplinks',
            detail:
              'Spotify, Apple, TIDAL, SoundCloud, YouTube and the rest — every store the music is live on should have a claimed dashboard.',
            done:
              (dashboards?.present ?? 0) >=
              Math.min(lens.channels.length, dashboards?.total ?? 0),
          },
        ],
      },
      {
        id: 'rights-collectors',
        title: 'Register the rights and the collectors',
        summary:
          'Performance, digital-performance, and mechanical royalties are three different doors — a PRO opens one, SoundExchange and The MLC open the other two.',
        steps: [
          {
            title: 'Join a PRO and get an IPI',
            detail:
              'ASCAP, BMI or AllTrack in the US; the local society elsewhere. Free to join, no catalogue required.',
            destinationId: 'ascap',
            done: hasPro && Boolean(text(p.proIpi) || text(p.proName)),
          },
          {
            title: 'Register the works with the PRO',
            detail:
              'An unregistered work earns nothing when it is played — register each title against the membership.',
            done: legal.hasRegisteredWorks === true,
          },
          {
            title: 'Register the masters with SoundExchange',
            detail:
              'Non-interactive streams (satellite and web radio) pay the master owner here, not through the PRO.',
            destinationId: 'soundexchange',
            done: hasLink('soundexchange'),
          },
          {
            title: 'Claim the account with The MLC',
            detail:
              'US mechanical royalties on every stream are collected here — unclaimed, they stay in the pool.',
            destinationId: 'the-mlc',
            done: hasLink('the-mlc'),
          },
        ],
      },
      {
        id: 'monitoring',
        title: 'Monitor the official fingerprint',
        summary: lens.monitorNote,
        steps: [
          {
            title: 'Link one analytics source',
            detail:
              'One measurement tool for every release, so growth is comparable over time instead of anecdotal.',
            destinationId: 'viberate',
            done: (analytics?.present ?? 0) > 0,
          },
          {
            title: 'Make every live work measurable',
            detail:
              'A live work with no dashboard or analytics source is invisible — S.M.U.V.E. can only monitor what is claimed.',
            done:
              uplink.totals.works > 0 &&
              uplink.totals.live > 0 &&
              uplink.totals.monitored === uplink.totals.live,
          },
          {
            title: 'Keep the catalog uplink complete',
            detail:
              'ISRC, ISWC, UPC, platforms, and ownership on every work — the registry is only as good as its last entry.',
            done: uplink.score === 100,
          },
        ],
      },
      {
        id: 'consolidation',
        title: 'Consolidate the official fingerprint',
        summary:
          'Verified links, a press kit, and clean ownership paperwork turn presence into something an A&R, a supervisor, or a promoter can act on.',
        steps: [
          {
            title: 'Verify every recorded link',
            detail:
              'An unverified link cannot be used as ownership evidence anywhere.',
            done:
              readout.linked.length > 0 &&
              readout.linked.every((entry) => entry.link?.verified === true),
          },
          {
            title: 'Build the press kit',
            detail:
              'Photos, bio, and contact in one place — the link sent to everyone who asks.',
            done: Array.isArray(p.pressGallery) && p.pressGallery.length > 0,
          },
          {
            title: 'Prepare for sync',
            detail:
              'Clean versions and instrumentals ready to license — the fastest money in most genres.',
            done: Boolean(
              p.syncDetails?.hasCleanVersions && p.syncDetails?.hasInstrumentals
            ),
          },
        ],
      },
    ];

    const firstOpen = phases
      .flatMap((phase) => phase.steps)
      .find((step) => !step.done);

    return {
      track: readout.track,
      genre: lens.family,
      lens,
      journeyNote: this.journeyNote(journey, anyWorkIdentified),
      phases,
      nextMove: firstOpen
        ? firstOpen.title
        : 'The fingerprint is complete — keep the registry current with every release.',
    };
  }

  /** One line tying the pathway to the journey the artist actually recorded. */
  private journeyNote(journey: any, started: boolean): string {
    const text = (value: any): string =>
      typeof value === 'string' ? value.trim() : '';
    const parts: string[] = [];
    const experience = text(journey.experienceLevel);
    const velocity = text(journey.releaseVelocity);
    const focus = text(journey.currentFocus);
    if (experience) parts.push(`${experience} artist`);
    if (velocity) parts.push(`${velocity.toLowerCase()} release cadence`);
    if (focus) parts.push(`current focus: ${focus}`);
    if (!parts.length) {
      return started
        ? 'Tuned to a new journey — complete the Artist DNA questionnaire and these steps sharpen to the artist.'
        : 'A brand-new journey — this pathway starts at the name and ends at a monitored, official fingerprint.';
    }
    return `Tuned to this journey — ${parts.join(' · ')}.`;
  }
}
