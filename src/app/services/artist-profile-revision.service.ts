import { Injectable, computed, inject, signal } from '@angular/core';
import { UserProfileService, UserProfile } from './user-profile.service';

/** One profile signal that changed between S.M.U.V.E.'s reads. */
export interface ProfileRevisionChange {
  label: string;
  /** Readable previous value; empty when the field was not set. */
  from: string;
  /** Readable new value; empty when the field was cleared. */
  to: string;
}

export interface ProfileRevisionSource {
  id: string;
  label: string;
  detail?: string;
  at: number;
}

export interface ArtistProfileRevision {
  at: number;
  changes: ProfileRevisionChange[];
  summary: string;
  /** What caused the change, when the writer recorded it. */
  sources?: ProfileRevisionSource[];
}

/** A persisted revision, scoped to the artist whose profile changed. */
export interface ArtistProfileRevisionEntry extends ArtistProfileRevision {
  id: string;
  artistId: string;
  sources: ProfileRevisionSource[];
}

interface SnapshotValue {
  label: string;
  /** Lists stay lists so a reorder is not mistaken for a revision. */
  read: (profile: any) => string | string[];
  key: string;
}

interface CatalogueEntry {
  key: string;
  title: string;
  date: string;
}

interface ProfileSnapshot {
  values: Record<string, string | string[]>;
  catalog: CatalogueEntry[];
}

const STORAGE_PREFIX = 'smuve.profile.revision.v1';
const HISTORY_KEY = 'smuve.profile.revision.history.v1';
const SOURCE_PREFIX = 'smuve.profile.revision.sources.v1';
const HISTORY_LIMIT = 40;

const cap = (value: unknown, max = 120): string => {
  const text = String(value ?? '').trim();
  if (!text) return '';
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
};

const words = (value: unknown, max = 8): string[] => {
  if (Array.isArray(value)) {
    return value
      .map((item) => cap(item, 60))
      .filter(Boolean)
      .slice(0, max);
  }
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) return [];
  return text
    .split(/\r?\n|;/)
    .map((item) => cap(item, 60))
    .filter(Boolean)
    .slice(0, max);
};

const displayValue = (value: string | string[] | undefined): string =>
  Array.isArray(value) ? value.join(', ') : String(value ?? '');

/** List order is not a musical change; compare lists as sets. */
const valuesEqual = (
  before: string | string[] | undefined,
  after: string | string[] | undefined
): boolean => {
  const normalize = (value: string | string[] | undefined): string[] =>
    Array.isArray(value)
      ? [...value].sort((a, b) => a.localeCompare(b))
      : [String(value ?? '')];
  return JSON.stringify(normalize(before)) === JSON.stringify(normalize(after));
};

const bool = (value: unknown): string => {
  if (value === true || String(value).toLowerCase() === 'yes') return 'yes';
  if (value === false || String(value).toLowerCase() === 'no') return 'no';
  return cap(value, 40);
};

const expertiseRead = (profile: any): string => {
  const levels = profile?.expertise || {};
  const keys = [
    'production',
    'songwriting',
    'marketing',
    'business',
    'legal',
    'performance',
    'technical_mastery',
  ];
  const present = keys
    .map((key) => [key, Number(levels?.[key]) || 0] as const)
    .filter(([, value]) => value > 0)
    .map(([key, value]) => `${key} ${value}`);
  return present.join(', ');
};

/**
 * The profile signals S.M.U.V.E. actually adapts to. Settings, UI state and
 * unrelated profile fields are deliberately excluded: a revision should read
 * like a change to the artist's body, not a changelog of the whole vault.
 */
const FIELDS: SnapshotValue[] = [
  { key: 'artistName', label: 'artist name', read: (p) => cap(p?.artistName, 80) },
  { key: 'primaryGenre', label: 'primary genre', read: (p) => cap(p?.primaryGenre, 60) },
  {
    key: 'questionnaire',
    label: 'questionnaire',
    read: (p) => (p?.profileSetupCompleted === true ? 'complete' : 'in progress'),
  },
  {
    key: 'subgenres',
    label: 'subgenres',
    read: (p) => words(p?.musicalJourney?.subgenres, 4),
  },
  {
    key: 'influences',
    label: 'influences',
    read: (p) => words(p?.musicalJourney?.musicalInfluences, 6),
  },
  {
    key: 'signatureSound',
    label: 'signature sound',
    read: (p) => cap(p?.musicalJourney?.signatureSound, 120),
  },
  {
    key: 'delivery',
    label: 'vocal or instrument delivery',
    read: (p) => cap(p?.musicalJourney?.musicBlueprint?.vocalDelivery, 100),
  },
  {
    key: 'groove',
    label: 'rhythmic feel',
    read: (p) => cap(p?.musicalJourney?.musicBlueprint?.rhythmicFeel, 100),
  },
  {
    key: 'harmony',
    label: 'harmonic language',
    read: (p) => cap(p?.musicalJourney?.musicBlueprint?.harmonicLanguage, 100),
  },
  {
    key: 'arrangement',
    label: 'arrangement approach',
    read: (p) => cap(p?.musicalJourney?.musicBlueprint?.arrangementApproach, 100),
  },
  {
    key: 'nonNegotiables',
    label: 'sonic non-negotiables',
    read: (p) => cap(p?.musicalJourney?.musicBlueprint?.sonicNonNegotiables, 120),
  },
  {
    key: 'themes',
    label: 'lyrical themes',
    read: (p) => words(p?.musicalJourney?.musicBlueprint?.lyricalThemes, 6),
  },
  {
    key: 'references',
    label: 'reference tracks',
    read: (p) => words(p?.musicalJourney?.musicBlueprint?.referenceTracks, 6),
  },
  {
    key: 'audience',
    label: 'audience profile',
    read: (p) => cap(p?.musicalJourney?.musicBlueprint?.audienceProfile, 100),
  },
  {
    key: 'intent',
    label: 'artistic intent',
    read: (p) => cap(p?.musicalJourney?.musicBlueprint?.artisticIntent, 100),
  },
  {
    key: 'recognitionCue',
    label: 'recognition cue',
    read: (p) => cap(p?.musicalJourney?.musicBlueprint?.recognitionCue, 100),
  },
  {
    key: 'collaborationBoundaries',
    label: 'collaboration boundaries',
    read: (p) => cap(p?.musicalJourney?.musicBlueprint?.collaborationBoundaries, 100),
  },
  {
    key: 'focus',
    label: 'current focus',
    read: (p) => cap(p?.musicalJourney?.currentFocus, 100),
  },
  {
    key: 'challenge',
    label: 'biggest challenge',
    read: (p) => cap(p?.musicalJourney?.biggestChallenge, 100),
  },
  {
    key: 'successMetric',
    label: 'success metric',
    read: (p) => cap(p?.musicalJourney?.primarySuccessMetric, 80),
  },
  {
    key: 'velocity',
    label: 'release velocity',
    read: (p) => cap(p?.musicalJourney?.releaseVelocity, 60),
  },
  {
    key: 'streams',
    label: 'income streams',
    read: (p) => words(p?.musicalJourney?.incomeStreams, 6),
  },
  { key: 'expertise', label: 'expertise levels', read: (p) => expertiseRead(p) },
  {
    key: 'sync',
    label: 'sync readiness',
    read: (p) => cap(p?.syncDetails?.isSyncReady, 60),
  },
  {
    key: 'stems',
    label: 'stems and clearance',
    read: (p) =>
      [bool(p?.syncDetails?.hasStems), bool(p?.syncDetails?.oneStopClearance)]
        .filter(Boolean)
        .join(' / '),
  },
  {
    key: 'live',
    label: 'live routing',
    read: (p) =>
      [
        cap(p?.touringDetails?.isTourReady, 40),
        words(p?.touringDetails?.regions, 4).join(', '),
      ]
        .filter(Boolean)
        .join(' / '),
  },
  {
    key: 'registeredWorks',
    label: 'registered works',
    read: (p) => bool(p?.legalInfrastructure?.hasRegisteredWorks),
  },
  {
    key: 'pro',
    label: 'PRO affiliation',
    read: (p) => cap(p?.legalInfrastructure?.proAffiliation, 50),
  },
  {
    key: 'entity',
    label: 'business entity',
    read: (p) => (p?.legalInfrastructure?.isIncorporated === true ? 'yes' : 'no'),
  },
];

const catalogueEntries = (profile: any): CatalogueEntry[] => {
  const raw = Array.isArray(profile?.catalog) ? profile.catalog : [];
  return raw
    .filter((item: any) => item && typeof item === 'object')
    .map((item: any) => {
      const title = cap(item.title, 90);
      return {
        key: cap(item.id, 80) || `${title}|${cap(item.releaseDate, 40)}`,
        title,
        date: cap(item.releaseDate, 40),
      };
    })
    .sort((a: CatalogueEntry, b: CatalogueEntry) => a.key.localeCompare(b.key));
};

const formatValue = (value: string): string =>
  value ? `“${cap(value, 90)}”` : 'not set';

/**
 * S.M.U.V.E. remembers what it read, not just what it reads now.
 *
 * The first call establishes the baseline for an artist and reports nothing.
 * Later calls compare the live profile against that persisted baseline, so a
 * profile committed in another session, another tab, or through cloud sync is
 * noticed the next time the console opens. A revision is consumed exactly once.
 */
@Injectable({ providedIn: 'root' })
export class ArtistProfileRevisionService {
  private profileService = inject(UserProfileService);
  private readonly historyState = signal<ArtistProfileRevisionEntry[]>(
    this.readHistory()
  );

  /**
   * The current artist's revision history, newest first. Reading the profile
   * signal keeps the list scoped when an artist switches accounts on the same
   * browser; another artist's revisions never appear in this file.
   */
  readonly history = computed<ArtistProfileRevisionEntry[]>(() => {
    const artistId = this.profileService.profile()?.id || 'local';
    return this.historyState().filter((entry) => entry.artistId === artistId);
  });

  /** The latest revision without consuming it (for panels that only display). */
  peekChanges(): ArtistProfileRevision | null {
    const profile = this.profileService.profile();
    if (!profile) return null;
    const previous = this.readSnapshot(profile);
    if (!previous) return null;
    return this.compare(previous, this.snapshot(profile));
  }

  /**
   * Compares, persists the new baseline, and returns the revision once.
   * Returns null when this is the first read or nothing tracked changed.
   */
  takeChanges(): ArtistProfileRevision | null {
    const profile = this.profileService.profile();
    if (!profile) return null;
    const current = this.snapshot(profile);
    const previous = this.readSnapshot(profile);
    this.writeSnapshot(profile, current);
    if (!previous) {
      // First read: establish the baseline. Nothing can be attributed yet.
      this.takeSources(profile.id || 'local');
      return null;
    }
    const revision = this.compare(previous, current);
    if (revision) {
      this.record(profile, revision);
    } else {
      // A source mark with no revision is a failed or no-op write; do not let
      // it attach itself to the next unrelated change.
      this.takeSources(profile.id || 'local');
    }
    return revision;
  }

  /**
   * Marks what caused a successful profile write. Writers call this right
   * after the commit resolves and before the next read, so the revision can
   * name the questionnaire, the profile pane, or an archive import instead of
   * appearing as an anonymous diff.
   */
  markSource(source: { id: string; label: string; detail?: string }): void {
    const id = String(source?.id ?? '').trim();
    const label = String(source?.label ?? '').trim();
    if (!id || !label) return;
    const artistId = this.profileService.profile()?.id || 'local';
    const now = Date.now();
    const sources = this.readSources(artistId);
    const last = sources[sources.length - 1];
    // A pane can write several fields in one commit; keep one trigger per burst.
    if (last && last.id === id && now - last.at < 10_000) {
      last.at = now;
      if (source.detail) last.detail = String(source.detail).slice(0, 120);
    } else {
      sources.push({
        id,
        label: label.slice(0, 60),
        detail: source.detail ? String(source.detail).slice(0, 120) : undefined,
        at: now,
      });
    }
    this.writeSources(artistId, sources.slice(-10));
  }

  private sourceKey(artistId: string): string {
    return `${SOURCE_PREFIX}:${artistId}`;
  }

  private readSources(artistId: string): ProfileRevisionSource[] {
    if (typeof localStorage === 'undefined') return [];
    try {
      const raw = localStorage.getItem(this.sourceKey(artistId));
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed
        .filter(
          (source): source is ProfileRevisionSource =>
            Boolean(source) &&
            typeof source === 'object' &&
            typeof source.id === 'string' &&
            typeof source.label === 'string' &&
            typeof source.at === 'number'
        )
        .map((source) => ({
          id: source.id,
          label: source.label,
          detail: source.detail ? String(source.detail) : undefined,
          at: source.at,
        }));
    } catch {
      return [];
    }
  }

  private takeSources(artistId: string): ProfileRevisionSource[] {
    const sources = this.readSources(artistId);
    this.writeSources(artistId, []);
    return sources;
  }

  private writeSources(artistId: string, sources: ProfileRevisionSource[]): void {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(this.sourceKey(artistId), JSON.stringify(sources));
    } catch {
      // Source attribution must not break the profile write.
    }
  }

  /** Adds a consumed revision to the audit history; capped per artist. */
  private record(profile: UserProfile, revision: ArtistProfileRevision): void {
    const artistId = profile.id || 'local';
    const sources = this.takeSources(artistId);
    revision.sources = sources.length
      ? sources
      : [
          {
            id: 'unknown',
            label: 'Profile update',
            detail: 'The writer did not record a source',
            at: revision.at,
          },
        ];
    const entry: ArtistProfileRevisionEntry = {
      ...revision,
      id: `${revision.at.toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      artistId,
      sources: revision.sources,
    };
    const current = this.historyState();
    const mine = [entry, ...current.filter((item) => item.artistId === artistId)].slice(
      0,
      HISTORY_LIMIT
    );
    const others = current.filter((item) => item.artistId !== artistId);
    const next = [...mine, ...others].sort((a, b) => b.at - a.at);
    this.historyState.set(next);
    this.writeHistory(next);
  }

  private readHistory(): ArtistProfileRevisionEntry[] {
    if (typeof localStorage === 'undefined') return [];
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed
        .filter(
          (entry): entry is ArtistProfileRevisionEntry =>
            Boolean(entry) &&
            typeof entry === 'object' &&
            typeof entry.at === 'number' &&
            Array.isArray(entry.changes) &&
            typeof entry.artistId === 'string'
        )
        .map((entry) => ({
          id: String(entry.id || `${entry.at}`),
          artistId: entry.artistId,
          at: entry.at,
          summary: String(entry.summary || ''),
          sources: Array.isArray((entry as any).sources)
            ? ((entry as any).sources as ProfileRevisionSource[])
                .filter(
                  (source): source is ProfileRevisionSource =>
                    Boolean(source) &&
                    typeof source === 'object' &&
                    typeof source.id === 'string' &&
                    typeof source.label === 'string'
                )
                .map((source) => ({
                  id: source.id,
                  label: source.label,
                  detail: source.detail ? String(source.detail) : undefined,
                  at: typeof source.at === 'number' ? source.at : entry.at,
                }))
            : [],
          changes: entry.changes
            .filter(
              (change): change is ProfileRevisionChange =>
                Boolean(change) &&
                typeof change === 'object' &&
                typeof change.label === 'string'
            )
            .map((change) => ({
              label: change.label,
              from: String(change.from ?? ''),
              to: String(change.to ?? ''),
            })),
        }))
        .filter((entry) => entry.changes.length > 0)
        .sort((a, b) => b.at - a.at);
    } catch {
      return [];
    }
  }

  private writeHistory(entries: ArtistProfileRevisionEntry[]): void {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(entries));
    } catch {
      // History is an audit aid, never a dependency of the current read.
    }
  }

  private snapshot(profile: UserProfile): ProfileSnapshot {
    const p: any = profile;
    return {
      values: Object.fromEntries(FIELDS.map((field) => [field.key, field.read(p)])),
      catalog: catalogueEntries(p),
    };
  }

  private compare(
    previous: ProfileSnapshot,
    current: ProfileSnapshot
  ): ArtistProfileRevision | null {
    const changes: ProfileRevisionChange[] = [];
    for (const field of FIELDS) {
      const before = previous.values[field.key];
      const after = current.values[field.key];
      if (valuesEqual(before, after)) continue;
      changes.push({
        label: field.label,
        from: displayValue(before),
        to: displayValue(after),
      });
    }

    const beforeKeys = new Set(previous.catalog.map((item) => item.key));
    const afterKeys = new Set(current.catalog.map((item) => item.key));
    const added = current.catalog.filter((item) => !beforeKeys.has(item.key));
    const removed = previous.catalog.filter((item) => !afterKeys.has(item.key));
    if (added.length || removed.length) {
      const addedTitles = added
        .map((item) => item.title)
        .filter(Boolean)
        .slice(0, 3)
        .join(', ');
      changes.push({
        label: 'catalogue',
        from: `${previous.catalog.length} works`,
        to: `${current.catalog.length} works${
          addedTitles ? ` — added ${addedTitles}` : ''
        }${removed.length ? ` — removed ${removed.length}` : ''}`,
      });
    }

    if (!changes.length) return null;
    const summary = cap(
      changes
        .map(
          (change) =>
            `${change.label}: ${formatValue(change.from)} → ${formatValue(change.to)}`
        )
        .join('; '),
      500
    );
    return { at: Date.now(), changes, summary };
  }

  private storageKey(profile: UserProfile): string {
    return `${STORAGE_PREFIX}:${profile.id || 'local'}`;
  }

  private readSnapshot(profile: UserProfile): ProfileSnapshot | null {
    if (typeof localStorage === 'undefined') return null;
    try {
      const raw = localStorage.getItem(this.storageKey(profile));
      if (!raw) return null;
      const parsed = JSON.parse(raw) as Partial<ProfileSnapshot>;
      if (!parsed || typeof parsed.values !== 'object' || !parsed.values) {
        return null;
      }
      const values: Record<string, string | string[]> = {};
      for (const [key, value] of Object.entries(parsed.values)) {
        if (typeof value === 'string') {
          values[key] = value;
        } else if (Array.isArray(value)) {
          values[key] = value.map((item) => String(item ?? ''));
        }
      }
      const catalog = Array.isArray(parsed.catalog)
        ? parsed.catalog
            .filter(
              (item): item is CatalogueEntry =>
                Boolean(item) && typeof item === 'object'
            )
            .map((item) => ({
              key: String(item.key ?? ''),
              title: String(item.title ?? ''),
              date: String(item.date ?? ''),
            }))
        : [];
      return { values, catalog };
    } catch {
      return null;
    }
  }

  private writeSnapshot(profile: UserProfile, snapshot: ProfileSnapshot): void {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(this.storageKey(profile), JSON.stringify(snapshot));
    } catch {
      // A full or restricted storage must not break the chat. The in-memory
      // baseline still appears on the next read of the same live profile.
    }
  }
}

/**
 * S.M.U.V.E.'s read of its own revision — proof it noticed, not a changelog
 * dump. Values are quoted so the artist can correct a mis-heard answer.
 */
export function profileRevisionLine(revision: ArtistProfileRevision): string {
  const shown = revision.changes
    .slice(0, 6)
    .map(
      (change) =>
        `  • ${change.label}: ${formatValue(change.from)} → ${formatValue(change.to)}`
    );
  const more = revision.changes.length - shown.length;
  const sources = (revision.sources ?? [])
    .map((source) => source.label)
    .filter(Boolean)
    .slice(0, 3)
    .join(', ');
  return [
    `🧠 PROFILE REVISION — I re-read the file${
      sources ? ` after: ${sources}` : ''
    }. Nothing gets past me.`,
    ...shown,
    more > 0 ? `  • +${more} more adjustment${more === 1 ? '' : 's'}` : '',
    'Judge the next move against this version, not the old one.',
  ]
    .filter(Boolean)
    .join('\n');
}
