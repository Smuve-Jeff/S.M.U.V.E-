/**
 * Sprint B4 — Career pipeline in-DAW type contracts.
 *
 * `DistributionMetadata` mirrors what DSPs (Spotify, Apple Music, Tidal,
 * Amazon, etc.) require on first upload. `RevenueForecast` is a three-tier
 * estimate (low/mid/high) derived from genre momentum and audience tier.
 * `OutreachPacket` is a copy/paste-able label-curator pitch with a subject
 * + body + CTA. `CareerCharter` is the top-level wrapper we save to the
 * user profile when the user commits a charter for a release.
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

export interface RevenueForecast {
  monthlyStreamsLow: number;
  monthlyStreamsMid: number;
  monthlyStreamsHigh: number;
  yearlyRevenueLow: number;
  yearlyRevenueMid: number;
  yearlyRevenueHigh: number;
  /** 0..1 — how fast this genre is moving on DSPs this quarter. */
  genreMomentumScore: number;
  /** Genre-relative audience tier driven by momentum + artist metadata. */
  marketTier: 'indie' | 'mid' | 'mainstream';
  notes: string[];
}

export interface OutreachPacket {
  subject: string;
  body: string;
  callToAction: string;
  generatedAt: number;
  /** Suggested first-pass target list size (curators + blogs + playlists). */
  targetListSize: number;
  /** Body in markdown copy shape — the body field already wraps paragraphs
   *  with blank lines, but this flag hints the UI to render rich text. */
  renderAsMarkdown: boolean;
}

export interface CareerCharter {
  id: string;
  releaseId: string;
  createdAt: number;
  status: 'draft' | 'committed';
  metadataDraft: DistributionMetadata;
  forecast: RevenueForecast;
  outreach: OutreachPacket;
  genreTags: string[];
}
