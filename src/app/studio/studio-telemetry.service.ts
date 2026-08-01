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
  | 'studio_error';

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

export interface StudioWeeklyDashboard {
  generatedAt: number;
  windowDays: number;
  metrics: StudioNorthStarMetrics;
  eventVolume: Record<string, number>;
  prioritizedBacklog: StudioGapRow[];
}

@Injectable({ providedIn: 'root' })
export class StudioTelemetryService {
  private readonly STORAGE_KEY = 'smuve_studio_telemetry_events_v1';
  private readonly MAX_EVENTS = 4000;
  private readonly WINDOW_DAYS = 7;

  private activeSessionId = signal<string | null>(null);
  private activeSessionStartedAt = signal<number | null>(null);
  private events = signal<StudioTelemetryEvent[]>(this.loadEvents());

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

    return {
      avgSessionMinutes: this.round(avgSessionMs / 60000, 2),
      ideaToFirstLoopSeconds: this.round(avgIdeaToFirstLoopMs / 1000, 1),
      exportSuccessRate: this.round(exportSuccessRate, 3),
      crashFreeSessionsRate: this.round(crashFreeSessionsRate, 3),
      collabSessionRate: this.round(collabSessionRate, 3),
    };
  });

  readonly prioritizedBacklog = computed<StudioGapRow[]>(() => {
    const data = this.parity();
    const smuve = data.find((r) => r.app === 'S.M.U.V.E');
    if (!smuve) return [];
    const competitors = data.filter((r) => r.app !== 'S.M.U.V.E');
    const categories = Object.keys(this.weights);
    const rows: StudioGapRow[] = categories.map((category) => {
      const smuveScore = smuve.scores[category] ?? 0;
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

  private round(value: number, precision = 2): number {
    const p = 10 ** precision;
    return Math.round(value * p) / p;
  }
}
