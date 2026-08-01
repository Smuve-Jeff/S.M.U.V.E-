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

  // ── Sprint A3 Phase 4 — note snapshots, active-take playback, comp stack ──

  it('stampTake snapshots notes so the active take can drive playback', () => {
    const notes = [
      { id: 'a', midi: 60, step: 0, length: 2, velocity: 100 },
      { id: 'b', midi: 64, step: 4, length: 1, velocity: 90 },
    ];
    const t = svc.stampTake('trk1', 'Take 1', notes, 0);
    expect(t.notes?.length).toBe(2);
    expect(svc.getActiveTakeNotes('trk1')()[0].midi).toBe(60);
  });

  it('getActiveTakeNotes returns [] when no active take or empty snapshot', () => {
    expect(svc.getActiveTakeNotes('nope')()).toEqual([]);
    const t = svc.stampTake('trk1', 'Empty', [], 0);
    expect(svc.getActiveTakeNotes('trk1')()).toEqual([]);
    expect(t.noteCount).toBeUndefined();
  });

  it('getActiveTakeNotesNow is a hot-path read of the same active snapshot', () => {
    svc.stampTake(
      'trk1',
      'Take 1',
      [{ id: 'a', midi: 67, step: 0, length: 2, velocity: 100 }],
      0
    );
    expect(svc.getActiveTakeNotesNow('trk1')[0].midi).toBe(67);
    expect(svc.getActiveTakeNotesNow('nope')).toEqual([]);
  });

  it('toggleCompTake builds an ordered comp stack and removes on second tap', () => {
    const a = svc.addTake('trk1', 'Take A');
    const b = svc.addTake('trk1', 'Take B');
    svc.toggleCompTake('trk1', a.id);
    svc.toggleCompTake('trk1', b.id);
    expect(svc.compStack('trk1')()).toEqual([a.id, b.id]);
    svc.toggleCompTake('trk1', a.id);
    expect(svc.compStack('trk1')()).toEqual([b.id]);
  });

  it('applyComp merges stacked takes with later takes winning overlaps', () => {
    const a = svc.stampTake(
      'trk1',
      'Take A',
      [{ id: 'n1', midi: 60, step: 0, length: 2, velocity: 100 }],
      0
    );
    const b = svc.stampTake(
      'trk1',
      'Take B',
      [
        { id: 'n1', midi: 60, step: 0, length: 2, velocity: 111 }, // overlaps n1
        { id: 'n2', midi: 65, step: 4, length: 1, velocity: 95 },
      ],
      0
    );
    svc.toggleCompTake('trk1', a.id);
    svc.toggleCompTake('trk1', b.id);
    const merged = svc.applyComp('trk1');
    expect(merged.length).toBe(2);
    const n1 = merged.find((n) => n.step === 0);
    expect(n1?.velocity).toBe(111); // later take B wins
    expect(merged.some((n) => n.midi === 65)).toBe(true);
  });

  it('clearCompStack empties the stack without deleting takes', () => {
    const a = svc.addTake('trk1', 'Take A');
    svc.toggleCompTake('trk1', a.id);
    expect(svc.compStack('trk1')().length).toBe(1);
    svc.clearCompStack('trk1');
    expect(svc.compStack('trk1')()).toEqual([]);
    expect(svc.getTakes('trk1')().length).toBe(1);
  });

  it('removeTake also drops the take from any comp stack', () => {
    const a = svc.addTake('trk1', 'Take A');
    const b = svc.addTake('trk1', 'Take B');
    svc.toggleCompTake('trk1', a.id);
    svc.toggleCompTake('trk1', b.id);
    svc.removeTake('trk1', a.id);
    expect(svc.compStack('trk1')()).toEqual([b.id]);
  });

  it('clearTakesForTrack also clears the comp stack', () => {
    const a = svc.addTake('trk1', 'Take A');
    svc.toggleCompTake('trk1', a.id);
    svc.clearTakesForTrack('trk1');
    expect(svc.compStack('trk1')()).toEqual([]);
    expect(svc.getTakes('trk1')()).toEqual([]);
  });
});
