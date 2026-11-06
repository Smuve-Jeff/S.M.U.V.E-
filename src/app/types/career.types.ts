/**
 * Sprint B4 — Career pipeline in-DAW type contracts.
 *
 * `DistributionMetadata` mirrors what DSPs (Spotify, Apple Music, Tidal,
 * Amazon, etc.) require on first upload. `OutreachPacket` is a copy/paste-able
 * label-curator pitch with a subject + body + CTA. `CareerCharter` is the
 * top-level wrapper for a release.
 *
 * There is deliberately no revenue forecast: S.M.U.V.E. has no distributor,
 * DSP, or audience feed, so stream and revenue numbers would be invented.
 */
export interface DistributionMetadata {
  title: string;
  type: string;
  artistName: string;
  primaryGenre: string;
  releaseDate: string;
  language: string;
  explicit: boolean;
  copyright: string;
  upc?: string;
  isrc?: string;
  territories: string[];
  platforms: string[];
}

export interface OutreachPacket {
  subject: string;
  body: string;
  callToAction: string;
  generatedAt: number;
  /** Body in markdown copy shape — the body field already wraps paragraphs
   *  with blank lines, but this flag hints the UI to render rich text. */
  renderAsMarkdown: boolean;
}

/**
 * A label, sync agency or curator pitch the artist has actually sent.
 *
 * Persisted on the profile so the pipeline survives a reload and syncs with
 * the account. `date` is the ISO day the pitch was submitted.
 */
export type CareerPitchStatus = 'Pending' | 'Reviewing' | 'Signed' | 'Passed';

export interface CareerPitch {
  id: string;
  labelName: string;
  demoUrl: string;
  /** ISO date (yyyy-mm-dd) the pitch went out. */
  date: string;
  status: CareerPitchStatus;
  /** ISO day for the next touchpoint, when the artist has scheduled one. */
  followUpOn?: string;
  /** Bumped whenever the status or follow-up date changes. */
  updatedAt: number;
}

/** A room the artist is tracking for the live circuit. */
export type VenueBookingStatus = 'Available' | 'Pending' | 'Confirmed';

export interface CareerVenue {
  id: string;
  name: string;
  location: string;
  capacity: number;
  bookingStatus: VenueBookingStatus;
}

export interface CareerCharter {
  id: string;
  releaseId: string;
  createdAt: number;
  status: 'draft' | 'committed';
  metadataDraft: DistributionMetadata;
  outreach: OutreachPacket;
  genreTags: string[];
}
