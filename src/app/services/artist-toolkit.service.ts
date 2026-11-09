import { Injectable, computed, signal } from '@angular/core';
import {
  ContributorRole,
  ReleaseBlueprint,
  ReleaseType,
  RoyaltyEstimate,
  RoyaltyInput,
  RoyaltyLine,
  RoyaltyPayout,
  SplitContributor,
  SplitSheet,
} from '../types/artist-toolkit.types';
import {
  CONTRIBUTOR_ROLES,
  RELEASE_TYPES,
  RIGHTS_CATEGORIES,
  RIGHTS_TASKS,
  TOOLKIT_GUIDES,
} from './artist-toolkit.data';

const STORAGE_KEY = 'smuve_artist_toolkit_v1';

/** `yyyy-mm-dd` for a local calendar day (never UTC-shifted). */
export const toIsoDay = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const parseIsoDay = (value: unknown): Date | null => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value ?? ''));
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(year, month - 1, day);
  return parsed.getFullYear() === year &&
    parsed.getMonth() === month - 1 &&
    parsed.getDate() === day
    ? parsed
    : null;
};

export const addDaysToIso = (isoDay: string, days: number): string => {
  const date = parseIsoDay(isoDay);
  if (!date) return '';
  date.setDate(date.getDate() + days);
  return toIsoDay(date);
};

const roundMoney = (value: number): number =>
  Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;

const releaseScope = (type: ReleaseType): string => {
  switch (type) {
    case 'Single':
      return 'one lead recording and its alternate versions';
    case 'EP':
      return 'three to six recordings that belong together';
    case 'Album':
      return 'seven or more recordings with a beginning and an end';
    case 'Mixtape':
      return 'five or more recordings, sequenced as one statement';
  }
};

/**
 * The dated release runway, counted back from the release day.
 *
 * These are planning anchors, not promises: distributor lead times and
 * playlist windows differ, and the artist can move any date. Ids are stable so
 * regenerating after a date change keeps completed work checked when the date
 * has not moved.
 */
export const buildReleaseMilestones = (
  releaseDate: string,
  releaseType: ReleaseType
): ReleaseBlueprint['milestones'] => {
  if (!parseIsoDay(releaseDate)) return [];
  const scope = releaseScope(releaseType);
  const milestone = (
    id: string,
    offset: number,
    phase: string,
    title: string,
    detail: string
  ) => ({
    id,
    phase,
    title,
    detail,
    dueDate: addDaysToIso(releaseDate, offset),
    done: false,
  });

  return [
    milestone(
      'lock-master',
      -56,
      'Foundation',
      'Lock the master and the tracklist',
      `Choose ${scope}. Finish the mix, approve the master and stop changing it after delivery.`
    ),
    milestone(
      'paperwork',
      -42,
      'Rights',
      'Fix the paperwork before the noise',
      'Sign split sheets, register the work with your PRO, join The MLC and SoundExchange, and record the ISRCs and UPC.'
    ),
    milestone(
      'delivery',
      -35,
      'Delivery',
      'Deliver to the distributor',
      'Upload the final audio, artwork, credits and explicit flags. Confirm every store accepted the release.'
    ),
    milestone(
      'pitch',
      -28,
      'Audience',
      'Pitch before the window closes',
      'Submit editorial playlist pitches, then send a short personal note to curators, blogs, radio and community playlists.'
    ),
    milestone(
      'assets',
      -14,
      'Assets',
      'Build the release assets',
      'Prepare cover variants, a canvas loop, a lyric video, three vertical clips and the release-day captions.'
    ),
    milestone(
      'announce',
      -7,
      'Launch',
      'Announce and line up release day',
      'Open pre-saves, announce the date, send the one-sheet to press, and confirm who posts what on release day.'
    ),
    milestone(
      'release-day',
      0,
      'Release',
      'Release day',
      'Go live early, post the strongest clip, thank every collaborator, and reply to every real comment.'
    ),
    milestone(
      'week-one',
      7,
      'Follow-through',
      'Read the first week',
      'Review saves, listeners and follower conversion. File the copyright registration if it is not already done.'
    ),
    milestone(
      'month-one',
      30,
      'Follow-through',
      'Reconcile and reload',
      'Match the first statements, follow up on missing stores or unmatched ISRCs, and choose the next release.'
    ),
  ];
};

/** Total of all declared shares, rounded to two decimals. */
export const splitTotal = (contributors: SplitContributor[]): number =>
  roundMoney(
    contributors.reduce(
      (total, contributor) =>
        total + (Number.isFinite(contributor.share) ? contributor.share : 0),
      0
    )
  );

/**
 * Everything that would make a split sheet unsafe to sign. An empty list means
 * the shares total exactly 100 and every contributor has a distinct legal name.
 */
export const validateSplitContributors = (
  contributors: SplitContributor[]
): string[] => {
  const warnings: string[] = [];
  if (contributors.length === 0) {
    warnings.push('Add at least one contributor before sharing this sheet.');
    return warnings;
  }

  const total = splitTotal(contributors);
  if (total !== 100) {
    warnings.push(
      `Shares add up to ${total}%. They must add up to exactly 100% before anyone signs.`
    );
  }

  contributors.forEach((contributor, index) => {
    if (!String(contributor.name ?? '').trim()) {
      warnings.push(`Contributor ${index + 1} needs a legal name.`);
    }
    if (!Number.isFinite(contributor.share) || contributor.share <= 0) {
      warnings.push(
        `${String(contributor.name || `Contributor ${index + 1}`).trim()} has no share.`
      );
    }
  });

  const seen = new Map<string, number>();
  for (const contributor of contributors) {
    const key = String(contributor.name ?? '').trim().toLowerCase();
    if (!key) continue;
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  for (const [name, count] of seen) {
    if (count > 1) {
      warnings.push(`“${name}” appears ${count} times. Combine duplicate rows.`);
    }
  }

  return warnings;
};

/** Human-readable split sheet the artist can copy, print or hand to a lawyer. */
export const buildSplitSheetText = (sheet: SplitSheet): string => {
  const total = splitTotal(sheet.contributors);
  const lines = sheet.contributors.map((contributor, index) => {
    const details = [
      contributor.role,
      `${contributor.share}%`,
      contributor.ipi ? `IPI ${contributor.ipi}` : null,
      contributor.publisher ? `Publisher: ${contributor.publisher}` : null,
      contributor.email ? contributor.email : null,
    ].filter(Boolean);
    return `${index + 1}. ${contributor.name || '[name required]'} — ${details.join(' · ')}`;
  });

  return [
    `SPLIT SHEET — ${sheet.title || '[track title]'}`,
    `Generated ${toIsoDay(new Date())}`,
    sheet.iswc ? `ISWC: ${sheet.iswc}` : 'ISWC: not recorded',
    '',
    ...lines,
    '',
    `TOTAL WRITER SHARE: ${total}%`,
    '',
    'Each contributor confirms the share above and that they have the right to agree it.',
    'This sheet records an agreement between collaborators. It is not legal advice;',
    'have a music lawyer review anything involving a publisher, label or catalogue sale.',
    '',
    'Signatures:',
    ...sheet.contributors.map(
      (contributor) =>
        `${contributor.name || '________________'} ______________________  Date ________`
    ),
  ].join('\n');
};

/**
 * Illustrative royalty arithmetic from the artist's own stream and rate
 * figures. It is not a statement, a forecast or a promise from any DSP.
 */
export const estimateRoyalties = (input: RoyaltyInput): RoyaltyEstimate => {
  const lines = Array.isArray(input?.lines) ? input.lines : [];
  const gross = lines.reduce((total, line) => {
    const streams = Number.isFinite(line.streams) ? Math.max(0, line.streams) : 0;
    const rate = Number.isFinite(line.ratePerStream)
      ? Math.max(0, line.ratePerStream)
      : 0;
    return total + streams * rate;
  }, 0);
  const feePercent = Number.isFinite(input?.distributorFeePercent)
    ? Math.min(100, Math.max(0, input.distributorFeePercent))
    : 0;
  const distributorFee = gross * (feePercent / 100);
  return {
    gross: roundMoney(gross),
    distributorFee: roundMoney(distributorFee),
    net: roundMoney(gross - distributorFee),
    totalStreams: lines.reduce(
      (total, line) =>
        total + (Number.isFinite(line.streams) ? Math.max(0, line.streams) : 0),
      0
    ),
  };
};

/** What each split-sheet contributor is owed from the estimated net. */
export const royaltyPayouts = (
  contributors: SplitContributor[],
  net: number
): RoyaltyPayout[] =>
  contributors
    .filter((contributor) => Number.isFinite(contributor.share) && contributor.share > 0)
    .map((contributor) => ({
      contributorId: contributor.id,
      name: contributor.name.trim() || 'Unnamed contributor',
      share: contributor.share,
      amount: roundMoney((net * contributor.share) / 100),
    }));

const newId = (prefix: string): string => {
  const cryptoObj = typeof globalThis !== 'undefined' ? globalThis.crypto : undefined;
  const random =
    cryptoObj && typeof cryptoObj.randomUUID === 'function'
      ? cryptoObj.randomUUID()
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}-${random}`;
};

const asString = (value: unknown, fallback = ''): string =>
  typeof value === 'string' ? value : fallback;

const asNumber = (value: unknown, fallback = 0): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

const defaultState = (): {
  blueprint: ReleaseBlueprint;
  splitSheet: SplitSheet;
  royalty: RoyaltyInput;
} => {
  const releaseDate = addDaysToIso(toIsoDay(new Date()), 56);
  const releaseType: ReleaseType = 'Single';
  return {
    blueprint: {
      title: '',
      releaseDate,
      releaseType,
      distributor: '',
      milestones: buildReleaseMilestones(releaseDate, releaseType),
    },
    splitSheet: {
      title: '',
      iswc: '',
      contributors: [
        {
          id: newId('contributor'),
          name: '',
          role: 'Songwriter',
          email: '',
          publisher: '',
          ipi: '',
          share: 100,
        },
      ],
    },
    royalty: {
      distributorFeePercent: 15,
      lines: [
        {
          id: newId('line'),
          platform: 'Spotify',
          streams: 10000,
          ratePerStream: 0.0035,
        },
        {
          id: newId('line'),
          platform: 'Apple Music',
          streams: 3000,
          ratePerStream: 0.0075,
        },
        {
          id: newId('line'),
          platform: 'YouTube Music',
          streams: 8000,
          ratePerStream: 0.0015,
        },
      ],
    },
  };
};

@Injectable({ providedIn: 'root' })
export class ArtistToolkitService {
  private readonly defaults = defaultState();

  readonly releaseTypes = RELEASE_TYPES;
  readonly roles = CONTRIBUTOR_ROLES;
  readonly rightsCategories = RIGHTS_CATEGORIES;
  readonly rightsTasks = RIGHTS_TASKS;
  readonly guides = TOOLKIT_GUIDES;

  readonly blueprint = signal<ReleaseBlueprint>(this.defaults.blueprint);
  readonly splitSheet = signal<SplitSheet>(this.defaults.splitSheet);
  readonly royalty = signal<RoyaltyInput>(this.defaults.royalty);
  readonly completedRights = signal<string[]>([]);
  /** A local persistence failure the artist must know about before relying on it. */
  readonly persistenceError = signal<string | null>(null);

  readonly splitTotal = computed(() => splitTotal(this.splitSheet().contributors));
  readonly splitWarnings = computed(() =>
    validateSplitContributors(this.splitSheet().contributors)
  );
  readonly splitValid = computed(
    () => this.splitTotal() === 100 && this.splitWarnings().length === 0
  );
  readonly splitSheetText = computed(() => buildSplitSheetText(this.splitSheet()));

  readonly royaltyEstimate = computed(() => estimateRoyalties(this.royalty()));
  readonly royaltyPayouts = computed(() =>
    royaltyPayouts(this.splitSheet().contributors, this.royaltyEstimate().net)
  );

  readonly blueprintProgress = computed(() => {
    const milestones = this.blueprint().milestones;
    const done = milestones.filter((milestone) => milestone.done).length;
    return {
      done,
      total: milestones.length,
      percent: milestones.length ? Math.round((done / milestones.length) * 100) : 0,
    };
  });
  readonly nextMilestone = computed(
    () => this.blueprint().milestones.find((milestone) => !milestone.done) ?? null
  );

  readonly rightsCompletion = computed(() => {
    const done = RIGHTS_TASKS.filter((task) =>
      this.completedRights().includes(task.id)
    ).length;
    return {
      done,
      total: RIGHTS_TASKS.length,
      percent: Math.round((done / RIGHTS_TASKS.length) * 100),
    };
  });

  constructor() {
    this.load();
  }

  tasksFor(category: string) {
    return RIGHTS_TASKS.filter((task) => task.category === category);
  }

  isRightsTaskDone(id: string): boolean {
    return this.completedRights().includes(id);
  }

  completedIn(category: string): number {
    return this.tasksFor(category).filter((task) =>
      this.completedRights().includes(task.id)
    ).length;
  }

  setReleaseMeta(
    patch: Partial<
      Pick<
        ReleaseBlueprint,
        'title' | 'releaseDate' | 'releaseType' | 'distributor'
      >
    >
  ): void {
    this.blueprint.update((current) => {
      const next = { ...current, ...patch };
      const datesChanged =
        patch.releaseDate !== undefined || patch.releaseType !== undefined;
      if (!datesChanged) return next;
      const previous = current.milestones;
      next.milestones = buildReleaseMilestones(
        next.releaseDate,
        next.releaseType
      ).map((milestone) => ({
        ...milestone,
        done:
          previous.find(
            (old) =>
              old.id === milestone.id && old.dueDate === milestone.dueDate
          )?.done ?? false,
      }));
      return next;
    });
    this.persist();
  }

  toggleMilestone(id: string): void {
    this.blueprint.update((current) => ({
      ...current,
      milestones: current.milestones.map((milestone) =>
        milestone.id === id ? { ...milestone, done: !milestone.done } : milestone
      ),
    }));
    this.persist();
  }

  setSplitField(field: 'title' | 'iswc', value: string): void {
    this.splitSheet.update((current) => ({ ...current, [field]: value }));
    this.persist();
  }

  addContributor(): void {
    this.splitSheet.update((current) => ({
      ...current,
      contributors: [
        ...current.contributors,
        {
          id: newId('contributor'),
          name: '',
          role: 'Songwriter',
          email: '',
          publisher: '',
          ipi: '',
          share: 0,
        },
      ],
    }));
    this.persist();
  }

  updateContributor(
    id: string,
    patch: Partial<Omit<SplitContributor, 'id'>>
  ): void {
    this.splitSheet.update((current) => ({
      ...current,
      contributors: current.contributors.map((contributor) => {
        if (contributor.id !== id) return contributor;
        const next = { ...contributor, ...patch };
        next.share = Number.isFinite(next.share)
          ? Math.min(100, Math.max(0, next.share))
          : 0;
        return next;
      }),
    }));
    this.persist();
  }

  removeContributor(id: string): void {
    this.splitSheet.update((current) => ({
      ...current,
      contributors: current.contributors.filter(
        (contributor) => contributor.id !== id
      ),
    }));
    this.persist();
  }

  useReleaseTitleForSplit(): void {
    const title = this.blueprint().title.trim();
    if (!title) return;
    this.splitSheet.update((current) => ({ ...current, title }));
    this.persist();
  }

  updateRoyaltyLine(id: string, patch: Partial<Omit<RoyaltyLine, 'id'>>): void {
    this.royalty.update((current) => ({
      ...current,
      lines: current.lines.map((line) =>
        line.id === id ? { ...line, ...patch } : line
      ),
    }));
    this.persist();
  }

  addRoyaltyLine(): void {
    this.royalty.update((current) => ({
      ...current,
      lines: [
        ...current.lines,
        {
          id: newId('line'),
          platform: 'Other DSP',
          streams: 0,
          ratePerStream: 0,
        },
      ],
    }));
    this.persist();
  }

  removeRoyaltyLine(id: string): void {
    this.royalty.update((current) => ({
      ...current,
      lines: current.lines.filter((line) => line.id !== id),
    }));
    this.persist();
  }

  setDistributorFee(percent: number): void {
    const safe = Number.isFinite(percent) ? Math.min(100, Math.max(0, percent)) : 0;
    this.royalty.update((current) => ({
      ...current,
      distributorFeePercent: safe,
    }));
    this.persist();
  }

  toggleRightsTask(id: string): void {
    if (!RIGHTS_TASKS.some((task) => task.id === id)) return;
    this.completedRights.update((current) =>
      current.includes(id)
        ? current.filter((taskId) => taskId !== id)
        : [...current, id]
    );
    this.persist();
  }

  private load(): void {
    if (typeof localStorage === 'undefined') return;
    let raw: string | null = null;
    try {
      raw = localStorage.getItem(STORAGE_KEY);
    } catch {
      this.persistenceError.set('This browser is blocking local storage. Nothing will be saved.');
      return;
    }
    if (!raw) return;

    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;

      const storedBlueprint = parsed.blueprint as Partial<ReleaseBlueprint> | undefined;
      if (storedBlueprint && typeof storedBlueprint === 'object') {
        const releaseDate = asString(
          storedBlueprint.releaseDate,
          this.defaults.blueprint.releaseDate
        );
        const releaseType = RELEASE_TYPES.includes(
          storedBlueprint.releaseType as ReleaseType
        )
          ? (storedBlueprint.releaseType as ReleaseType)
          : this.defaults.blueprint.releaseType;
        const generated = buildReleaseMilestones(releaseDate, releaseType);
        const storedMilestones = Array.isArray(storedBlueprint.milestones)
          ? storedBlueprint.milestones
          : [];
        this.blueprint.set({
          title: asString(storedBlueprint.title),
          releaseDate,
          releaseType,
          distributor: asString(storedBlueprint.distributor),
          milestones: generated.map((milestone) => {
            const stored = storedMilestones.find(
              (entry) =>
                entry &&
                typeof entry === 'object' &&
                (entry as { id?: unknown }).id === milestone.id
            ) as { done?: unknown } | undefined;
            return { ...milestone, done: stored?.done === true };
          }),
        });
      }

      const storedSheet = parsed.splitSheet as Record<string, unknown> | undefined;
      if (storedSheet && typeof storedSheet === 'object') {
        const contributors = Array.isArray(storedSheet.contributors)
          ? storedSheet.contributors
              .filter(
                (entry): entry is Record<string, unknown> =>
                  Boolean(entry) && typeof entry === 'object'
              )
              .map((entry) => ({
                id: asString(entry.id) || newId('contributor'),
                name: asString(entry.name),
                role: CONTRIBUTOR_ROLES.includes(entry.role as ContributorRole)
                  ? (entry.role as ContributorRole)
                  : 'Songwriter',
                email: asString(entry.email),
                publisher: asString(entry.publisher),
                ipi: asString(entry.ipi),
                share: Math.min(100, Math.max(0, asNumber(entry.share))),
              }))
          : [];
        this.splitSheet.set({
          title: asString(storedSheet.title),
          iswc: asString(storedSheet.iswc),
          contributors:
            contributors.length > 0
              ? contributors
              : this.defaults.splitSheet.contributors,
        });
      }

      const storedRoyalty = parsed.royalty as Record<string, unknown> | undefined;
      if (storedRoyalty && typeof storedRoyalty === 'object') {
        const lines = Array.isArray(storedRoyalty.lines)
          ? storedRoyalty.lines
              .filter(
                (entry): entry is Record<string, unknown> =>
                  Boolean(entry) && typeof entry === 'object'
              )
              .map((entry) => ({
                id: asString(entry.id) || newId('line'),
                platform: asString(entry.platform, 'Other DSP'),
                streams: Math.max(0, asNumber(entry.streams)),
                ratePerStream: Math.max(0, asNumber(entry.ratePerStream)),
              }))
          : [];
        this.royalty.set({
          distributorFeePercent: Math.min(
            100,
            Math.max(0, asNumber(storedRoyalty.distributorFeePercent, 15))
          ),
          lines: lines.length > 0 ? lines : this.defaults.royalty.lines,
        });
      }

      if (Array.isArray(parsed.completedRights)) {
        const known = new Set(RIGHTS_TASKS.map((task) => task.id));
        this.completedRights.set(
          parsed.completedRights
            .filter((id): id is string => typeof id === 'string')
            .filter((id) => known.has(id))
        );
      }
      this.persistenceError.set(null);
    } catch {
      // A corrupted record must not take the workspace down. Keep the defaults
      // and say so, so the artist knows the old record was not loaded.
      this.persistenceError.set(
        'The saved toolkit record could not be read. Showing a fresh toolkit.'
      );
    }
  }

  private persist(): void {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          version: 1,
          blueprint: this.blueprint(),
          splitSheet: this.splitSheet(),
          royalty: this.royalty(),
          completedRights: this.completedRights(),
        })
      );
      this.persistenceError.set(null);
    } catch {
      this.persistenceError.set(
        'This browser refused the save. Keep a copy of anything you need before closing.'
      );
    }
  }
}
