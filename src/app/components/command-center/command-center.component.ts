import {
  Component,
  inject,
  signal,
  computed,
  effect,
  ElementRef,
  viewChild,
  OnInit,
  OnDestroy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { UIService } from '../../services/ui.service';
import { AiService } from '../../services/ai.service';
import { UserProfileService } from '../../services/user-profile.service';
import {
  UpgradeRecommendation,
  StrategicRecommendation,
} from '../../types/ai.types';

interface TerminalLog {
  id: number;
  timestamp: number;
  type: 'command' | 'system' | 'response';
  message: string;
}

@Component({
  selector: 'app-command-center',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './command-center.component.html',
  styleUrls: ['./command-center.component.css'],
})
export class CommandCenterComponent implements OnInit, OnDestroy {
  public aiService = inject(AiService);
  public profileService = inject(UserProfileService);
  public uiService = inject(UIService);

  recommendations = computed(() =>
    this.aiService
      .getUpgradeRecommendations()
      .filter(
        (recommendation) =>
          !['dismissed', 'not-relevant'].includes(recommendation.state || '')
      )
      .slice(0, 2)
  );
  recommendationHistory = computed(() =>
    [...(this.profileService.profile().recommendationHistory || [])]
      .slice()
      .reverse()
      .slice(0, 4)
  );
  strategicRecs = signal<StrategicRecommendation[]>([]);
  isPoweringUp = signal(false);

  // Terminal state
  terminalLogs = signal<TerminalLog[]>([]);
  private decreePollId: ReturnType<typeof setInterval> | null = null;
  private terminalIntervalId: ReturnType<typeof setInterval> | null = null;

  /** Monotonic log ids so equal-millisecond entries never collide in track. */
  private nextLogId = 1;

  // Command history for ↑/↓ recall, mirroring a real HUD terminal.
  commandHistory = signal<string[]>([]);
  private historyIndex = signal(-1);
  private draft = '';

  /** One-tap strategic commands surfaced as chips above the input. */
  readonly quickCommands = [
    { label: 'Status', command: 'status' },
    { label: 'Intel', command: '/intel' },
    { label: 'Reference Modulation', command: 'reference modulation' },
    { label: 'Release Window', command: 'protect the release window' },
  ];

  private terminalOutput = viewChild<ElementRef<HTMLElement>>('terminalOutput');

  constructor() {
    effect(() => {
      // Keep the newest directive in view: every append scrolls the HUD
      // stream to the bottom, like a real terminal hum.
      this.terminalLogs().length;
      const el = this.terminalOutput()?.nativeElement;
      if (el) el.scrollTop = el.scrollHeight;
    });
  }

  ngOnInit() {
    this.startTerminalSimulation();
    this.loadStrategicRecommendations();
  }

  /** Recall the previous/next executed command from this session. */
  recallHistory(event: KeyboardEvent): void {
    const history = this.commandHistory();
    if (!history.length) return;
    const index = this.historyIndex();
    if (event.key === 'ArrowUp') {
      this.historyIndex.set(Math.min(index + 1, history.length - 1));
    } else if (event.key === 'ArrowDown') {
      const next = index - 1;
      if (next < 0) {
        this.historyIndex.set(-1);
        this.restoreDraft(event.target as HTMLInputElement);
        return;
      }
      this.historyIndex.set(next);
    } else {
      return;
    }
    const recalled = history[this.historyIndex()];
    const input = event.target as HTMLInputElement;
    if (this.historyIndex() === history.length - 1 && index === -1) {
      this.draft = input.value;
    }
    input.value = recalled ?? '';
    event.preventDefault();
  }

  private restoreDraft(input: HTMLInputElement) {
    input.value = this.draft;
    this.draft = '';
  }

  clearTerminal() {
    this.terminalLogs.set([
      {
        id: this.nextLogId++,
        timestamp: Date.now(),
        type: 'system',
        message: 'TERMINAL BUFFER CLEARED. AWAITING ORDERS.',
      },
    ]);
    this.commandHistory.set([]);
    this.historyIndex.set(-1);
    this.draft = '';
  }

  async loadStrategicRecommendations() {
    const recs = await this.aiService.getStrategicRecommendations();
    this.strategicRecs.set(recs);
  }

  ngOnDestroy() {
    if (this.decreePollId) clearInterval(this.decreePollId);
    if (this.terminalIntervalId) clearInterval(this.terminalIntervalId);
  }

  private startTerminalSimulation() {
    // Wait for decrees to be available
    this.decreePollId = setInterval(() => {
      const decrees = this.aiService.strategicDecrees();
      if (decrees.length === 0) return;

      if (this.decreePollId) clearInterval(this.decreePollId);
      this.decreePollId = null;
      this.terminalLogs.set([]);

      let currentLine = 0;
      this.terminalIntervalId = setInterval(() => {
        if (currentLine < decrees.length) {
          this.terminalLogs.update((logs) => [
            ...logs,
            {
              id: this.nextLogId++,
              timestamp: Date.now(),
              type: 'system',
              message: decrees[currentLine],
            },
          ]);
          currentLine++;
        } else if (this.terminalIntervalId) {
          clearInterval(this.terminalIntervalId);
          this.terminalIntervalId = null;
        }
      }, 800);
    }, 500);
  }

  async handleCommand(command: string) {
    const trimmed = command.trim();
    if (!trimmed) return;

    // Freshly-executed commands become the top of the recall stack. A repeat
    // keeps its existing slot instead of duplicating, so recalling a command
    // never fills the stack with copies of itself.
    if (!this.commandHistory().includes(trimmed)) {
      this.commandHistory.update((history) =>
        [trimmed, ...history].slice(0, 20)
      );
    }
    this.historyIndex.set(-1);
    this.draft = '';

    this.terminalLogs.update((logs) => [
      ...logs,
      {
        id: this.nextLogId++,
        timestamp: Date.now(),
        type: 'command',
        message: trimmed.toUpperCase(),
      },
    ]);

    const response = await this.aiService.processCommand(trimmed);

    setTimeout(() => {
      this.terminalLogs.update((logs) => [
        ...logs,
        {
          id: this.nextLogId++,
          timestamp: Date.now(),
          type: 'response',
          message: response,
        },
      ]);
    }, 400);
  }

  async acquireUpgrade(rec: UpgradeRecommendation) {
    this.isPoweringUp.set(true);

    await this.profileService.acquireUpgrade({
      title: rec.title,
      type: rec.type,
      recommendationId: rec.id,
    });

    this.terminalLogs.update((logs) => [
      ...logs,
      {
        id: this.nextLogId++,
        timestamp: Date.now(),
        type: 'system',
        message: `ALERT: INTEGRATING ${rec.title.toUpperCase()}. SYNCING NEURAL PATHWAYS.`,
      },
    ]);

    setTimeout(() => {
      this.isPoweringUp.set(false);
      if (rec.url) {
        // `noopener` matters here: the target is a third-party site, and
        // without it the opened page can reach back through `window.opener`
        // and navigate the app underneath the user.
        window.open(rec.url, '_blank', 'noopener,noreferrer');
      }
    }, 1200);
  }

  async saveRecommendation(rec: UpgradeRecommendation) {
    await this.profileService.setRecommendationState(rec.id, 'saved', rec);
  }

  async dismissRecommendation(rec: UpgradeRecommendation) {
    await this.profileService.setRecommendationState(
      rec.id,
      'not-relevant',
      rec
    );
  }

  async completeRecommendation(rec: UpgradeRecommendation) {
    await this.profileService.completeUpgrade({
      title: rec.title,
      type: rec.type,
      recommendationId: rec.id,
    });
  }

  focusRecommendation(rec: UpgradeRecommendation) {
    if (rec.toolId) {
      this.uiService.navigateToView(rec.toolId as any);
    }
  }

  initializeOperation(srec: StrategicRecommendation) {
    this.terminalLogs.update((logs) => [
      ...logs,
      {
        id: this.nextLogId++,
        timestamp: Date.now(),
        type: 'system',
        message: `INITIALIZING OPERATION: ${srec.action.toUpperCase()}...`,
      },
    ]);

    setTimeout(() => {
      if (srec.toolId) {
        this.uiService.navigateToView(srec.toolId as any);
      }
    }, 800);
  }

  getImpactColor(impact: string): string {
    switch (impact) {
      case 'Extreme':
        return 'text-violet-400 animate-pulse-subtle font-black';
      case 'High':
        return 'text-brand-primary';
      case 'Medium':
        return 'text-yellow-400';
      case 'Low':
        return 'text-slate-400';
      default:
        return 'text-white';
    }
  }
}
