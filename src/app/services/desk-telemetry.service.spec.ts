import { TestBed } from '@angular/core/testing';
import { DeskTelemetryService } from './desk-telemetry.service';

describe('DeskTelemetryService', () => {
  let service: DeskTelemetryService;

  beforeEach(() => {
    sessionStorage.clear();
    TestBed.configureTestingModule({});
    service = TestBed.inject(DeskTelemetryService);
    service.reset();
  });

  it('counts opens, answers and fallbacks per desk without storing content', () => {
    service.record('ar', 'opened');
    service.record('ar', 'answered');
    service.record('ar', 'answered');
    service.record('engineer', 'fallback');

    const snapshot = service.snapshot();
    expect(snapshot.ar).toEqual({ opened: 1, answered: 2, fallback: 0 });
    expect(snapshot.engineer).toEqual({ opened: 0, answered: 0, fallback: 1 });

    const stored = sessionStorage.getItem('smuve.desk.telemetry.v1') ?? '';
    expect(stored).not.toMatch(/question|reply|artist/i);
  });

  it('survives a new service instance through session storage', () => {
    service.record('ceo', 'opened');

    const next = new DeskTelemetryService();
    expect(next.snapshot().ceo?.opened).toBe(1);
  });

  it('keeps corrupt counters instead of overwriting them with this session', () => {
    sessionStorage.setItem('smuve.desk.telemetry.v1', '{not json');
    const fresh = new DeskTelemetryService();
    const setItem = jest.spyOn(Storage.prototype, 'setItem');

    try {
      // The session still counts its own opens...
      fresh.record('ar', 'opened');
      expect(fresh.snapshot().ar?.opened).toBe(1);
      // ...but the unreadable counters are not replaced by that view.
      expect(setItem).not.toHaveBeenCalledWith(
        'smuve.desk.telemetry.v1',
        expect.any(String),
      );
    } finally {
      setItem.mockRestore();
    }

    expect(sessionStorage.getItem('smuve.desk.telemetry.v1')).toBe('{not json');
  });
});
