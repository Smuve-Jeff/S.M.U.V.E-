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
});
