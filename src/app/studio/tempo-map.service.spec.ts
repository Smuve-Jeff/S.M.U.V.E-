import { TestBed } from "@angular/core/testing";
import { signal } from "@angular/core";
import { AudioEngineService } from "../services/audio-engine.service";
import { STEPS_PER_BAR, TempoMapService } from "./tempo-map.service";

describe("TempoMapService", () => {
  let service: TempoMapService;
  let engine: {
    tempo: ReturnType<typeof signal<number>>;
    setTempoMap: jest.Mock;
  };

  beforeEach(() => {
    localStorage.clear();
    engine = {
      tempo: signal(120),
      setTempoMap: jest.fn(),
    };
    TestBed.configureTestingModule({
      providers: [{ provide: AudioEngineService, useValue: engine }],
    });
    service = TestBed.inject(TempoMapService);
  });

  afterEach(() => localStorage.clear());

  it("starts empty and keeps the global tempo in force", () => {
    expect(service.markerCount()).toBe(0);
    expect(service.hasMap()).toBe(false);
    expect(service.bpmAtStep(0)).toBe(120);
    expect(service.bpmAtStep(999)).toBe(120);
  });

  it("applies the last marker at or before a step", () => {
    service.addMarker(0, 120);
    service.addMarker(16, 90);
    service.addMarker(32, 150);

    expect(service.bpmAtStep(0)).toBe(120);
    expect(service.bpmAtStep(15)).toBe(120);
    expect(service.bpmAtStep(16)).toBe(90);
    expect(service.bpmAtStep(31)).toBe(90);
    expect(service.bpmAtStep(40)).toBe(150);
  });

  it("keeps markers sorted and reports 1-based bars", () => {
    service.addMarker(32, 140);
    service.addMarker(0, 100);
    const middle = service.addMarker(STEPS_PER_BAR, 128)!;

    expect(service.markers().map((marker) => marker.step)).toEqual([0, 16, 32]);
    expect(service.barOf(middle)).toBe(2);
  });

  it("retunes an existing marker instead of stacking a duplicate step", () => {
    service.addMarker(16, 90);
    service.addMarker(16, 96);

    expect(service.markerCount()).toBe(1);
    expect(service.markers()[0].bpm).toBe(96);
  });

  it("clamps the tempo range and rejects nonsense", () => {
    expect(service.addMarker(0, 5)).toBeNull();
    expect(service.addMarker(0, 400)).toBeNull();
    expect(service.addMarker(0, Number.NaN)).toBeNull();
    expect(service.markerCount()).toBe(0);

    service.addMarker(0, 120);
    service.updateMarker(service.markers()[0].id, { bpm: 900 });
    expect(service.markers()[0].bpm).toBe(120);
  });

  it("removes and clears markers", () => {
    const first = service.addMarker(0, 100)!;
    service.addMarker(16, 110);

    service.removeMarker(first.id);
    expect(service.markerCount()).toBe(1);

    service.clear();
    expect(service.markerCount()).toBe(0);
    expect(service.bpmAtStep(32)).toBe(120);
  });

  it("replaces a saved map wholesale, dropping invalid markers", () => {
    service.addMarker(0, 120);
    engine.setTempoMap.mockClear();

    service.replaceAll([
      { id: "b", step: 32, bpm: 90 },
      { id: "a", step: 0, bpm: 100 },
      { id: "bad", step: 16, bpm: 5 },
    ]);

    expect(service.markers().map((marker) => marker.step)).toEqual([0, 32]);
    expect(service.markers().map((marker) => marker.bpm)).toEqual([100, 90]);
    expect(engine.setTempoMap).toHaveBeenCalledWith([
      { step: 0, bpm: 100 },
      { step: 32, bpm: 90 },
    ]);
  });

  it("pushes the map to the engine and persists it", () => {
    service.addMarker(0, 100);
    service.addMarker(16, 140);

    expect(engine.setTempoMap).toHaveBeenCalledWith([
      { step: 0, bpm: 100 },
      { step: 16, bpm: 140 },
    ]);

    const stored = JSON.parse(localStorage.getItem("smuve_tempo_map_v1") ?? "[]");
    expect(stored).toHaveLength(2);
  });
});
