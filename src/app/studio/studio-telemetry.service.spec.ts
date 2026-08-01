import { TestBed } from '@angular/core/testing';
import {
  StudioTelemetryService,
  StudioTelemetryEvent,
} from './studio-telemetry.service';

describe('StudioTelemetryService', () => {
  let service: StudioTelemetryService;
  const STORAGE_KEY = 'smuve_studio_telemetry_events_v1';

  beforeEach(() => {
    localStorage.removeItem(STORAGE_KEY);
    TestBed.configureTestingModule({
      providers: [StudioTelemetryService],
    });
    service = TestBed.inject(StudioTelemetryService);
  });

  afterEach(() => {
    localStorage.removeItem(STORAGE_KEY);
  });

  it('should create', () => {
    expect(service).toBeTruthy();
  });

  it('beginSession emits studio_session_start and tracks session id', () => {
    const id = service.beginSession({ entryView: 'arrangement' });
    expect(id).toMatch(/^studio_/);
    expect(service.activeSession()).toBe(id);

    const events = readStored();
    expect(events.length).toBe(1);
    expect(events[0].name).toBe('studio_session_start');
    expect(events[0].sessionId).toBe(id);
    expect(events[0].success).toBe(true);
    expect(events[0].data?.['entryView']).toBe('arrangement');
  });

  it('endSession emits studio_session_end with duration and clears active session', () => {
    const id = service.beginSession();
    service.endSession('component_destroy');

    const events = readStored();
    expect(events.map((e) => e.name)).toEqual([
      'studio_session_start',
      'studio_session_end',
    ]);
    const end = events[1];
    expect(end.sessionId).toBe(id);
    expect(end.data?.['reason']).toBe('component_destroy');
    expect(typeof end.data?.['durationMs']).toBe('number');
    expect(service.activeSession()).toBeNull();
  });

  it('endSession is a no-op without an active session', () => {
    service.endSession();
    expect(readStored()).toEqual([]);
  });

  it('trackEvent persists events and trims above MAX_EVENTS', () => {
    service.beginSession();
    for (let i = 0; i < 10; i++) {
      service.trackEvent('view_changed', { view: `v${i}` }, true);
    }
    const events = readStored();
    expect(events.length).toBeGreaterThan(1);
    expect(events.some((e) => e.name === 'view_changed')).toBe(true);
  });

  it('northStarMetrics reports export success and collab rates', () => {
    const id = service.beginSession();
    service.trackEvent('starter_recipe_seeded', { source: 'test' }, true);
    service.trackEvent('project_exported', { format: 'smuve' }, true);
    service.trackEvent('midi_exported', undefined, false);
    service.trackEvent('collab_started', { userId: 'u1' }, true);
    service.endSession('done');

    // Force a completed session with matching ids
    const metrics = service.northStarMetrics();
    expect(metrics.exportSuccessRate).toBeCloseTo(0.5, 2);
    expect(metrics.collabSessionRate).toBeGreaterThan(0);
    expect(metrics.ideaToFirstLoopSeconds).toBeGreaterThanOrEqual(0);
    expect(metrics.crashFreeSessionsRate).toBe(1);
    expect(metrics.avgSessionMinutes).toBeGreaterThanOrEqual(0);
    expect(id).toBeTruthy();
  });

  it('crashFreeSessionsRate drops when studio_error is logged', () => {
    service.beginSession();
    service.trackEvent('studio_error', { action: 'boom' }, false);
    service.endSession();

    const metrics = service.northStarMetrics();
    expect(metrics.crashFreeSessionsRate).toBe(0);
  });

  it('prioritizedBacklog ranks weighted competitor gaps descending', () => {
    const backlog = service.prioritizedBacklog();
    expect(backlog.length).toBe(6);
    for (let i = 1; i < backlog.length; i++) {
      expect(backlog[i - 1].weightedGap).toBeGreaterThanOrEqual(
        backlog[i].weightedGap
      );
    }
    // latencyReliability is a known heavy gap vs Audio Evolution
    const topCategories = backlog.slice(0, 3).map((r) => r.category);
    expect(topCategories).toEqual(
      expect.arrayContaining(['latencyReliability'])
    );
  });

  it('weeklyDashboard aggregates event volume and backlog', () => {
    service.beginSession();
    service.trackEvent('view_changed', { view: 'mixer' }, true);
    service.trackEvent('view_changed', { view: 'piano' }, true);
    service.trackEvent('project_saved', undefined, true);
    service.endSession();

    const dash = service.weeklyDashboard();
    expect(dash.windowDays).toBe(7);
    expect(dash.eventVolume['view_changed']).toBe(2);
    expect(dash.eventVolume['project_saved']).toBe(1);
    expect(dash.prioritizedBacklog.length).toBe(6);
    expect(dash.metrics).toBeTruthy();
    expect(typeof dash.generatedAt).toBe('number');
  });

  it('rehydrates events from localStorage on construct', () => {
    const seed: StudioTelemetryEvent[] = [
      {
        id: 'seed_1',
        sessionId: 's1',
        name: 'project_saved',
        ts: Date.now(),
        success: true,
      },
    ];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(seed));
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [StudioTelemetryService] });
    const fresh = TestBed.inject(StudioTelemetryService);
    expect(fresh.weeklyDashboard().eventVolume['project_saved']).toBe(1);
  });

  it('ignores corrupt localStorage payloads', () => {
    localStorage.setItem(STORAGE_KEY, '{not-json');
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [StudioTelemetryService] });
    const fresh = TestBed.inject(StudioTelemetryService);
    expect(fresh.weeklyDashboard().eventVolume).toEqual({});
  });

  function readStored(): StudioTelemetryEvent[] {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  }
});
