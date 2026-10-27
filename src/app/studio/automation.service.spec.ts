import { signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { AutomationService } from "./automation.service";
import { AudioEngineService } from "../services/audio-engine.service";

describe("AutomationService", () => {
  let service: AutomationService;
  const isPlaying = signal(false);
  const visualStep = signal(0);
  const tempo = signal(120);
  const engineMock = {
    applyProductionParameter: jest.fn(),
    isPlaying,
    visualStep,
    tempo,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    isPlaying.set(false);
    visualStep.set(0);
    tempo.set(120);
    TestBed.configureTestingModule({
      providers: [
        AutomationService,
        { provide: AudioEngineService, useValue: engineMock },
      ],
    });
    service = TestBed.inject(AutomationService);
  });

  it("interpolates with smooth mode and applies to engine", () => {
    const lane = service.addLane("1", "gain", { interpolation: "smooth" });
    service.addPoint(lane.id, 0, 0.2);
    service.addPoint(lane.id, 1, 0.8);

    service.applyAutomation(0.5, 0.1);

    expect(engineMock.applyProductionParameter).toHaveBeenCalled();
    const [, , value] = engineMock.applyProductionParameter.mock.calls[0];
    expect(value).toBeGreaterThan(0.2);
    expect(value).toBeLessThan(0.8);
  });

  it("supports macro + modulation mapped to lane", () => {
    const lane = service.addLane("2", "pan", {
      min: -1,
      max: 1,
      modulationDepth: 0.3,
    });
    service.addPoint(lane.id, 0, 0);
    service.addPoint(lane.id, 1, 0.5);

    const lfo = service.createModulationSource("lfo", {
      amount: 0.2,
      rateHz: 2,
    });
    service.mapModulationToLane(lfo.id, lane.id);

    const macro = service.createMacro("Build");
    service.mapMacroToLane(macro.id, lane.id, 0.5);
    service.setLaneEnabled(lane.id, true);
    service.setLaneInterpolation(lane.id, "linear");
    service.lanes.update((lanes) =>
      lanes.map((l) => (l.id === lane.id ? { ...l, macroId: macro.id } : l)),
    );
    service.setMacroValue(macro.id, 1);

    service.applyAutomation(0.25, 0.05);
    const call = engineMock.applyProductionParameter.mock.calls[0];
    expect(call[0]).toBe("2");
    expect(call[1]).toBe("pan");
    expect(call[2]).toBeLessThanOrEqual(1);
    expect(call[2]).toBeGreaterThanOrEqual(-1);
  });

  it("reads the curves as the transport advances", () => {
    const lane = service.addLane("1", "gain");
    service.addPoint(lane.id, 0, 0.2);
    service.addPoint(lane.id, 1, 0.8);

    // Stopped: no writes to the engine.
    TestBed.tick();
    expect(engineMock.applyProductionParameter).not.toHaveBeenCalled();

    isPlaying.set(true);
    // 120 BPM, 4 steps per beat → step 4 is half a second in.
    visualStep.set(4);
    TestBed.tick();
    expect(engineMock.applyProductionParameter).toHaveBeenCalledTimes(1);
    const [trackId, parameter, value] = engineMock.applyProductionParameter.mock
      .calls[0];
    expect(trackId).toBe("1");
    expect(parameter).toBe("gain");
    expect(value).toBeCloseTo(0.5, 2);

    // Advancing repeats on the same step must not re-fire the whole curve.
    TestBed.tick();
    expect(engineMock.applyProductionParameter).toHaveBeenCalledTimes(1);
  });

  it("maps transport steps to seconds at the current tempo", () => {
    tempo.set(120);
    expect(service.timeAtStep(16)).toBeCloseTo(2, 5);
    tempo.set(60);
    expect(service.timeAtStep(16)).toBeCloseTo(4, 5);
  });

  it("only records automation while write is armed and playing", () => {
    isPlaying.set(true);
    visualStep.set(4);

    expect(service.captureWrite("t1", "gain", 0.5)).toBe(false);
    expect(service.lanes()).toHaveLength(0);

    service.setWriteEnabled(true);
    expect(service.captureWrite("t1", "gain", 0.5)).toBe(true);

    const lane = service.lanes()[0];
    expect(lane.target).toMatchObject({ trackId: "t1", parameter: "gain" });
    expect(lane.points).toHaveLength(1);
    expect(lane.points[0].time).toBeCloseTo(service.timeAtStep(4), 5);
    expect(lane.points[0].value).toBe(0.5);
  });

  it("collapses a drag inside one step and clamps to the lane range", () => {
    isPlaying.set(true);
    visualStep.set(8);
    service.setWriteEnabled(true);

    service.captureWrite("t1", "gain", 0.4);
    service.captureWrite("t1", "gain", 0.9);
    const lane = service.lanes()[0];
    // Same step → one keyframe, holding the latest value.
    expect(lane.points).toHaveLength(1);
    expect(lane.points[0].value).toBe(0.9);

    visualStep.set(9);
    service.captureWrite("t1", "gain", 5);
    expect(service.lanes()[0].points).toHaveLength(2);
    expect(service.lanes()[0].points[1].value).toBe(5);
  });

  it("does not record while the transport is stopped", () => {
    service.setWriteEnabled(true);
    expect(service.captureWrite("t1", "gain", 0.7)).toBe(false);
    expect(service.lanes()).toHaveLength(0);
  });

  it("supports snapshot hydration", () => {
    const lane = service.addLane("3", "tempo");
    service.addPoint(lane.id, 0, 120);
    const snapshot = service.getSnapshot();

    service.removeLane(lane.id);
    expect(service.lanes().length).toBe(0);

    service.hydrateSnapshot(snapshot);
    expect(service.lanes().length).toBe(1);
    expect(service.lanes()[0].target.parameter).toBe("tempo");
  });
});
