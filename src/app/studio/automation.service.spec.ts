import { TestBed } from '@angular/core/testing';
import { AutomationService } from './automation.service';
import { AudioEngineService } from '../services/audio-engine.service';

describe('AutomationService', () => {
  let service: AutomationService;
  const engineMock = {
    applyProductionParameter: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    TestBed.configureTestingModule({
      providers: [
        AutomationService,
        { provide: AudioEngineService, useValue: engineMock },
      ],
    });
    service = TestBed.inject(AutomationService);
  });

  it('interpolates with smooth mode and applies to engine', () => {
    const lane = service.addLane('1', 'gain', { interpolation: 'smooth' });
    service.addPoint(lane.id, 0, 0.2);
    service.addPoint(lane.id, 1, 0.8);

    service.applyAutomation(0.5, 0.1);

    expect(engineMock.applyProductionParameter).toHaveBeenCalled();
    const [, , value] = engineMock.applyProductionParameter.mock.calls[0];
    expect(value).toBeGreaterThan(0.2);
    expect(value).toBeLessThan(0.8);
  });

  it('supports macro + modulation mapped to lane', () => {
    const lane = service.addLane('2', 'pan', {
      min: -1,
      max: 1,
      modulationDepth: 0.3,
    });
    service.addPoint(lane.id, 0, 0);
    service.addPoint(lane.id, 1, 0.5);

    const lfo = service.createModulationSource('lfo', { amount: 0.2, rateHz: 2 });
    service.mapModulationToLane(lfo.id, lane.id);

    const macro = service.createMacro('Build');
    service.mapMacroToLane(macro.id, lane.id, 0.5);
    service.setLaneEnabled(lane.id, true);
    service.setLaneInterpolation(lane.id, 'linear');
    service.lanes.update((lanes) =>
      lanes.map((l) => (l.id === lane.id ? { ...l, macroId: macro.id } : l))
    );
    service.setMacroValue(macro.id, 1);

    service.applyAutomation(0.25, 0.05);
    const call = engineMock.applyProductionParameter.mock.calls[0];
    expect(call[0]).toBe('2');
    expect(call[1]).toBe('pan');
    expect(call[2]).toBeLessThanOrEqual(1);
    expect(call[2]).toBeGreaterThanOrEqual(-1);
  });

  it('supports snapshot hydration', () => {
    const lane = service.addLane('3', 'tempo');
    service.addPoint(lane.id, 0, 120);
    const snapshot = service.getSnapshot();

    service.removeLane(lane.id);
    expect(service.lanes().length).toBe(0);

    service.hydrateSnapshot(snapshot);
    expect(service.lanes().length).toBe(1);
    expect(service.lanes()[0].target.parameter).toBe('tempo');
  });
});
