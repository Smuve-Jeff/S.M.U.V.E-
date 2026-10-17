import { TestBed } from '@angular/core/testing';
import { FxMacrosService } from './fx-macros.service';
import { AudioEngineService } from './audio-engine.service';
import { NotificationService } from './notification.service';

/**
 * Reset-parity contract test.
 *
 * The mock engine only RECORDS routed calls (setMasterFilterHz,
 * setMasterLimiterThreshold, setMasterCompressorRatio, setMasterReverbWet).
 * It is NOT an authority on defaults. Every reset assertion compares the
 * routed values against AudioEngineService.MASTER_DEFAULTS — the single
 * canonical source of truth — so the test itself cannot drift from the
 * engine's real resting state.
 */
describe('FxMacrosService (reset parity)', () => {
  let service: FxMacrosService;
  let calls: {
    filter: number[];
    limiter: number[];
    comp: number[];
    reverb: number[];
  };

  const defaults = AudioEngineService.MASTER_DEFAULTS;

  beforeEach(() => {
    calls = { filter: [], limiter: [], comp: [], reverb: [] };

    const audioMock = {
      setMasterFilterHz: jest.fn((v: number) => calls.filter.push(v)),
      setMasterLimiterThreshold: jest.fn((v: number) => calls.limiter.push(v)),
      setMasterCompressorRatio: jest.fn((v: number) => calls.comp.push(v)),
      setMasterReverbWet: jest.fn((v: number) => calls.reverb.push(v)),
    };

    TestBed.configureTestingModule({
      providers: [
        { provide: AudioEngineService, useValue: audioMock },
        {
          provide: NotificationService,
          useValue: { show: jest.fn() },
        },
      ],
    });
    service = TestBed.inject(FxMacrosService);
  });

  it('boot: HUD XY rests at the position that maps to the engine rest values', () => {
    // filter-sweep: X = cutoff (exp 200→20000, rest 20000 ⇒ x=1),
    // Y = limiter (linear -20→-0.5, rest -0.5 ⇒ y=1)
    expect(service.activeMacroId()).toBe('filter-sweep');
    expect(service.xyPos()).toEqual({ x: 1, y: 1 });
    expect(service.currentValues().xLabel).toBe('20.0k Hz');
    expect(service.currentValues().yLabel).toBe('-0.5 dB');
  });

  it('drag then release returns every touched param to MASTER_DEFAULTS', () => {
    service.setXY(0, 0); // extreme modulation
    expect(calls.filter[calls.filter.length - 1]).toBe(200); // far from rest
    expect(calls.limiter[calls.limiter.length - 1]).toBe(-20);

    service.release(); // must restore rest values

    expect(calls.filter[calls.filter.length - 1]).toBe(defaults.masterFilterHz);
    expect(calls.limiter[calls.limiter.length - 1]).toBe(
      defaults.limiterThresholdDb
    );
    expect(service.engaged()).toBe(false);
  });

  it('release snaps the HUD dot to the derived rest position (UI/audio parity)', () => {
    service.setXY(0.3, 0.2);
    service.release();
    expect(service.xyPos()).toEqual(service.restXY());
    // And the rest position actually maps back to the rest values:
    const m = service.activeMacro();
    const xVal = scaleLikeService(service.xyPos().x, m.xTarget);
    const yVal = scaleLikeService(service.xyPos().y, m.yTarget);
    expect(xVal).toBeCloseTo(defaults.masterFilterHz, 5);
    expect(yVal).toBeCloseTo(defaults.limiterThresholdDb, 5);
  });

  it('reset() restores params for macros that do not touch filter/limiter', () => {
    service.setMacro('delay-trail'); // X = comp, Y = reverb
    TestBed.inject(NotificationService).show; // no-op touch
    service.setXY(1, 1);
    const compAfterDrag = calls.comp[calls.comp.length - 1];
    expect(compAfterDrag).toBe(12); // modulated
    expect(calls.reverb[calls.reverb.length - 1]).toBeCloseTo(1, 5);

    calls.comp = [];
    calls.reverb = [];
    service.reset();

    expect(calls.comp).toEqual([defaults.compressorRatio]);
    expect(calls.reverb).toEqual([0]); // reverb rest = silence, by design
  });

  it('switching macros (setMacro) restores old targets and parks dot at new rest', () => {
    service.setXY(0, 0); // modulate filter + limiter on filter-sweep
    calls.filter = [];
    calls.limiter = [];

    service.setMacro('tape-stop'); // old targets restored, new rest applied

    // Old macro's targets were returned to rest before the switch:
    expect(calls.filter[calls.filter.length - 1]).toBe(
      defaults.masterFilterHz
    );
    expect(calls.limiter[calls.limiter.length - 1]).toBe(
      defaults.limiterThresholdDb
    );
    // New macro's rest position: X = reverb rest 0 ⇒ 0, Y = filter rest 20000 ⇒ 1
    expect(service.xyPos()).toEqual({ x: 0, y: 1 });
    expect(service.activeMacroId()).toBe('tape-stop');
  });

  it('inverse mapping round-trips: restXY reproduces rest values on every preset', () => {
    for (const preset of service.presets) {
      service.setMacro(preset.id);
      const xy = service.restXY();
      const xV = scaleLikeService(xy.x, preset.xTarget);
      const yV = scaleLikeService(xy.y, preset.yTarget);
      expect(xV).toBeCloseTo(preset.xTarget.rest, 5);
      expect(yV).toBeCloseTo(preset.yTarget.rest, 5);
    }
  });

  it('engage/release lifecycle stays consistent', () => {
    service.engage();
    expect(service.engaged()).toBe(true);
    service.release();
    expect(service.engaged()).toBe(false);
  });
});

/** Local re-implementation of the service curve so the test proves the mapping
 * rather than copying the private helper (kept in sync by the round-trit test). */
function scaleLikeService(
  v: number,
  spec: { min: number; max: number; curve: 'linear' | 'exp' }
): number {
  const c = Math.max(0, Math.min(1, v));
  if (spec.curve === 'exp' && spec.min > 0 && spec.max > 0) {
    return spec.min * Math.pow(spec.max / spec.min, c);
  }
  return spec.min + (spec.max - spec.min) * c;
}
