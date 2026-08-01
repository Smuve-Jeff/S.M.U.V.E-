import { Injectable, computed, signal } from '@angular/core';

export type StudioTelemetryEventName =
  | 'studio_session_start'
  | 'studio_session_end'
  | 'view_changed'
  | 'starter_recipe_seeded'
  | 'new_project_created'
  | 'template_applied'
  | 'recording_mode_changed'
  | 'collab_started'
  | 'collab_joined'
  | 'collab_left'
  | 'project_saved'
  | 'project_exported'
  | 'midi_exported'
  | 'comp_takes_exported'
  | 'ai_mix_panel_opened'
  | 'ai_mix_analysis_run'
  | 'plugin_store_opened'
  | 'share_link_copied'
  | 'insights_panel_opened'
  | 'latency_probe_run'
  | 'coach_action_taken'
  | 'coach_action_dismissed'
  | 'studio_error';

export type StudioCoachActionId =
  | 'probe_latency'
  | 'seed_starter'
  | 'start_collab'
  | 'export_project'
  | 'open_ai_mix'
  | 'open_plugins'
  | 'share_link';

export interface StudioTelemetryEvent {
  id: string;
  sessionId: string | null;
  name: StudioTelemetryEventName;
  ts: number;
  success?: boolean;
  data?: Record<string, unknown>;
}

export interface StudioNorthStarMetrics {
  avgSessionMinutes: number;
  ideaToFirstLoopSeconds: number;
  exportSuccessRate: number;
  crashFreeSessionsRate: number;
  collabSessionRate: number;
  /** Rolling mean of latency_probe_run totalLatencyMs (0 when no probes). */
  avgLatencyMs: number;
  /** Rolling mean of offline speedRatio (0 when no probes). */
  avgRenderSpeedRatio: number;
  latencyProbeCount: number;
}

export interface StudioCompetitorScore {
  app: string;
  scores: Record<string, number>;
}

export interface StudioGapRow {
  category: string;
  weight: number;
  smuveScore: number;
  bestCompetitorScore: number;
  gap: number;
  weightedGap: number;
}

export interface StudioCoachAction {
  id: StudioCoachActionId;
  category: string;
  title: string;
  reason: string;
  ctaLabel: string;
  priority: number;
  /** Optional Studio view to open when the CTA runs. */
  targetView?: string;
}

export interface StudioWeeklyDashboard {
  generatedAt: number;
  windowDays: number;
  metrics: StudioNorthStarMetrics;
  eventVolume: Record<string, number>;
  prioritizedBacklog: StudioGapRow[];
  /** Live S.M.U.V.E category scores after telemetry adjustments. */
  liveScores: Record<string, number>;
  /** Top next-best actions ranked by weighted gap. */
  coachActions: StudioCoachAction[];
}

@Injectable({ providedIn: 'root' })
export class StudioTelemetryService {
  private readonly STORAGE_KEY = 'smuve_studio_telemetry_events_v1';
  private readonly DISMISS_KEY = 'smuve_studio_coach_dismissed_v1';
  private readonly MAX_EVENTS = 4000;
  private readonly WINDOW_DAYS = 7;

  private activeSessionId = signal<string | null>(null);
  private activeSessionStartedAt = signal<number | null>(null);
  private events = signal<StudioTelemetryEvent[]>(this.loadEvents());
  private dismissedCoachIds = signal<Set<StudioCoachActionId>>(
    this.loadDismissed()
  );

  /** Active studio session id (null when no session is open). */
  readonly activeSession = computed(() => this.activeSessionId());

  private readonly weights: Record<string, number> = {
    onboardingSpeed: 0.2,
    latencyReliability: 0.2,
    workflowVelocity: 0.18,
    collabFlywheel: 0.18,
    aiGuidanceDepth: 0.14,
    ecosystemLockIn: 0.1,
  };

  private readonly parity = signal<StudioCompetitorScore[]>([
    {
      app: 'S.M.U.V.E',
      scores: {
        onboardingSpeed: 72,
        latencyReliability: 66,
        workflowVelocity: 74,
        collabFlywheel: 70,
        aiGuidanceDepth: 82,
        ecosystemLockIn: 54,
      },
    },
    {
      app: 'BandLab',
      scores: {
        onboardingSpeed: 88,
        latencyReliability: 76,
        workflowVelocity: 79,
        collabFlywheel: 92,
        aiGuidanceDepth: 62,
        ecosystemLockIn: 87,
      },
    },
    {
      app: 'FL Studio Mobile',
      scores: {
        onboardingSpeed: 75,
        latencyReliability: 85,
        workflowVelocity: 91,
        collabFlywheel: 45,
        aiGuidanceDepth: 38,
        ecosystemLockIn: 73,
      },
    },
    {
      app: 'n-Track Studio',
      scores: {
        onboardingSpeed: 69,
        latencyReliability: 82,
        workflowVelocity: 80,
        collabFlywheel: 39,
        aiGuidanceDepth: 35,
        ecosystemLockIn: 67,
      },
    },
    {
      app: 'Audio Evolution Mobile Studio',
      scores: {
        onboardingSpeed: 63,
        latencyReliability: 89,
        workflowVelocity: 76,
        collabFlywheel: 34,
        aiGuidanceDepth: 28,
        ecosystemLockIn: 60,
      },
    },
    {
      app: 'Koala Sampler',
      scores: {
        onboardingSpeed: 93,
        latencyReliability: 79,
        workflowVelocity: 84,
        collabFlywheel: 30,
        aiGuidanceDepth: 24,
        ecosystemLockIn: 71,
      },
    },
  ]);

  readonly northStarMetrics = computed<StudioNorthStarMetrics>(() => {
    const events = this.recentEvents();
    const sessions = this.buildSessions(events);
    // Prefer sessions that actually ended. endAt may equal startAt when the
    // session is closed in the same millisecond (unit tests / instant teardown).
    const completed = sessions.filter((s) => s.ended);
    const avgSessionMs =
      completed.length > 0
        ? completed.reduce(
            (sum, s) => sum + Math.max(0, s.endAt - s.startAt),
            0
          ) / completed.length
        : 0;

    const ideaToFirstLoopSamples: number[] = [];
    for (const s of sessions) {
      const firstCreative = events.find(
        (e) =>
          e.sessionId === s.id &&
          [
            'starter_recipe_seeded',
            'template_applied',
            'recording_mode_changed',
            'ai_mix_analysis_run',
          ].includes(e.name)
      );
      if (firstCreative && firstCreative.ts >= s.startAt) {
        ideaToFirstLoopSamples.push(firstCreative.ts - s.startAt);
      }
    }
    const avgIdeaToFirstLoopMs =
      ideaToFirstLoopSamples.length > 0
        ? ideaToFirstLoopSamples.reduce((sum, v) => sum + v, 0) /
          ideaToFirstLoopSamples.length
        : 0;

    const exportEvents = events.filter((e) =>
      ['project_exported', 'midi_exported', 'comp_takes_exported'].includes(
        e.name
      )
    );
    const exportSuccess = exportEvents.filter(
      (e) => e.success !== false
    ).length;
    const exportSuccessRate =
      exportEvents.length === 0 ? 1 : exportSuccess / exportEvents.length;

    const crashSessionIds = new Set(
      events.filter((e) => e.name === 'studio_error').map((e) => e.sessionId)
    );
    const crashFreeSessionsRate =
      completed.length === 0
        ? 1
        : completed.filter((s) => !crashSessionIds.has(s.id)).length /
          completed.length;

    const collabSessionIds = new Set(
      events
        .filter((e) => ['collab_started', 'collab_joined'].includes(e.name))
        .map((e) => e.sessionId)
    );
    const collabSessionRate =
      completed.length === 0
        ? 0
        : completed.filter((s) => collabSessionIds.has(s.id)).length /
          completed.length;

    const latencyProbes = events.filter((e) => e.name === 'latency_probe_run');
    const latencySamples = latencyProbes
      .map((e) => Number(e.data?.['totalLatencyMs']))
      .filter((n) => Number.isFinite(n) && n >= 0);
    const speedSamples = latencyProbes
      .map((e) => Number(e.data?.['speedRatio']))
      .filter((n) => Number.isFinite(n) && n > 0);
    const avgLatencyMs =
      latencySamples.length > 0
        ? latencySamples.reduce((sum, v) => sum + v, 0) / latencySamples.length
        : 0;
    const avgRenderSpeedRatio =
      speedSamples.length > 0
        ? speedSamples.reduce((sum, v) => sum + v, 0) / speedSamples.length
        : 0;

    return {
      avgSessionMinutes: this.round(avgSessionMs / 60000, 2),
      ideaToFirstLoopSeconds: this.round(avgIdeaToFirstLoopMs / 1000, 1),
      exportSuccessRate: this.round(exportSuccessRate, 3),
      crashFreeSessionsRate: this.round(crashFreeSessionsRate, 3),
      collabSessionRate: this.round(collabSessionRate, 3),
      avgLatencyMs: this.round(avgLatencyMs, 1),
      avgRenderSpeedRatio: this.round(avgRenderSpeedRatio, 3),
      latencyProbeCount: latencyProbes.length,
    };
  });

  /**
   * Baseline S.M.U.V.E scores adjusted by observed north-star + latency
   * telemetry so the Insights backlog moves when the user actually closes gaps.
   */
  readonly liveScores = computed<Record<string, number>>(() => {
    const base = this.parity().find((r) => r.app === 'S.M.U.V.E')?.scores ?? {};
    const m = this.northStarMetrics();
    const recent = this.recentEvents();
    const volume = (name: StudioTelemetryEventName) =>
      recent.filter((e) => e.name === name).length;

    const onboardingDelta =
      (m.ideaToFirstLoopSeconds > 0
        ? m.ideaToFirstLoopSeconds <= 30
          ? 12
          : m.ideaToFirstLoopSeconds <= 90
            ? 6
            : m.ideaToFirstLoopSeconds <= 180
              ? 0
              : -8
        : 0) +
      Math.min(8, volume('starter_recipe_seeded') * 2) +
      Math.min(6, volume('template_applied') * 2);

    let latencyDelta = (m.crashFreeSessionsRate - 1) * 12;
    if (m.latencyProbeCount > 0) {
      if (m.avgLatencyMs <= 40) latencyDelta += 16;
      else if (m.avgLatencyMs <= 60) latencyDelta += 10;
      else if (m.avgLatencyMs <= 100) latencyDelta += 2;
      else latencyDelta -= 10;
      if (m.avgRenderSpeedRatio > 0) {
        if (m.avgRenderSpeedRatio <= 1) latencyDelta += 8;
        else if (m.avgRenderSpeedRatio <= 1.5) latencyDelta += 3;
        else latencyDelta -= 6;
      }
    }

    const workflowDelta =
      (m.exportSuccessRate - 1) * 18 +
      Math.min(10, volume('project_saved') * 1.5) +
      Math.min(8, volume('project_exported') + volume('midi_exported')) +
      (m.avgSessionMinutes >= 5 ? 4 : m.avgSessionMinutes >= 2 ? 2 : 0);

    const collabDelta =
      m.collabSessionRate * 22 +
      Math.min(8, volume('collab_started') + volume('collab_joined')) -
      // Empty week stays at baseline (collabSessionRate 0) without a penalty.
      0;

    const aiDelta =
      Math.min(10, volume('ai_mix_analysis_run') * 3) +
      Math.min(6, volume('ai_mix_panel_opened') * 2) -
      (volume('ai_mix_analysis_run') === 0 && recent.length > 12 ? 4 : 0);

    const ecoDelta =
      Math.min(12, volume('plugin_store_opened') * 3) +
      Math.min(8, volume('share_link_copied') * 2) +
      Math.min(6, volume('project_exported')) +
      (volume('plugin_store_opened') + volume('share_link_copied') === 0 &&
      recent.length > 12
        ? -4
        : 0);

    return {
      onboardingSpeed: this.clampScore(
        (base['onboardingSpeed'] ?? 0) + onboardingDelta
      ),
      latencyReliability: this.clampScore(
        (base['latencyReliability'] ?? 0) + latencyDelta
      ),
      workflowVelocity: this.clampScore(
        (base['workflowVelocity'] ?? 0) + workflowDelta
      ),
      collabFlywheel: this.clampScore(
        (base['collabFlywheel'] ?? 0) + collabDelta
      ),
      aiGuidanceDepth: this.clampScore(
        (base['aiGuidanceDepth'] ?? 0) + aiDelta
      ),
      ecosystemLockIn: this.clampScore(
        (base['ecosystemLockIn'] ?? 0) + ecoDelta
      ),
    };
  });

  readonly prioritizedBacklog = computed<StudioGapRow[]>(() => {
    const data = this.parity();
    const smuveScores = this.liveScores();
    const competitors = data.filter((r) => r.app !== 'S.M.U.V.E');
    const categories = Object.keys(this.weights);
    const rows: StudioGapRow[] = categories.map((category) => {
      const smuveScore = smuveScores[category] ?? 0;
      const bestCompetitorScore = competitors.reduce(
        (max, c) => Math.max(max, c.scores[category] ?? 0),
        0
      );
      const gap = Math.max(0, bestCompetitorScore - smuveScore);
      const weight = this.weights[category] ?? 0;
      return {
        category,
        weight,
        smuveScore,
        bestCompetitorScore,
        gap,
        weightedGap: this.round(gap * weight, 2),
      };
    });
    return rows.sort((a, b) => b.weightedGap - a.weightedGap);
  });

  readonly coachActions = computed<StudioCoachAction[]>(() => {
    const dismissed = this.dismissedCoachIds();
    const backlog = this.prioritizedBacklog();
    const metrics = this.northStarMetrics();
    const actions: StudioCoachAction[] = [];

    for (const row of backlog) {
      if (row.gap <= 0) continue;
      const action = this.buildCoachAction(row, metrics);
      if (!action) continue;
      if (dismissed.has(action.id)) continue;
      actions.push(action);
    }

    // Prefer higher weighted gaps; stable secondary sort by id.
    return actions
      .sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id))
      .slice(0, 4);
  });

  readonly weeklyDashboard = computed<StudioWeeklyDashboard>(() => {
    const recent = this.recentEvents();
    const eventVolume: Record<string, number> = {};
    for (const e of recent) {
      eventVolume[e.name] = (eventVolume[e.name] ?? 0) + 1;
    }
    return {
      generatedAt: Date.now(),
      windowDays: this.WINDOW_DAYS,
      metrics: this.northStarMetrics(),
      eventVolume,
      prioritizedBacklog: this.prioritizedBacklog(),
      liveScores: this.liveScores(),
      coachActions: this.coachActions(),
    };
  });

  beginSession(context?: Record<string, unknown>): string {
    const now = Date.now();
    const id = `studio_${now}_${Math.random().toString(36).slice(2, 8)}`;
    this.activeSessionId.set(id);
    this.activeSessionStartedAt.set(now);
    this.trackEvent('studio_session_start', context, true);
    return id;
  }

  endSession(reason: string = 'ended'): void {
    const sessionId = this.activeSessionId();
    const startedAt = this.activeSessionStartedAt();
    if (!sessionId || !startedAt) return;
    const durationMs = Math.max(0, Date.now() - startedAt);
    this.trackEvent('studio_session_end', { reason, durationMs }, true);
    this.activeSessionId.set(null);
    this.activeSessionStartedAt.set(null);
  }

  trackEvent(
    name: StudioTelemetryEventName,
    data?: Record<string, unknown>,
    success?: boolean
  ): void {
    const event: StudioTelemetryEvent = {
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      sessionId: this.activeSessionId(),
      name,
      ts: Date.now(),
      ...(success !== undefined ? { success } : {}),
      ...(data ? { data } : {}),
    };
    this.events.update((prev) => {
      const next = [...prev, event];
      if (next.length > this.MAX_EVENTS) {
        next.splice(0, next.length - this.MAX_EVENTS);
      }
      this.saveEvents(next);
      return next;
    });
  }

  /** Record an engine latency probe into the rolling telemetry window. */
  recordLatencyProbe(
    data: {
      totalLatencyMs: number;
      speedRatio?: number;
      masterWorkletActive?: boolean;
      sampleRateHz?: number;
    },
    success: boolean = true
  ): void {
    this.trackEvent('latency_probe_run', { ...data }, success);
  }

  /** Mark a coach CTA as completed (taken) and hide it for the local week. */
  completeCoachAction(
    id: StudioCoachActionId,
    data?: Record<string, unknown>
  ): void {
    this.trackEvent(
      'coach_action_taken',
      { actionId: id, ...(data || {}) },
      true
    );
    this.dismissCoachAction(id, false);
  }

  /** Soft-dismiss a coach CTA without treating it as completed. */
  dismissCoachAction(id: StudioCoachActionId, track: boolean = true): void {
    if (track) {
      this.trackEvent('coach_action_dismissed', { actionId: id }, true);
    }
    this.dismissedCoachIds.update((prev) => {
      const next = new Set(prev);
      next.add(id);
      this.saveDismissed(next);
      return next;
    });
  }

  /** Clear dismissed coach CTAs (used by tests / Insights reset). */
  resetCoachDismissals(): void {
    this.dismissedCoachIds.set(new Set());
    try {
      localStorage.removeItem(this.DISMISS_KEY);
    } catch {
      /* ignore */
    }
  }

  private recentEvents(): StudioTelemetryEvent[] {
    const minTs = Date.now() - this.WINDOW_DAYS * 24 * 60 * 60 * 1000;
    return this.events().filter((e) => e.ts >= minTs);
  }

  private buildSessions(events: StudioTelemetryEvent[]): Array<{
    id: string;
    startAt: number;
    endAt: number;
    ended: boolean;
  }> {
    const starts = events.filter((e) => e.name === 'studio_session_start');
    return starts.map((s) => {
      const end = events.find(
        (e) => e.sessionId === s.sessionId && e.name === 'studio_session_end'
      );
      return {
        id: s.sessionId ?? s.id,
        startAt: s.ts,
        endAt: end?.ts ?? s.ts,
        ended: !!end,
      };
    });
  }

  private loadEvents(): StudioTelemetryEvent[] {
    try {
      const raw = localStorage.getItem(this.STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(
        (e: any) =>
          e &&
          typeof e.id === 'string' &&
          typeof e.name === 'string' &&
          typeof e.ts === 'number'
      );
    } catch {
      return [];
    }
  }

  private saveEvents(events: StudioTelemetryEvent[]): void {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(events));
    } catch {
      // best-effort persistence
    }
  }

  private loadDismissed(): Set<StudioCoachActionId> {
    try {
      const raw = localStorage.getItem(this.DISMISS_KEY);
      if (!raw) return new Set();
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return new Set();
      return new Set(
        parsed.filter(
          (id: unknown): id is StudioCoachActionId => typeof id === 'string'
        )
      );
    } catch {
      return new Set();
    }
  }

  private saveDismissed(ids: Set<StudioCoachActionId>): void {
    try {
      localStorage.setItem(this.DISMISS_KEY, JSON.stringify([...ids]));
    } catch {
      // best-effort persistence
    }
  }

  private clampScore(value: number): number {
    return Math.max(0, Math.min(100, Math.round(value)));
  }

  private buildCoachAction(
    row: StudioGapRow,
    metrics: StudioNorthStarMetrics
  ): StudioCoachAction | null {
    const priority = row.weightedGap;
    switch (row.category) {
      case 'latencyReliability':
        return {
          id: 'probe_latency',
          category: row.category,
          title: 'Run engine latency probe',
          reason:
            metrics.latencyProbeCount === 0
              ? 'No latency samples yet — Audio Evolution leads reliability until we measure this device.'
              : `Avg round-trip ${metrics.avgLatencyMs} ms (gap −${row.gap}). Probe again after buffer tweaks.`,
          ctaLabel: 'Probe now',
          priority,
        };
      case 'onboardingSpeed':
        return {
          id: 'seed_starter',
          category: row.category,
          title: 'Seed a starter recipe',
          reason:
            metrics.ideaToFirstLoopSeconds > 90
              ? `Idea → first loop is ${metrics.ideaToFirstLoopSeconds}s. Starter recipes cut cold-start friction.`
              : 'Koala/BandLab win first-loop speed. Drop a starter loop to close the gap.',
          ctaLabel: 'Apply starter',
          priority,
          targetView: 'arrangement',
        };
      case 'collabFlywheel':
        return {
          id: 'start_collab',
          category: row.category,
          title: 'Start a collab session',
          reason: `Collab session rate is ${Math.round(
            metrics.collabSessionRate * 100
          )}%. BandLab’s flywheel starts with one shared booth.`,
          ctaLabel: 'Start collab',
          priority,
        };
      case 'workflowVelocity':
        return {
          id: 'export_project',
          category: row.category,
          title: 'Export this session',
          reason:
            metrics.exportSuccessRate < 1
              ? 'Recent exports failed — retry to protect workflow velocity.'
              : 'FL Mobile wins finish speed. Ship a bounce to raise the velocity score.',
          ctaLabel: 'Export project',
          priority,
        };
      case 'aiGuidanceDepth':
        return {
          id: 'open_ai_mix',
          category: row.category,
          title: 'Run AI Mix analysis',
          reason:
            'Keep the AI guidance lead warm — analyze the current mix and act on the top tip.',
          ctaLabel: 'Open AI Mix',
          priority,
        };
      case 'ecosystemLockIn':
        return {
          id: row.gap >= 20 ? 'open_plugins' : 'share_link',
          category: row.category,
          title:
            row.gap >= 20 ? 'Browse WASM plugin store' : 'Copy a share link',
          reason:
            row.gap >= 20
              ? 'Ecosystem lock-in trails BandLab. Enable a WASM insert to deepen the stack.'
              : 'Share the booth link so peers land in the same session graph.',
          ctaLabel: row.gap >= 20 ? 'Open plugins' : 'Copy link',
          priority,
          targetView: row.gap >= 20 ? 'plugins' : undefined,
        };
      default:
        return null;
    }
  }

  private round(value: number, precision = 2): number {
    const p = 10 ** precision;
    return Math.round(value * p) / p;
  }
}
