import { TestBed } from '@angular/core/testing';
import { VcaBusService, VcaAssignments } from './vca-bus.service';

describe('VcaBusService', () => {
  let svc: VcaBusService;
  const STORAGE_KEY = 'smuve_vca_routing_v1';

  beforeEach(() => {
    localStorage.removeItem(STORAGE_KEY);
    TestBed.configureTestingModule({ providers: [VcaBusService] });
    svc = TestBed.inject(VcaBusService);
  });

  afterEach(() => localStorage.removeItem(STORAGE_KEY));

  it('starts empty', () => {
    expect(svc.buses()).toEqual([]);
    expect(svc.assignments()).toEqual({});
    expect(svc.busCount()).toBe(0);
  });

  it('createBus assigns uuid + default fader 1.0 + persists', () => {
    const a = svc.createBus('Drums');
    expect(a.id).toBeTruthy();
    expect(a.name).toBe('Drums');
    expect(a.faderValue).toBe(1.0);
    expect(a.muted).toBe(false);
    expect(svc.busCount()).toBe(1);
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    expect(stored.buses).toHaveLength(1);
  });

  it('createBus falls back to default name when blank', () => {
    const b = svc.createBus('   ');
    expect(b.name).toBe('VCA');
  });

  it('deleteBus removes bus + clears its assignments', () => {
    const b = svc.createBus('X');
    svc.assignTrack('t1', b.id);
    svc.assignTrack('t2', b.id);
    svc.assignTrack('t3', 'other-id');
    expect(svc.trackIdsForBus(b.id)).toHaveLength(2);
    svc.deleteBus(b.id);
    expect(svc.buses().find((x) => x.id === b.id)).toBeUndefined();
    expect(svc.assignments()['t1']).toBeNull();
    expect(svc.assignments()['t2']).toBeNull();
    expect(svc.assignments()['t3']).toBe('other-id');
  });

  it('setBusFader clamps to [0, 1.5]', () => {
    const b = svc.createBus('Y');
    svc.setBusFader(b.id, 5); // clamps to 1.5
    expect(svc.buses().find((x) => x.id === b.id)!.faderValue).toBe(1.5);
    svc.setBusFader(b.id, -5); // clamps to 0
    expect(svc.buses().find((x) => x.id === b.id)!.faderValue).toBe(0);
  });

  it('toggleBusMute flips muted state', () => {
    const b = svc.createBus('Z');
    expect(b.muted).toBe(false);
    svc.toggleBusMute(b.id);
    expect(svc.buses().find((x) => x.id === b.id)!.muted).toBe(true);
  });

  it('effectiveMultiplier returns 1 for unassigned tracks', () => {
    expect(svc.effectiveMultiplier('nope')).toBe(1);
  });

  it('effectiveMultiplier returns 0 when assigned bus is muted', () => {
    const b = svc.createBus('M');
    svc.assignTrack('t', b.id);
    svc.toggleBusMute(b.id);
    expect(svc.effectiveMultiplier('t')).toBe(0);
  });

  it('effectiveMultiplier clamps bus fader to [0,1.5]', () => {
    const b = svc.createBus('C');
    svc.assignTrack('t', b.id);
    svc.setBusFader(b.id, 0.4);
    expect(svc.effectiveMultiplier('t')).toBeCloseTo(0.4);
  });

  it('renames correctly', () => {
    const b = svc.createBus('Before');
    svc.renameBus(b.id, '  After  ');
    expect(svc.buses().find((x) => x.id === b.id)!.name).toBe('After');
    svc.renameBus(b.id, '   ');
    expect(svc.buses().find((x) => x.id === b.id)!.name).toBe('After'); // no-op on blank
  });

  it('trackIdsForBus filters correctly', () => {
    const b = svc.createBus('F');
    svc.assignTrack('a', b.id);
    svc.assignTrack('b', b.id);
    svc.assignTrack('c', null);
    expect(svc.trackIdsForBus(b.id).sort()).toEqual(['a', 'b']);
  });

  it('persists + reload round-trip via second instance', () => {
    const b = svc.createBus('RT');
    svc.assignTrack('t1', b.id);
    svc.setBusFader(b.id, 0.7);
    const reloaded = new VcaBusService();
    expect(reloaded.buses()).toHaveLength(1);
    expect(reloaded.buses()[0].faderValue).toBeCloseTo(0.7);
    expect(reloaded.assignments()['t1']).toBe(b.id);
  });

  it('load() ignores corrupt JSON', () => {
    localStorage.setItem(STORAGE_KEY, '{ not json');
    const fresh = new VcaBusService();
    expect(fresh.buses()).toEqual([]);
  });

  it('assignedCountByBus reflects current assignments', () => {
    const a = svc.createBus('A');
    const b = svc.createBus('B');
    svc.assignTrack('t1', a.id);
    svc.assignTrack('t2', a.id);
    svc.assignTrack('t3', b.id);
    const map = svc.assignedCountByBus();
    expect(map[a.id]).toBe(2);
    expect(map[b.id]).toBe(1);
  });

  it('unassignTrack sets assignments[trackId] = null', () => {
    const b = svc.createBus('U');
    svc.assignTrack('t', b.id);
    svc.unassignTrack('t');
    expect(svc.assignments()['t']).toBeNull();
  });
});
