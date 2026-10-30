import { TestBed } from "@angular/core/testing";
import { ArrangementMarkersService } from "./arrangement-markers.service";

const STORAGE_KEY = "smuve_arrangement_markers_v1";

describe("ArrangementMarkersService", () => {
  let service: ArrangementMarkersService;

  beforeEach(() => {
    localStorage.removeItem(STORAGE_KEY);
    TestBed.configureTestingModule({ providers: [ArrangementMarkersService] });
    service = TestBed.inject(ArrangementMarkersService);
  });

  afterEach(() => localStorage.removeItem(STORAGE_KEY));

  it("adds markers in time order and persists them", () => {
    service.add("Chorus", 16);
    service.add("Intro", 4);

    expect(service.markers().map((marker) => marker.name)).toEqual([
      "Intro",
      "Chorus",
    ]);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]")).toHaveLength(
      2,
    );
  });

  it("replaces a saved project's markers and drops malformed entries", () => {
    service.add("Old", 1);

    service.replaceAll([
      { id: "b", name: "Drop", time: 8, color: "#ff0000" },
      { id: "a", name: "Intro", time: 0, color: "" },
      { id: "bad", name: "", time: 4, color: "#fff" },
    ]);

    expect(service.markers().map((marker) => marker.name)).toEqual([
      "Intro",
      "Drop",
    ]);
    expect(service.markers()[0].color).toBe("#facc15");
    expect(service.markers()[1].time).toBe(8);
  });
});
