import {
  Component,
  DestroyRef,
  Injector,
  computed,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import {
  SmuveMemoryEntry,
  SmuveMemoryService,
} from '../../services/smuve-memory.service';
import {
  SmuveCareerDirectorService,
  SmuveSurfaceId,
} from '../../services/smuve-career-director.service';
import { UIService } from '../../services/ui.service';
import { getPersonaOption } from '../../types/persona.types';
import { UserProfileService } from '../../services/user-profile.service';

type CaseFileFilter = 'all' | 'open' | 'verdict' | 'goal' | 'decision';

interface FilterOption {
  id: CaseFileFilter;
  label: string;
}

/** One room's slice of the record, with its own memory summary. */
interface CaseFileRoomGroup {
  surface: SmuveSurfaceId;
  label: string;
  /** Entries that pass the active filter/search. */
  entries: SmuveMemoryEntry[];
  /** The room's latest verdict, regardless of the active filter. */
  verdict: SmuveMemoryEntry | null;
  openLoops: SmuveMemoryEntry[];
  goals: SmuveMemoryEntry[];
  decisions: SmuveMemoryEntry[];
  lastAt: number;
  route: string | null;
  /** First-person, evidence-only summary of what S.M.U.V.E. remembers here. */
  summary: string;
}

const FILTERS: FilterOption[] = [
  { id: 'all', label: 'Everything' },
  { id: 'open', label: 'Open loops' },
  { id: 'verdict', label: 'Verdicts' },
  { id: 'goal', label: 'Goals' },
  { id: 'decision', label: 'Commitments' },
];

/**
 * The Case File workspace.
 *
 * Every other S.M.U.V.E. surface writes to the case file — this is the one
 * place the artist can audit it. Verdicts and goals are read-only evidence;
 * open loops can be closed, and anything mis-filed can be deleted. Nothing
 * here is generated on the page: it is the same deterministic record the
 * model receives.
 */
@Component({
  selector: 'app-smuve-case-file',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './smuve-case-file.component.html',
  styleUrls: ['./smuve-case-file.component.css'],
})
export class SmuveCaseFileComponent {
  private memory = inject(SmuveMemoryService);
  private profile = inject(UserProfileService);
  private router = inject(Router);
  private injector = inject(Injector);
  private destroyRef = inject(DestroyRef);

  readonly filters = FILTERS;
  readonly activeFilter = signal<CaseFileFilter>('all');
  readonly query = signal('');
  readonly notice = signal('');
  readonly spoken = signal<{ line: string; archetype: string } | null>(null);
  readonly confirmingClear = signal(false);
  private clearTimer: ReturnType<typeof setTimeout> | null = null;
  private noticeTimer: ReturnType<typeof setTimeout> | null = null;

  /** Optional so the page still renders in a host without the director. */
  private get director(): SmuveCareerDirectorService | null {
    try {
      return this.injector.get(SmuveCareerDirectorService, null);
    } catch {
      return null;
    }
  }

  private get ui(): UIService | null {
    try {
      return this.injector.get(UIService, null);
    } catch {
      return null;
    }
  }

  readonly personaName = computed(() =>
    getPersonaOption(this.profile.profile().settings?.ai?.commanderPersona).name
  );

  /** Genre mastery and stage pressure for the room this workspace occupies. */
  readonly roomIntel = computed(() => {
    try {
      return this.director?.surfaceIntel('case-file') ?? null;
    } catch {
      return null;
    }
  });

  readonly counts = computed<Record<CaseFileFilter, number>>(() => ({
    all: this.memory.entries().length,
    open: this.memory.openLoops().length,
    verdict: this.memory.verdicts().length,
    goal: this.memory.goals().length,
    decision: this.memory.decisions().length,
  }));

  /** The record, filtered by kind and by the artist's search. */
  readonly visibleEntries = computed<SmuveMemoryEntry[]>(() => {
    const filter = this.activeFilter();
    const search = this.query().trim().toLowerCase();
    return this.memory.entries().filter((entry) => {
      if (filter === 'open') {
        if (entry.kind !== 'open-loop' || entry.resolvedAt != null) return false;
      } else if (filter !== 'all' && entry.kind !== filter) {
        return false;
      }
      if (!search) return true;
      return `${entry.text} ${entry.surfaceLabel}`.toLowerCase().includes(search);
    });
  });

  readonly hasEntries = computed(() => this.memory.entries().length > 0);

  /**
   * The same record, grouped by the room that produced it.
   *
   * The summary and the counts describe the room's whole memory; the rows
   * inside it obey the active filter and search. That keeps the header honest
   * when the artist is looking at only verdicts or only open loops.
   */
  readonly roomGroups = computed<CaseFileRoomGroup[]>(() => {
    const filter = this.activeFilter();
    const search = this.query().trim().toLowerCase();
    const bySurface = new Map<SmuveSurfaceId, SmuveMemoryEntry[]>();

    for (const entry of this.memory.entries()) {
      const list = bySurface.get(entry.surface) ?? [];
      list.push(entry);
      bySurface.set(entry.surface, list);
    }

    const groups: CaseFileRoomGroup[] = [];
    for (const [surface, all] of bySurface) {
      const entries = all.filter((entry) => {
        if (filter === 'open') {
          if (entry.kind !== 'open-loop' || entry.resolvedAt != null) {
            return false;
          }
        } else if (filter !== 'all' && entry.kind !== filter) {
          return false;
        }
        if (!search) return true;
        return `${entry.text} ${entry.surfaceLabel}`
          .toLowerCase()
          .includes(search);
      });
      if (!entries.length) continue;

      const verdict = all.find((entry) => entry.kind === 'verdict') ?? null;
      const openLoops = all.filter(
        (entry) => entry.kind === 'open-loop' && entry.resolvedAt == null
      );
      const goals = all.filter((entry) => entry.kind === 'goal');
      const decisions = all.filter((entry) => entry.kind === 'decision');
      const lastAt = Math.max(...all.map((entry) => entry.at));

      groups.push({
        surface,
        label: all[0]?.surfaceLabel || 'Direct Console',
        entries,
        verdict,
        openLoops,
        goals,
        decisions,
        lastAt,
        route: this.routeForSurface(surface),
        summary: this.summarizeRoom(
          verdict,
          openLoops,
          decisions,
          goals,
          all
        ),
      });
    }

    return groups.sort((a, b) => b.lastAt - a.lastAt);
  });

  constructor() {
    this.destroyRef.onDestroy(() => {
      if (this.clearTimer) clearTimeout(this.clearTimer);
      if (this.noticeTimer) clearTimeout(this.noticeTimer);
    });
  }

  setFilter(filter: CaseFileFilter): void {
    this.activeFilter.set(filter);
  }

  onSearch(event: Event): void {
    const value = (event.target as HTMLInputElement | null)?.value ?? '';
    this.query.set(value);
  }

  clearSearch(): void {
    this.query.set('');
  }

  /** Closes an open loop — the only entry kind the artist can resolve. */
  resolve(entry: SmuveMemoryEntry): void {
    if (entry.kind !== 'open-loop' || entry.resolvedAt != null) return;
    this.memory.resolve(entry.id);
    this.flash('Closed. Do not make me reopen it.');
  }

  /** Rejects a filing so the file stays evidence, not noise. */
  forget(entry: SmuveMemoryEntry): void {
    this.memory.forget(entry.id);
    this.flash('Struck from the record.');
  }

  /** Two-step wipe: the first press arms, the second clears. */
  clearAll(): void {
    if (!this.confirmingClear()) {
      this.confirmingClear.set(true);
      if (this.clearTimer) clearTimeout(this.clearTimer);
      this.clearTimer = setTimeout(() => this.confirmingClear.set(false), 5000);
      return;
    }
    this.confirmingClear.set(false);
    if (this.clearTimer) clearTimeout(this.clearTimer);
    this.memory.clear();
    this.flash('Case file cleared. New evidence only.');
  }

  /** Speaks the vault in a randomly selected voice for this room. */
  hearIt(): void {
    try {
      const presence = this.director?.announce('case-file');
      if (!presence) return;
      this.spoken.set({
        line: presence.line,
        archetype: presence.archetype,
      });
    } catch {
      // A host without a speech engine still gets the on-demand button.
    }
  }

  dismissSpoken(): void {
    this.spoken.set(null);
  }

  /** The empty state is where the record begins — open the console. */
  openConsole(): void {
    this.ui?.openChatbot();
  }

  /**
   * The workspace that owns the room this entry was filed in. Null only when
   * the career director is unavailable in a bare host, in which case the jump
   * button is hidden rather than sending the artist somewhere wrong.
   */
  sourceRoute(entry: SmuveMemoryEntry): string | null {
    return this.routeForSurface(entry.surface);
  }

  /** Jump back to the room that produced the verdict or open loop. */
  openSource(entry: SmuveMemoryEntry): void {
    this.openRoom(entry.surface);
  }

  /** Jump to a room from its grouped header. */
  openRoom(surface: SmuveSurfaceId): void {
    const route = this.routeForSurface(surface);
    if (route) this.router.navigateByUrl(route);
  }

  trackRoomId(_index: number, room: CaseFileRoomGroup): string {
    return room.surface;
  }

  kindLabel(entry: SmuveMemoryEntry): string {
    if (entry.kind === 'open-loop') {
      return entry.resolvedAt != null ? 'Closed loop' : 'Open loop';
    }
    if (entry.kind === 'decision') return 'Commitment';
    if (entry.kind === 'verdict') return 'Verdict';
    return 'Goal';
  }

  kindClass(entry: SmuveMemoryEntry): string {
    if (entry.kind === 'verdict') return 'text-brand-primary border-brand-primary/30 bg-brand-primary/10';
    if (entry.kind === 'goal') return 'text-sky-300 border-sky-400/30 bg-sky-400/10';
    if (entry.kind === 'decision') return 'text-violet-300 border-violet-400/30 bg-violet-400/10';
    return entry.resolvedAt != null
      ? 'text-emerald-300 border-emerald-400/25 bg-emerald-400/10'
      : 'text-amber-300 border-amber-400/30 bg-amber-400/10';
  }

  isOpenLoop(entry: SmuveMemoryEntry): boolean {
    return entry.kind === 'open-loop' && entry.resolvedAt == null;
  }

  /** Short, honest age label; the file never claims a memory it does not have. */
  agedOn(timestamp: number): string {
    const days = Math.floor((Date.now() - timestamp) / 86_400_000);
    if (days <= 0) return 'today';
    if (days === 1) return 'yesterday';
    if (days < 7) return `${days} days ago`;
    if (days < 30) return `${Math.floor(days / 7)} week${days < 14 ? '' : 's'} ago`;
    return `${Math.floor(days / 30)} month${days < 60 ? '' : 's'} ago`;
  }

  trackEntryId(_index: number, entry: SmuveMemoryEntry): string {
    return entry.id;
  }

  private routeForSurface(surface: SmuveSurfaceId): string | null {
    try {
      return this.director?.homeRouteFor(surface) ?? null;
    } catch {
      return null;
    }
  }

  /**
   * A short summary in S.M.U.V.E.'s first person, assembled only from entries
   * that actually exist. No judgement means it says so; a closed loop is never
   * described as open just to make the room sound busier.
   */
  private summarizeRoom(
    verdict: SmuveMemoryEntry | null,
    openLoops: SmuveMemoryEntry[],
    decisions: SmuveMemoryEntry[],
    goals: SmuveMemoryEntry[],
    all: SmuveMemoryEntry[]
  ): string {
    const parts: string[] = [];
    if (verdict) {
      parts.push(
        `My last verdict: “${this.excerpt(verdict.text, 130)}” (${this.agedOn(
          verdict.at
        )}).`
      );
    } else {
      parts.push('No verdict filed here yet.');
    }

    if (openLoops.length === 1) {
      parts.push(
        `One loop still open: “${this.excerpt(openLoops[0].text, 110)}”.`
      );
    } else if (openLoops.length > 1) {
      const oldest = openLoops[openLoops.length - 1];
      parts.push(
        `${openLoops.length} loops still open — the oldest: “${this.excerpt(
          oldest.text,
          110
        )}”.`
      );
    } else if (all.some((entry) => entry.kind === 'open-loop')) {
      parts.push('Every loop I filed here is closed.');
    }

    if (decisions.length) {
      parts.push(`You committed: “${this.excerpt(decisions[0].text, 100)}”.`);
    } else if (goals.length) {
      parts.push(`Your goal: “${this.excerpt(goals[0].text, 100)}”.`);
    }

    return parts.join(' ');
  }

  /** Trim a quote without adding an ellipsis to text that already fits. */
  private excerpt(text: string, limit: number): string {
    return text.length > limit
      ? `${text.slice(0, Math.max(0, limit - 1)).trimEnd()}…`
      : text;
  }

  private flash(message: string): void {
    this.notice.set(message);
    if (this.noticeTimer) clearTimeout(this.noticeTimer);
    this.noticeTimer = setTimeout(() => this.notice.set(''), 4000);
  }
}
