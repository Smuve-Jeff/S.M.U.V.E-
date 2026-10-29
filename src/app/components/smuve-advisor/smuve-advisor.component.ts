import {
  Component,
  DestroyRef,
  Injector,
  OnInit,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { AiService } from '../../services/ai.service';
import { AdvisorAdvice } from '../../types/ai.types';
import { UserContextService } from '../../services/user-context.service';
import { CommandPaletteService } from '../../services/command-palette.service';
import {
  ArtistLifecycleAlertService,
  LifecycleAlert,
} from '../../services/artist-lifecycle-alert.service';
import {
  SmuveCareerDirectorService,
  SmuveSurfaceIntel,
} from '../../services/smuve-career-director.service';
import {
  SmuveMemoryEntry,
  SmuveMemoryService,
} from '../../services/smuve-memory.service';
import { SpeechSynthesisService } from '../../services/speech-synthesis.service';
import { UIService } from '../../services/ui.service';

// We assume AdvisorAdvice might have a structure like this:
// export interface AdvisorAdvice {
//   id: string;
//   title: string;
//   description: string;
//   priority: 'high' | 'medium' | 'low';
//   action?: {
//     type: 'navigate' | 'command';
//     payload: string;
//   };
// }

@Component({
  selector: 'app-smuve-advisor',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './smuve-advisor.component.html',
  styleUrls: ['./smuve-advisor.component.css'],
})
export class SmuveAdvisorComponent implements OnInit {
  private aiService = inject(AiService);
  private userContext = inject(UserContextService);
  private router = inject(Router);
  private commandPalette = inject(CommandPaletteService);
  private lifecycleAlerts = inject(ArtistLifecycleAlertService);
  private memory = inject(SmuveMemoryService);
  private destroyRef = inject(DestroyRef);
  private speech = inject(SpeechSynthesisService, { optional: true });
  private ui = inject(UIService, { optional: true });

  advice = this.aiService.advisorAdvice;

  /**
   * The advisor is the one S.M.U.V.E. surface that is mounted everywhere, so it
   * is also the app-wide career/room read: the genre S.M.U.V.E. is mastering and
   * the stage it is holding the artist to, with a voice that changes each time
   * the artist asks to hear it.
   */
  private injector = inject(Injector);
  private get careerDirector(): SmuveCareerDirectorService | null {
    try {
      return this.injector.get(SmuveCareerDirectorService, null);
    } catch {
      return null;
    }
  }

  readonly roomIntel = computed<SmuveSurfaceIntel | null>(() => {
    try {
      return this.careerDirector?.surfaceIntel() ?? null;
    } catch {
      return null;
    }
  });

  /** Speaks this room's read in a randomly selected voice for that room. */
  announceRoom(): void {
    try {
      this.careerDirector?.announce();
    } catch {
      // A host without a speech engine still shows the printed read.
    }
  }

  /**
   * The verdict S.M.U.V.E. last delivered in this room, and the loops the
   * artist still owes it. The advisor is mounted everywhere, so this is where
   * the manager's memory is visible without opening the chat.
   */
  readonly roomVerdict = computed<SmuveMemoryEntry | null>(() => {
    const surface = this.roomIntel()?.surface;
    return surface ? this.memory.latestVerdict(surface) : null;
  });
  readonly openLoops = this.memory.openLoops;

  /** Closes a loop the artist has actually finished. */
  resolveLoop(id: string): void {
    this.memory.resolve(id);
  }

  /** Rejects a bad filing so the case file stays trustworthy. */
  forgetEntry(id: string): void {
    this.memory.forget(id);
  }

  /** Opens the dedicated workspace where the whole record can be audited. */
  openCaseFile(): void {
    this.isOpen.set(false);
    this.router.navigate(['/case-file']);
  }

  trackEntryId(_index: number, entry: SmuveMemoryEntry): string {
    return entry.id;
  }

  /** Honest age label for a memory row. */
  agedOn(timestamp: number): string {
    const days = Math.floor((Date.now() - timestamp) / 86_400_000);
    if (days <= 0) return 'today';
    if (days === 1) return 'yesterday';
    if (days < 7) return `${days}d ago`;
    if (days < 30) return `${Math.floor(days / 7)}w ago`;
    return `${Math.floor(days / 30)}mo ago`;
  }

  /**
   * Room-arrival presence: when the artist navigates, S.M.U.V.E. follows and
   * speaks the new room in a randomly chosen voice for it, then leaves a
   * dismissible line above the advisor button. Throttled hard so moving around
   * the app never becomes a lecture.
   */
  readonly arrival = signal<{ label: string; line: string } | null>(null);
  private lastSurface: string | null = null;
  private lastArrivalAt = 0;
  private arrivalTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    effect(() => {
      const director = this.careerDirector;
      const surface = director?.activeSurface?.();
      if (!surface) return;
      if (this.lastSurface === null) {
        this.lastSurface = surface;
        return;
      }
      if (surface === this.lastSurface) return;
      this.lastSurface = surface;
      this.showArrival();
    });
    this.destroyRef.onDestroy(() => {
      if (this.arrivalTimer) clearTimeout(this.arrivalTimer);
    });
  }

  private showArrival(): void {
    if (typeof document !== 'undefined' && document.hidden) return;
    const director = this.careerDirector;
    if (!director) return;
    // The chat announces its own room changes in the transcript; speaking both
    // would double the line, and the second utterance cancels the first.
    if (this.ui?.isChatbotOpen?.()) return;
    // Never cut off a reply that is mid-sentence.
    if (this.speech?.isSpeaking?.()) return;
    const now = Date.now();
    if (now - this.lastArrivalAt < 20_000) return;
    try {
      const presence = director.announce();
      this.lastArrivalAt = now;
      this.arrival.set({ label: presence.surfaceLabel, line: presence.line });
      if (this.arrivalTimer) clearTimeout(this.arrivalTimer);
      this.arrivalTimer = setTimeout(() => this.arrival.set(null), 9000);
    } catch {
      // No speech engine, no director: stay silent rather than break the shell.
    }
  }

  dismissArrival(): void {
    this.arrival.set(null);
    if (this.arrivalTimer) clearTimeout(this.arrivalTimer);
    this.arrivalTimer = null;
  }

  /**
   * Transitions the lifecycle watcher observed. These sit beside the standing
   * advice so the artist can tell "what to do" from "what changed", and each
   * one carries the snapshot values that raised it.
   */
  transitions = this.lifecycleAlerts.alerts;
  isOpen = signal(false);

  ngOnInit() {
    // Populate from the lifecycle before the artist opens the panel, so the
    // advisor has an evidence-backed recommendation ready instead of an empty
    // shell that only fills in after a manual refresh.
    this.refreshAdvice();
  }

  /**
   * Toggles the visibility of the advisor panel. Opening it re-reads the
   * lifecycle so advice reflects work done since the panel last closed.
   */
  toggleOpen() {
    const opening = !this.isOpen();
    if (opening) this.refreshAdvice();
    this.isOpen.set(opening);
  }

  /**
   * Rebuilds the advice queue from the current lifecycle snapshot: the primary
   * evidence-backed next move, any blocked phases, and release-readiness gaps.
   */
  refreshAdvice() {
    this.aiService.refreshAdvisorAdvice?.();
  }

  /**
   * Determines the display color based on advice priority.
   * @param priority The priority level ('high', 'medium', or other).
   * @returns Tailwind CSS classes for color and background.
   */
  getPriorityColor(priority: string): string {
    switch (priority) {
      case 'high':
        return 'text-red-400 border-red-400/30 bg-red-400/10';
      case 'medium':
        return 'text-orange-400 border-orange-400/30 bg-orange-400/10';
      default:
        return 'text-emerald-400 border-emerald-400/30 bg-emerald-400/10';
    }
  }

  /**
   * Executes a suggested action from an advice item.
   * This implementation assumes the 'action' property structure on AdvisorAdvice.
   * @param item The AdvisorAdvice object containing the action.
   */
  executeAction(item: AdvisorAdvice) {
    // Casting to `any` because the 'action' property is an assumption.
    const action = (item as any).action;

    if (!action) {
      return;
    }

    switch (action.type) {
      case 'navigate':
        this.router.navigate([action.payload]);
        break;
      case 'command':
        this.commandPalette.executeCommandById(action.payload);
        break;
      default:
        console.warn(`Unknown advisor action type: ${action.type}`);
    }

    // After executing, hide the panel and potentially dismiss the advice.
    this.isOpen.set(false);
    this.dismissAdvice(item);
  }

  /**
   * Dismisses a piece of advice (removes it from the active queue).
   * @param item The AdvisorAdvice object to dismiss.
   */
  dismissAdvice(item: AdvisorAdvice) {
    // Prefer the service so the dismissal survives the next lifecycle refresh;
    // the local update keeps the drawer correct if a host provides no service.
    this.aiService.dismissAdvisorAdvice?.(item.id);
    this.aiService.advisorAdvice.update((list) =>
      list.filter((candidate) => candidate?.id !== item.id)
    );
  }

  trackById(_index: number, item: AdvisorAdvice): string | number {
    return item?.id ?? _index;
  }

  trackAlertId(_index: number, alert: LifecycleAlert): string {
    return alert.id;
  }

  /** Opens the workspace that owns the change, then closes the drawer. */
  openTransition(alert: LifecycleAlert): void {
    this.lifecycleAlerts.dismiss(alert.id);
    this.isOpen.set(false);
    this.router.navigateByUrl(alert.actionRoute);
  }

  dismissTransition(id: string): void {
    this.lifecycleAlerts.dismiss(id);
  }
}
