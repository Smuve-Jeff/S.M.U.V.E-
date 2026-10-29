import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { UserProfileService } from './user-profile.service';
import { UserStoreService } from './user-store.service';
import type { SmuveSurfaceId } from './smuve-career-director.service';

/**
 * S.M.U.V.E.'s case file.
 *
 * The profile fine-tune tells S.M.U.V.E. who the artist is; this tells it what
 * it has already said and what the artist has already committed to. Every
 * conversational surface writes here, and every model prompt reads here, so
 * the manager keeps one continuous relationship across modules and sessions
 * instead of starting from zero each time a panel is reopened.
 *
 * Entries are deterministic extracts from real turns — never model-invented
 * summaries — and are scoped per account so one artist's history can never
 * bleed into another's on a shared device.
 */

export type SmuveMemoryKind = 'verdict' | 'goal' | 'decision' | 'open-loop';

export interface SmuveMemoryEntry {
  id: string;
  kind: SmuveMemoryKind;
  /** The extracted line, already trimmed to a readable length. */
  text: string;
  /** Room S.M.U.V.E. was standing in when the line was recorded. */
  surface: SmuveSurfaceId;
  surfaceLabel: string;
  at: number;
  /** Set when an open loop has been closed by the artist. */
  resolvedAt?: number | null;
}

const STORAGE_PREFIX = 'smuve.casefile.v1';
const MAX_ENTRIES = 120;
const MAX_TEXT = 260;
/** Open loops shown to the model and the advisor; older ones roll off. */
const MAX_OPEN_LOOPS = 8;
const MAX_GOALS = 6;
const MAX_DECISIONS = 6;
/** One live verdict per room, and only the most recent rooms overall. */
const MAX_VERDICTS = 8;

/** Offline sentinels are outages, not verdicts — they must never be filed. */
const OFFLINE_SENTINEL = /strategic\s+link\s+severed|local\s+knowledge\s+mode/i;

/** A goal the artist stated in their own words. */
const GOAL_PATTERN =
  /\b(?:my goal is|i want to|i wanna|i need to|i'm trying to|i am trying to|help me (?:get|grow|hit|reach|build|book|sell|release|finish|learn|land)|i plan to)\b[^.!?\n]{0,180}/i;

/** An explicit commitment, which is what an arrogant manager holds you to. */
const DECISION_PATTERN =
  /\b(?:let'?s do it|i'?ll do it|i will do it|i'?m doing it|lock it in|let'?s go with|i'?ll do that|i'?ll try that|do it)\b/i;

/**
 * Markers a reply uses when it hands over an action. The matched sentence is
 * filed as an open loop so S.M.U.V.E. can call it back and ask for the receipt.
 */
const OPEN_LOOP_PATTERN =
  /(?:next move|do this next|first move|start (?:with|by)|action:|ship|register|release|bounce|fix|cut|sidechain|split|deliver|pitch|schedule|rewrite|mix|master|record|book|email|sign|ask|build|write|plan|test|measure|publish|upload|negotiate|invoice|file|clear|pull|carve|high-pass)[^.!?\n]{8,200}/i;

@Injectable({ providedIn: 'root' })
export class SmuveMemoryService {
  private profileService = inject(UserProfileService, { optional: true });
  private userStore = inject(UserStoreService, { optional: true });

  /** The artist's case file, newest first. */
  readonly entries = signal<SmuveMemoryEntry[]>([]);

  private owner: string | null = null;
  private sequence = 0;

  /** The verdict S.M.U.V.E. most recently delivered in each room. */
  readonly verdicts = computed(() =>
    this.entries().filter((entry) => entry.kind === 'verdict')
  );

  /** Unresolved commitments, newest first. */
  readonly openLoops = computed(() =>
    this.entries().filter(
      (entry) => entry.kind === 'open-loop' && entry.resolvedAt == null
    )
  );

  readonly goals = computed(() =>
    this.entries().filter((entry) => entry.kind === 'goal')
  );

  readonly decisions = computed(() =>
    this.entries().filter((entry) => entry.kind === 'decision')
  );

  /** What the artist has actually left unresolved, in their own career. */
  readonly pendingCount = computed(() => this.openLoops().length);

  constructor() {
    effect(() => {
      const owner = this.resolveOwner();
      if (owner === this.owner) return;
      this.owner = owner;
      this.entries.set(this.load(owner));
    });
  }

  /** The live verdict for a room, if S.M.U.V.E. has judged it before. */
  latestVerdict(surface?: SmuveSurfaceId): SmuveMemoryEntry | null {
    const verdicts = this.verdicts();
    if (!verdicts.length) return null;
    if (!surface) return verdicts[0] ?? null;
    return verdicts.find((entry) => entry.surface === surface) ?? null;
  }

  /**
   * Files one completed conversation turn.
   *
   * The verdict is the assistant's opening judgement in this room; goals and
   * decisions are the artist's own words; open loops are the actions S.M.U.V.E.
   * handed over. Everything is de-duplicated, so a repeated exchange does not
   * bloat the file.
   */
  captureTurn(
    surface: SmuveSurfaceId,
    surfaceLabel: string,
    artistText: string,
    replyText: string
  ): void {
    const artist = (artistText || '').trim();
    const reply = (replyText || '').trim();
    if (!artist || !reply || OFFLINE_SENTINEL.test(reply)) return;

    const now = Date.now();
    const additions: SmuveMemoryEntry[] = [];
    const make = (kind: SmuveMemoryKind, text: string): SmuveMemoryEntry => ({
      id: `case-${now}-${++this.sequence}`,
      kind,
      text: this.clean(text),
      surface,
      surfaceLabel: surfaceLabel || this.labelFor(surface),
      at: now,
    });

    const verdict = this.verdictFrom(reply);
    if (verdict) additions.push(make('verdict', verdict));

    const goal = this.matchSentence(artist, GOAL_PATTERN);
    if (goal) additions.push(make('goal', goal));

    const decision = this.matchSentence(artist, DECISION_PATTERN);
    if (decision) additions.push(make('decision', decision));

    const loop = this.matchSentence(reply, OPEN_LOOP_PATTERN);
    if (loop) additions.push(make('open-loop', loop));

    if (!additions.length) return;

    this.entries.update((current) => {
      let next = [...additions, ...current];
      // One live verdict per room: the newest judgement replaces the old one.
      for (const added of additions) {
        if (added.kind !== 'verdict') continue;
        next = next.filter(
          (entry) =>
            entry === added ||
            entry.kind !== 'verdict' ||
            entry.surface !== added.surface
        );
      }
      next = this.dedupe(next);
      next = this.limitKind(next, 'open-loop', MAX_OPEN_LOOPS, (entry) =>
        entry.resolvedAt == null
      );
      next = this.limitKind(next, 'goal', MAX_GOALS);
      next = this.limitKind(next, 'decision', MAX_DECISIONS);
      next = this.limitKind(next, 'verdict', MAX_VERDICTS);
      return next.slice(0, MAX_ENTRIES);
    });
    this.persist();
  }

  /** Closes an open loop (or deletes any other entry) by id. */
  resolve(id: string): void {
    this.entries.update((entries) =>
      entries.map((entry) =>
        entry.id === id && entry.resolvedAt == null
          ? { ...entry, resolvedAt: Date.now() }
          : entry
      )
    );
    this.persist();
  }

  /** Removes an entry outright — used when the artist rejects a filing. */
  forget(id: string): void {
    this.entries.update((entries) => entries.filter((entry) => entry.id !== id));
    this.persist();
  }

  clear(): void {
    this.entries.set([]);
    this.persist();
  }

  /**
   * Prompt-ready continuity block for every S.M.U.V.E. model call.
   *
   * Bounded on purpose: the case file supports the answer, it is not the
   * subject of it. The callback rule is the only instruction — everything
   * above it is quoted evidence.
   */
  promptBlock(surface?: SmuveSurfaceId): string {
    const verdict = this.latestVerdict(surface);
    const otherVerdicts = this.verdicts()
      .filter((entry) => entry !== verdict)
      .slice(0, 3);
    const goals = this.goals().slice(0, 3);
    const openLoops = this.openLoops().slice(0, 4);
    const decisions = this.decisions().slice(0, 2);

    const lines: string[] = [];
    if (verdict) {
      lines.push(`VERDICT IN THIS ROOM (${verdict.surfaceLabel}): "${verdict.text}"`);
    }
    if (otherVerdicts.length) {
      lines.push(
        `VERDICTS ELSEWHERE: ${otherVerdicts
          .map((entry) => `${entry.surfaceLabel} — "${this.clean(entry.text, 120)}"`)
          .join(' | ')}`
      );
    }
    if (goals.length) {
      lines.push(
        `ARTIST GOALS ON RECORD: ${goals.map((entry) => `"${entry.text}"`).join(' | ')}`
      );
    }
    if (decisions.length) {
      lines.push(
        `ARTIST COMMITMENTS: ${decisions.map((entry) => `"${entry.text}"`).join(' | ')}`
      );
    }
    if (openLoops.length) {
      lines.push(
        `UNRESOLVED OPEN LOOPS: ${openLoops.map((entry) => `"${entry.text}"`).join(' | ')}`
      );
    }
    if (!lines.length) return '';

    lines.push(
      'CALLBACK RULE: when one of these is genuinely relevant, call it back in character ("last time I told you…") and hold the artist to it. Do not recite the file mechanically, never invent an entry, and never claim a loop is done because it is listed here.'
    );

    return [
      'S.M.U.V.E. CASE FILE — persistent memory of this artist across modules and sessions:',
      ...lines,
    ]
      .join('\n')
      .slice(0, 1200);
  }

  /**
   * One in-character callback for the offline path, so the manager still
   * remembers the relationship when the live model link is severed.
   */
  callbackLine(surface?: SmuveSurfaceId): string | null {
    const verdict = this.latestVerdict(surface);
    if (verdict) {
      return `Last time you stood in ${verdict.surfaceLabel} I told you: "${this.clean(
        verdict.text,
        150
      )}" It still stands.`;
    }
    const loop = this.openLoops()[0];
    if (loop) {
      return `You still owe me ${loop.text.replace(/^[a-z]+:\s*/i, '')}. That file does not close itself.`;
    }
    return null;
  }

  /** The first sentence S.M.U.V.E. delivered — its judgement of the room. */
  private verdictFrom(reply: string): string | null {
    const cleaned = reply
      .replace(/^[\s>*#_`-]+/, '')
      .replace(/^(?:my\s+)?verdict\s*[:—-]\s*/i, '')
      .replace(/^s\.m\.u\.v\.e\.?\s*(?:prime|says)?\s*[:—-]\s*/i, '')
      .trim();
    if (!cleaned) return null;
    const sentence = cleaned.split(/(?<=[.!?])\s+/)[0] ?? cleaned;
    const text = this.clean(sentence);
    // A one-word acknowledgement is not a verdict worth remembering.
    return text.split(' ').length >= 4 ? text : null;
  }

  /** First sentence of `text` matching `pattern` (trimmed, bounded). */
  private matchSentence(text: string, pattern: RegExp): string | null {
    const match = pattern.exec(text);
    if (!match) return null;
    const start = Math.max(0, match.index);
    const tail = text.slice(start);
    const sentence = tail.split(/(?<=[.!?])\s+|\n/)[0] ?? tail;
    const cleaned = this.clean(sentence);
    return cleaned.split(' ').length >= 3 ? cleaned : null;
  }

  private clean(text: string, limit = MAX_TEXT): string {
    const normalized = (text || '')
      .replace(/\s+/g, ' ')
      .replace(/^[\s>*#_`"'“”‘’]+/, '')
      .replace(/[\s>*#_`"“”‘’]+$/, '')
      .trim();
    return normalized.length > limit
      ? `${normalized.slice(0, Math.max(0, limit - 1)).trimEnd()}…`
      : normalized;
  }

  /**
   * Drops exact repeats (case-insensitive) so a re-asked question is stable.
   *
   * A room's verdict and its open loop belong to that room, but a goal or a
   * commitment is the artist's, not the workspace's — restating it in the
   * Studio must not duplicate it beside the mix-bus copy.
   */
  private dedupe(entries: SmuveMemoryEntry[]): SmuveMemoryEntry[] {
    const seen = new Set<string>();
    return entries.filter((entry) => {
      const scoped = entry.kind === 'verdict' || entry.kind === 'open-loop';
      const key = `${entry.kind}:${scoped ? entry.surface : '*'}:${entry.text.toLowerCase()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  /** Caps one kind while always keeping unresolved open loops. */
  private limitKind(
    entries: SmuveMemoryEntry[],
    kind: SmuveMemoryKind,
    max: number,
    keep?: (entry: SmuveMemoryEntry) => boolean
  ): SmuveMemoryEntry[] {
    const matching = entries.filter((entry) => entry.kind === kind);
    if (matching.length <= max) return entries;
    const allow = new Set(
      matching
        .filter((entry) => (keep ? keep(entry) : true))
        .slice(0, max)
        .map((entry) => entry.id)
    );
    return entries.filter(
      (entry) => entry.kind !== kind || allow.has(entry.id)
    );
  }

  private resolveOwner(): string {
    const user = this.userStore?.user?.()?.id;
    if (user) return user;
    const profile = this.profileService?.profile?.() as
      | { id?: string }
      | null
      | undefined;
    return profile?.id || 'local';
  }

  private storageKey(owner: string): string {
    return `${STORAGE_PREFIX}:${encodeURIComponent(owner)}`;
  }

  private load(owner: string): SmuveMemoryEntry[] {
    if (typeof window === 'undefined') return [];
    try {
      const raw = window.localStorage.getItem(this.storageKey(owner));
      if (!raw) return [];
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return [];
      return parsed
        .filter(
          (entry): entry is SmuveMemoryEntry =>
            !!entry &&
            typeof (entry as SmuveMemoryEntry).text === 'string' &&
            typeof (entry as SmuveMemoryEntry).at === 'number' &&
            typeof (entry as SmuveMemoryEntry).id === 'string'
        )
        .slice(0, MAX_ENTRIES);
    } catch {
      return [];
    }
  }

  private persist(): void {
    if (typeof window === 'undefined' || !this.owner) return;
    try {
      window.localStorage.setItem(
        this.storageKey(this.owner),
        JSON.stringify(this.entries().slice(0, MAX_ENTRIES))
      );
    } catch {
      // A full or blocked store costs continuity, never the conversation.
    }
  }

  /** Fallback label when a caller cannot supply the live room label. */
  private labelFor(surface: SmuveSurfaceId): string {
    const labels: Partial<Record<SmuveSurfaceId, string>> = {
      overview: 'Career Command',
      chat: 'Direct Console',
      studio: 'Studio Floor',
      mixing: 'Mix Bus',
      mastering: 'Mastering Suite',
      vocal: 'Vocal Booth',
      beatmaking: 'Beat Lab',
      songwriting: 'Writing Room',
      performance: 'Stage',
      video: 'Visual Lab',
      brand: 'Brand Desk',
      marketing: 'Marketing',
      promotion: 'Promotion',
      business: 'Business Suite',
      legal: 'Legal Desk',
      release: 'Release Bay',
      catalog: 'Catalogue Vault',
      distribution: 'Distribution',
      sync: 'Sync Desk',
      'artist-development': 'Artist Development',
      analytics: 'Analytics',
      community: 'Community',
      education: 'Academy',
    };
    return labels[surface] ?? 'Direct Console';
  }
}
