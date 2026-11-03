import { TestBed } from "@angular/core/testing";
import { signal } from "@angular/core";
import { AudioEngineService } from "../services/audio-engine.service";
import { MeterMapService } from "./meter-map.service";

describe("MeterMapService", () => {
  let service: MeterMapService;
  let engine: {
    timeSignature: ReturnType<typeof signal<{ beats: number; unit: number }>>;
    setMeterMap: jest.Mock;
  };

  beforeEach(() => {
    localStorage.clear();
    engine = {
      timeSignature: signal({ beats: 4, unit: 4 }),
      setMeterMap: jest.fn(),
    };
    TestBed.configureTestingModule({
      providers: [{ provide: AudioEngineService, useValue: engine }],
    });
    service = TestBed.inject(MeterMapService);
  });

  afterEach(() => localStorage.clear());

  it("starts empty and leaves the global meter in force", () => {
    expect(service.markerCount()).toBe(0);
    expect(engine.setMeterMap).toHaveBeenCalledWith([]);
  });

  it("adds a base marker before the first change so every step has a meter", () => {
    const marker = service.addMarker(16, 3, 4)!;

    expect(marker.beats).toBe(3);
    expect(service.markers().map((entry) => entry.step)).toEqual([0, 16]);
    expect(service.markers()[0]).toMatchObject({ beats: 4, unit: 4 });
    expect(service.meterAtStep(8)?.beats).toBe(4);
    expect(service.meterAtStep(16)?.beats).toBe(3);
    expect(engine.setMeterMap).toHaveBeenLastCalledWith([
      { step: 0, beats: 4, unit: 4 },
      { step: 16, beats: 3, unit: 4 },
    ]);
  });

  it("updates and retimes a marker while keeping the list sorted", () => {
    service.addMarker(0, 4, 4);
    const marker = service.addMarker(32, 6, 8)!;

    service.updateMarker(marker.id, { step: 16, beats: 5, unit: 4 });

    expect(service.markers().map((entry) => entry.step)).toEqual([0, 16]);
    expect(service.markers()[1]).toMatchObject({ beats: 5, unit: 4 });
    expect(engine.setMeterMap).toHaveBeenLastCalledWith([
      { step: 0, beats: 4, unit: 4 },
      { step: 16, beats: 5, unit: 4 },
    ]);
  });

  it("rejects invalid meters and duplicate-step moves", () => {
    expect(service.addMarker(0, 0, 4)).toBeNull();
    expect(service.addMarker(0, 4, 5)).toBeNull();
    expect(service.markerCount()).toBe(0);

    service.addMarker(0, 4, 4);
    const marker = service.addMarker(16, 3, 4)!;
    service.updateMarker(marker.id, { step: 0 });
    expect(service.markers().map((entry) => entry.step)).toEqual([0, 16]);
  });

  it("replaces a saved map, adding a base marker when needed", () => {
    service.replaceAll([
      { id: "b", step: 32, beats: 6, unit: 8 },
      { id: "a", step: 16, beats: 3, unit: 4 },
      { id: "bad", step: 48, beats: 4, unit: 5 },
    ]);

    expect(service.markers().map((entry) => entry.step)).toEqual([0, 16, 32]);
    expect(service.markers().map((entry) => entry.beats)).toEqual([4, 3, 6]);
  });

  it("removes and clears markers", () => {
    const first = service.addMarker(0, 3, 4)!;
    service.addMarker(16, 5, 4);
    service.removeMarker(first.id);
    expect(service.markerCount()).toBe(1);

    service.clear();
    expect(service.markerCount()).toBe(0);
    expect(engine.setMeterMap).toHaveBeenLastCalledWith([]);
  });

  it("restores the persisted map", () => {
    service.addMarker(0, 3, 4);
    service.addMarker(16, 7, 8);
    const stored = localStorage.getItem("smuve_meter_map_v1");
    expect(stored).toBeTruthy();

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [{ provide: AudioEngineService, useValue: engine }],
    });
    const restored = TestBed.inject(MeterMapService);

    expect(restored.markers().map((entry) => entry.step)).toEqual([0, 16]);
    expect(restored.markers().map((entry) => entry.beats)).toEqual([3, 7]);
  });
});
