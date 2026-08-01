import { TestBed } from '@angular/core/testing';
import { TakeManagerService } from './take-manager.service';

describe('TakeManagerService (Sprint A3 starter)', () => {
  let svc: TakeManagerService;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [TakeManagerService] });
    svc = TestBed.inject(TakeManagerService);
  });

  it('addTake appends to the track bucket and returns the take', () => {
    const t = svc.addTake('trk1', 'Audition 1');
    expect(svc.getTakes('trk1')().length).toBe(1);
    expect(t.label).toBe('Audition 1');
    expect(t.trackId).toBe('trk1');
    expect(t.id).toMatch(/^tk_/);
  });

  it('setActiveTake makes that take the active selection', () => {
    const a = svc.addTake('trk1', 'Take A');
    const b = svc.addTake('trk1', 'Take B');
    svc.setActiveTake('trk1', b.id);
    expect(svc.getActiveTake('trk1')()?.id).toBe(b.id);
    expect(svc.getActiveTake('trk1')()?.id).not.toBe(a.id);
  });

  it('setPunchIn toggles per-track record-on-entry flag', () => {
    svc.setPunchIn('trk1', true);
    expect(svc.isPunchIn('trk1')()).toBe(true);
    svc.setPunchIn('trk1', false);
    expect(svc.isPunchIn('trk1')()).toBe(false);
  });

  it('isolated reads on unknown tracks return safe defaults, never throw', () => {
    expect(svc.getTakes('nope')()).toEqual([]);
    expect(svc.getActiveTake('nope')()).toBeUndefined();
    expect(svc.isPunchIn('nope')()).toBe(false);
  });

  it('clearTakesForTrack wipes takes + active + punch-in state', () => {
    const t = svc.addTake('trk1', 'X');
    svc.setActiveTake('trk1', t.id);
    svc.setPunchIn('trk1', true);
    svc.clearTakesForTrack('trk1');
    expect(svc.getTakes('trk1')()).toEqual([]);
    expect(svc.getActiveTake('trk1')()).toBeUndefined();
    expect(svc.isPunchIn('trk1')()).toBe(false);
  });

  // ── Sprint A3 Phase 2 — region metadata + per-take removal ──

  it('addTake stores the region snapshot passed as metadata', () => {
    const t = svc.addTake('trk1', 'Take 1', {
      noteCount: 8,
      startStep: 0,
      endStep: 16,
    });
    expect(t.noteCount).toBe(8);
    expect(t.startStep).toBe(0);
    expect(t.endStep).toBe(16);
    // Meta is optional — plain calls stay fully backward compatible
    const plain = svc.addTake('trk1', 'Take 2');
    expect(plain.noteCount).toBeUndefined();
    expect(plain.startStep).toBeUndefined();
  });

  it('removeTake deletes only the named take, leaving siblings intact', () => {
    const a = svc.addTake('trk1', 'Take A');
    const b = svc.addTake('trk1', 'Take B');
    svc.removeTake('trk1', a.id);
    const remaining = svc.getTakes('trk1')();
    expect(remaining.length).toBe(1);
    expect(remaining[0].id).toBe(b.id);
  });

  it('removeTake clears the active selection when the active take is removed', () => {
    const a = svc.addTake('trk1', 'Take A');
    svc.setActiveTake('trk1', a.id);
    expect(svc.getActiveTake('trk1')()?.id).toBe(a.id);
    svc.removeTake('trk1', a.id);
    expect(svc.getActiveTake('trk1')()).toBeUndefined();
  });

  it('removeTake on an unknown take id is a safe no-op', () => {
    const a = svc.addTake('trk1', 'Take A');
    svc.removeTake('trk1', 'tk_missing');
    svc.removeTake('nope', 'tk_missing');
    expect(svc.getTakes('trk1')().length).toBe(1);
    expect(svc.getTakes('trk1')()[0].id).toBe(a.id);
  });

  // ── Sprint A3 Phase 3 — stampTake region snapshot ──

  it('stampTake computes the min/max region from note steps and sets active', () => {
    const notes = [
      { step: 0, length: 2 },
      { step: 4, length: 1 },
      { step: 2, length: 3 },
    ];
    const t = svc.stampTake('trk1', 'Take 1', notes, 0);
    expect(t.noteCount).toBe(3);
    expect(t.startStep).toBe(0);
    expect(t.endStep).toBe(5); // max(step+length) = 4+1
    expect(svc.getActiveTake('trk1')()?.id).toBe(t.id);
  });

  it('stampTake falls back to the playhead region for empty note lists', () => {
    const t = svc.stampTake('trk1', 'Take 1', [], 16);
    expect(t.noteCount).toBeUndefined();
    expect(t.startStep).toBe(16);
    expect(t.endStep).toBe(17);
    expect(svc.getActiveTake('trk1')()?.id).toBe(t.id);
  });

  it('stampTake honors note length in the exclusive end bound', () => {
    const t = svc.stampTake('trk1', 'Take 1', [{ step: 3, length: 4 }], 0);
    expect(t.startStep).toBe(3);
    expect(t.endStep).toBe(7);
  });
});
