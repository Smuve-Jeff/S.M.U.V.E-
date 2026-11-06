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
import { MainViewMode } from '../../services/user-context.service';
import { StrategicRecommendation } from '../../types/ai.types';
import type { UpgradeRecommendation as UpgradeBlueprint } from '../../types/ai.types';

type TerminalLogType = 'command' | 'system' | 'response' | 'error';

interface TerminalLog {
  id: number;
  timestamp: number;
  type: TerminalLogType;
  message: string;
}

/**
 * The service exposes upgrade blueprints through its own contract (which also
 * carries `preferredViews`), while the template consumes the richer canonical
 * record shared by Strategy Hub and Practice. Intersecting the two keeps both
 * halves typed instead of casting every field the blueprint happens to carry.
 */
type CommandDirective = ReturnType<
  AiService['getUpgradeRecommendations']
>[number] &
  Omit<Partial<UpgradeBlueprint>, 'type' | 'impact' | 'state'>;

type LocalCommand = 'help' | 'status' | 'intel' | 'audit' | 'clear';

const AUDIT_STEPS = [
  'READING PROFILE EVIDENCE',
  'SCANNING SESSION TRACKS',
  'SCORING CATALOGUE',
  'SYNTHESIZING VERDICT',
];

const COMMAND_HELP = [
  'TERMINAL COMMANDS',
  '  help      this list',
  '  status    live link, audit and directive state',
  '  intel     current strategic briefs',
  '  audit     run the executive audit',
  '  clear     clear this buffer',
  '  up/down   recall an executed command',
  '',
  'Anything else is routed to S.M.U.V.E. as a strategic directive.',
].join('\n');

/**
 * Blueprint ids are destinations in the product, not router modes. Several of
 * them (`legal-executioner`, `quantum-master`, ...) previously fell through to
 * a nonexistent route, so the focus button silently did nothing.
 */
const DIRECTIVE_DESTINATIONS: Record<string, MainViewMode> = {
  hub: 'hub',
  studio: 'studio',
  mastering: 'mastering',
  'quantum-master': 'mastering',
  'stem-splitter': 'dj',
  'legal-executioner': 'business-suite',
  'tha-spot-god': 'tha-spot',
  'ghostwriter-v2': 'cowrite',
  'engagement-hijack': 'strategy',
};

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

  /** Every directive still in play, before the workspace's two-card preview. */
  readonly activeDirectives = computed<CommandDirective[]>(() =>
    this.aiService
      .getUpgradeRecommendations()
      .filter(
        (recommendation) =>
          !['dismissed', 'not-relevant'].includes(recommendation.state || '')
      )
  );
  recommendations = computed(() => this.activeDirectives().slice(0, 2));
  hiddenDirectiveCount = computed(() =>
    Math.max(0, this.activeDirectives().length - this.recommendations().length)
  );
  recommendationHistory = computed(() =>
    [...(this.profileService.profile().recommendationHistory || [])]
      .slice()
      .reverse()
      .slice(0, 4)
  );
  directiveStats = computed(() => {
    const history = this.profileService.profile().recommendationHistory || [];
    return {
      decisions: history.length,
      completed: history.filter((entry) => entry.state === 'completed').length,
      acquired: history.filter((entry) => entry.state === 'acquired').length,
    };
  });
  strategicRecs = signal<StrategicRecommendation[]>([]);
  isPoweringUp = signal(false);
  actionError = signal('');
  pendingDirectiveIds = signal<string[]>([]);

  // Terminal state
  terminalLogs = signal<TerminalLog[]>([]);
  commandPending = signal(false);
  private decreePollId: ReturnType<typeof setInterval> | null = null;
  private terminalIntervalId: ReturnType<typeof setInterval> | null = null;
  private readonly timers = new Set<ReturnType<typeof setTimeout>>();
  private destroyed = false;

  // Audit state: the panel used to read two AiService members that never
  // existed, so the scanning branch was both dead and a latent runtime crash.
  auditRunning = signal(false);
  auditStep = signal('');
  auditProgress = signal(0);

  /** Monotonic log ids so equal-millisecond entries never collide in track. */
  private nextLogId = 1;

  // Command history for up/down recall, mirroring a real HUD terminal.
  commandHistory = signal<string[]>([]);
  private historyIndex = signal(-1);
  private draft = '';

  /** One-tap strategic commands surfaced as chips above the input. */
  readonly quickCommands = [
    { label: 'Status', command: 'status' },
    { label: 'Intel', command: 'intel' },
    { label: 'Reference Modulation', command: 'reference modulation' },
    { label: 'Release Window', command: 'protect the release window' },
  ];

  /** Human labels for the telemetry strip; the keys stay the service contract. */
  readonly metrics = [
    { key: 'cpuLoad', label: 'CPU Load' },
    { key: 'neuralSync', label: 'Neural Sync' },
    { key: 'memoryUsage', label: 'Memory' },
    { key: 'latency', label: 'Latency' },
  ] as const;

  /**
   * The header ticker used to render only `marketAlerts`, which nothing ever
   * writes, so the strip was permanently blank. Audited intelligence briefs are
   * real, derived content, so they fill the ticker until a market alert lands.
   */
  readonly tickerItems = computed(() => {
    const alerts = this.aiService.marketAlerts();
    if (alerts.length) {
      return alerts.slice(0, 4).map((alert) => ({
        id: alert.id,
        tag: `${alert.severity} · ${alert.category}`.toUpperCase(),
        title: alert.title,
        message: alert.message,
      }));
    }
    return this.aiService
      .intelligenceBriefs()
      .slice(0, 3)
      .map((brief: any) => ({
        id: String(brief?.id ?? brief?.title ?? 'brief'),
        tag: String(brief?.category ?? 'INTEL').toUpperCase(),
        title: String(brief?.title ?? ''),
        message: String(brief?.content ?? ''),
      }));
  });

  /** Reading all 29 decrees at once clipped the banner; lead with the first three. */
  headlineDecrees = computed(() =>
    this.aiService.strategicDecrees().slice(0, 3)
  );

  private terminalOutput = viewChild<ElementRef<HTMLElement>>('terminalOutput');

  constructor() {
    effect(() => {
      // Keep the newest directive in view: every append scrolls the HUD
      // stream to the bottom, like a real terminal hum. Reading the array
      // length here is what subscribes the effect to new log entries.
      const logCount = this.terminalLogs().length;
      const el = this.terminalOutput()?.nativeElement;
      if (el && logCount > 0) el.scrollTop = el.scrollHeight;
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
    this.destroyed = true;
    if (this.decreePollId) clearInterval(this.decreePollId);
    if (this.terminalIntervalId) clearInterval(this.terminalIntervalId);
    this.decreePollId = null;
    this.terminalIntervalId = null;
    for (const timer of this.timers) clearTimeout(timer);
    this.timers.clear();
  }

  private startTerminalSimulation() {
    // Wait for decrees to be available
    this.decreePollId = setInterval(() => {
      const decrees = this.aiService.strategicDecrees();
      if (decrees.length === 0) return;

      if (this.decreePollId) clearInterval(this.decreePollId);
      this.decreePollId = null;

      // Never wipe a buffer the artist already filled with commands.
      let currentLine = 0;
      this.terminalIntervalId = setInterval(() => {
        if (this.destroyed) return;
        if (currentLine < decrees.length) {
          this.appendLog('system', decrees[currentLine]);
          currentLine++;
        } else if (this.terminalIntervalId) {
          clearInterval(this.terminalIntervalId);
          this.terminalIntervalId = null;
        }
      }, 800);
    }, 500);
  }

  private appendLog(type: TerminalLogType, message: string) {
    if (this.destroyed || !message) return;
    this.terminalLogs.update((logs) => [
      ...logs,
      {
        id: this.nextLogId++,
        timestamp: Date.now(),
        type,
        message,
      },
    ]);
  }

  private wait(ms: number): Promise<void> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.timers.delete(timer);
        resolve();
      }, ms);
      this.timers.add(timer);
    });
  }

  private trackTimeout(run: () => void, ms: number) {
    const timer = setTimeout(() => {
      this.timers.delete(timer);
      if (!this.destroyed) run();
    }, ms);
    this.timers.add(timer);
  }

  /**
   * Run the executive audit as a visible staged process.
   *
   * `performExecutiveAudit()` is synchronous, so the panel's old scanning
   * branch could never render and referenced two signals that did not exist.
   * The stages name what the audit actually reads; the panel now has a real
   * progress state and reports the verdict into the terminal.
   */
  async runAudit(): Promise<void> {
    if (this.auditRunning()) return;
    this.auditRunning.set(true);
    this.auditProgress.set(0);
    this.appendLog('system', 'EXECUTIVE AUDIT INITIATED. READING LIVE EVIDENCE.');
    try {
      for (let index = 0; index < AUDIT_STEPS.length; index++) {
        this.auditStep.set(
          `STEP ${index + 1}/${AUDIT_STEPS.length} · ${AUDIT_STEPS[index]}`
        );
        this.auditProgress.set(
          Math.round((index / AUDIT_STEPS.length) * 100)
        );
        await this.wait(180);
        if (this.destroyed) return;
      }

      this.auditStep.set('SYNTHESIZING VERDICT');
      const report = this.aiService.performExecutiveAudit();
      this.auditProgress.set(100);

      const verdict =
        report.overallScore >= 75 ? 'AUDIT PASSED' : 'DEFICIENCIES FOUND';
      const deficit = report.criticalDeficits[0];
      const nextMove = report.technicalRecommendations[0];
      this.appendLog(
        'response',
        [
          `${verdict} — ${report.overallScore}/100 · cohesion ${report.sonicCohesion}% · viability ${report.marketViability}%`,
          deficit ? `PRIMARY DEFICIT: ${deficit}` : '',
          nextMove ? `NEXT MOVE: ${nextMove}` : '',
        ]
          .filter(Boolean)
          .join('\n')
      );

      const brief = this.aiService.intelligenceBriefs()[0];
      if (brief) this.appendLog('system', `INTEL UPDATED: ${brief.title}`);
    } catch (error) {
      this.appendLog('error', `AUDIT FAILED — ${this.describeError(error)}`);
    } finally {
      if (!this.destroyed) {
        this.auditRunning.set(false);
        this.auditStep.set('');
        this.auditProgress.set(0);
      }
    }
  }

  async handleCommand(command: string) {
    const trimmed = command.trim();
    if (!trimmed || this.commandPending()) return;

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

    this.appendLog('command', trimmed.toUpperCase());
    this.commandPending.set(true);
    try {
      switch (this.localCommand(trimmed)) {
        case 'clear':
          this.clearTerminal();
          return;
        case 'help':
          this.appendLog('response', COMMAND_HELP);
          return;
        case 'status':
          this.appendLog('response', this.statusReport());
          return;
        case 'intel':
          this.appendLog('response', this.intelReport());
          return;
        case 'audit':
          await this.runAudit();
          return;
      }

      // Freeform directives go to the live model instead of the old canned
      // roast, so the cockpit can actually answer what it was asked.
      const response = await this.aiService.getAIResponse(trimmed);
      this.appendLog('response', response || 'NO RESPONSE RETURNED.');
    } catch (error) {
      this.appendLog('error', `COMMAND FAILED — ${this.describeError(error)}`);
    } finally {
      this.commandPending.set(false);
    }
  }

  private localCommand(command: string): LocalCommand | null {
    const key = command
      .toLowerCase()
      .replace(/^\/+/, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (['help', '?', 'commands'].includes(key)) return 'help';
    if (['status', 'sys', 'system status'].includes(key)) return 'status';
    if (['intel', 'brief', 'briefs', 'briefing'].includes(key)) return 'intel';
    if (['audit', 'scan', 'run audit', 'full audit'].includes(key))
      return 'audit';
    if (['clear', 'cls'].includes(key)) return 'clear';
    return null;
  }

  /** Real state only — no invented CPU, latency or sync numbers. */
  private statusReport(): string {
    const audit = this.aiService.executiveAudit();
    const link = this.aiService.aiStatusLabel?.() ?? 'AI ready';
    const access = this.aiService.aiAccess?.() === false ? 'locked' : 'unlocked';
    return [
      `LINK: ${link} · AI ACCESS: ${access}`,
      `AUDIT: ${
        audit
          ? `${audit.overallScore}/100 · ${audit.criticalDeficits.length} deficit(s)`
          : 'not run'
      }`,
      `SCAN: ${this.auditRunning() ? 'running' : 'idle'} · DIRECTIVES: ${
        this.activeDirectives().length
      } active`,
      `DECISIONS LOGGED: ${
        this.profileService.profile().recommendationHistory?.length ?? 0
      }`,
    ].join('\n');
  }

  private intelReport(): string {
    let briefs = this.aiService.intelligenceBriefs();
    if (!briefs.length) {
      briefs = this.aiService.refreshIntelligenceBriefs?.() ?? [];
    }
    if (!briefs.length) {
      return 'NO INTEL AVAILABLE. RUN AN EXECUTIVE AUDIT TO GENERATE BRIEFS.';
    }
    return briefs
      .slice(0, 4)
      .map(
        (brief: any) =>
          `[${String(brief?.category ?? 'INTEL').toUpperCase()} · ${String(
            brief?.impact ?? 'MEDIUM'
          ).toUpperCase()}] ${brief?.title ?? 'Untitled brief'}\n${
            brief?.content ?? ''
          }`
      )
      .join('\n\n');
  }

  private describeError(error: unknown): string {
    const message =
      error instanceof Error ? error.message : String(error ?? 'Unknown error');
    return message.length > 200 ? `${message.slice(0, 197)}...` : message;
  }

  /**
   * Shared guard for recommendation decisions: one in-flight write per
   * directive, every failure surfaced, and terminal feedback for every action.
   * Without the guard a double click appended two identical history entries.
   */
  private async runDirectiveAction(
    rec: CommandDirective,
    verb: string,
    action: () => Promise<unknown>
  ): Promise<void> {
    if (this.pendingDirectiveIds().includes(rec.id)) return;
    this.actionError.set('');
    this.pendingDirectiveIds.update((ids) => [...ids, rec.id]);
    try {
      await action();
      this.appendLog('system', `${verb}: ${rec.title.toUpperCase()}.`);
    } catch (error) {
      const message = `COULD NOT ${verb} “${rec.title}”. ${this.describeError(
        error
      )}`;
      this.actionError.set(message);
      this.appendLog('error', message);
    } finally {
      this.pendingDirectiveIds.update((ids) =>
        ids.filter((id) => id !== rec.id)
      );
    }
  }

  async acquireUpgrade(rec: CommandDirective) {
    if (
      this.pendingDirectiveIds().includes(rec.id) ||
      this.isPoweringUp()
    ) {
      return;
    }
    this.actionError.set('');
    this.pendingDirectiveIds.update((ids) => [...ids, rec.id]);
    try {
      await this.profileService.acquireUpgrade({
        title: rec.title,
        type: rec.type,
        recommendationId: rec.id,
      });

      this.appendLog(
        'system',
        `ALERT: INTEGRATING ${rec.title.toUpperCase()}. SYNCING NEURAL PATHWAYS.`
      );
      this.isPoweringUp.set(true);

      this.trackTimeout(() => {
        this.isPoweringUp.set(false);
        if (rec.url) {
          // `noopener` matters here: the target is a third-party site, and
          // without it the opened page can reach back through `window.opener`
          // and navigate the app underneath the user.
          window.open(rec.url, '_blank', 'noopener,noreferrer');
        }
      }, 1200);
    } catch (error) {
      // The overlay used to be left on forever when the profile write failed.
      this.isPoweringUp.set(false);
      const message = `COULD NOT ACQUIRE “${rec.title}”. ${this.describeError(
        error
      )}`;
      this.actionError.set(message);
      this.appendLog('error', message);
    } finally {
      this.pendingDirectiveIds.update((ids) =>
        ids.filter((id) => id !== rec.id)
      );
    }
  }

  async saveRecommendation(rec: CommandDirective) {
    await this.runDirectiveAction(rec, 'DIRECTIVE SAVED', () =>
      this.profileService.setRecommendationState(rec.id, 'saved', rec)
    );
  }

  async dismissRecommendation(rec: CommandDirective) {
    await this.runDirectiveAction(rec, 'DIRECTIVE DISMISSED', () =>
      this.profileService.setRecommendationState(rec.id, 'not-relevant', rec)
    );
  }

  async completeRecommendation(rec: CommandDirective) {
    await this.runDirectiveAction(rec, 'DIRECTIVE COMPLETED', () =>
      this.profileService.completeUpgrade({
        title: rec.title,
        type: rec.type,
        recommendationId: rec.id,
      })
    );
  }

  isDirectivePending(id: string): boolean {
    return this.pendingDirectiveIds().includes(id);
  }

  focusRecommendation(rec: CommandDirective) {
    const destination = this.directiveDestination(rec);
    if (!destination) {
      this.appendLog(
        'error',
        `NO DESTINATION MAPPED FOR ${rec.title.toUpperCase()}. OPEN INTEL LAB.`
      );
      return;
    }
    this.appendLog(
      'system',
      `ROUTING TO ${destination.toUpperCase()} — ${rec.title.toUpperCase()}`
    );
    this.uiService.navigateToView(destination);
  }

  initializeOperation(srec: StrategicRecommendation) {
    const destination = this.directiveDestination(srec);
    this.appendLog(
      'system',
      `INITIALIZING OPERATION: ${srec.action.toUpperCase()}...`
    );
    if (!destination) {
      this.appendLog(
        'error',
        `NO DESTINATION MAPPED FOR ${srec.action.toUpperCase()}.`
      );
      return;
    }
    this.trackTimeout(() => {
      this.uiService.navigateToView(destination);
    }, 800);
  }

  /** The view a directive should actually open, or null when none exists. */
  private directiveDestination(source: {
    toolId?: string;
    preferredViews?: MainViewMode[];
  }): MainViewMode | null {
    const tool = (source.toolId ?? '').trim().toLowerCase();
    if (tool && DIRECTIVE_DESTINATIONS[tool]) {
      return DIRECTIVE_DESTINATIONS[tool];
    }
    return source.preferredViews?.[0] ?? null;
  }

  /**
   * Browsers cannot measure CPU load, memory use or network latency directly,
   * so those readings stay zero in the service. Render that as unavailable
   * instead of a measured-looking "0%".
   */
  formatMetric(metric: string): string {
    const value = (this.aiService.systemStatus() as any)[metric];
    if (!value) return 'n/a';
    return `${value}${metric === 'latency' ? 'ms' : '%'}`;
  }

  getImpactColor(impact: string): string {
    switch (String(impact || '').toLowerCase()) {
      case 'extreme':
      case 'absolute':
        return 'text-violet-400 animate-pulse-subtle font-black';
      case 'critical':
      case 'high':
        return 'text-brand-primary';
      case 'medium':
        return 'text-yellow-400';
      case 'low':
        return 'text-slate-400';
      default:
        return 'text-white';
    }
  }

  getStateClass(state?: string): string {
    switch (state) {
      case 'completed':
        return 'border-brand-primary/30 bg-brand-primary/10 text-brand-primary';
      case 'acquired':
        return 'border-blue-400/30 bg-blue-400/10 text-blue-400';
      case 'saved':
        return 'border-white/15 bg-white/5 text-white/90';
      default:
        return 'border-white/10 bg-black/20 text-silver-dim';
    }
  }
}
