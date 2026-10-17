import { TestBed } from "@angular/core/testing";
import { QuantizationService } from "./quantization.service";
import { LoggingService } from "../services/logging.service";

describe("QuantizationService", () => {
  let service: QuantizationService;

  const notes = [
    { id: "n1", midi: 60, step: 1.37, length: 1, velocity: 0.8 },
    { id: "n2", midi: 64, step: 1.88, length: 1, velocity: 0.8 },
  ];

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        QuantizationService,
        {
          provide: LoggingService,
          useValue: { info: jest.fn(), warn: jest.fn() },
        },
      ],
    });
    service = TestBed.inject(QuantizationService);
  });

  it("quantizes straight notes to the selected grid", () => {
    const result = service.quantizeNotes(notes as any, "straight_1_16");
    expect(result.quantized[0].step).toBeCloseTo(1.375, 5);
    expect(result.quantized[1].step).toBeCloseTo(1.875, 5);
    expect(result.changedCount).toBeGreaterThan(0);
  });

  it("sizes triplet presets at 2/3 of the straight note, not 4/3", () => {
    // A triplet puts three notes where two straight ones go, so its grid must be
    // 2/3 of the straight value. These were 4/3 — twice as wide as the label —
    // so "Triplet 1/16" silently quantized as an eighth-note triplet.
    expect(service.getPreset("triplet_1_16")!.grid).toBeCloseTo(
      0.0625 * (2 / 3),
      6,
    );
    expect(service.getPreset("triplet_1_8")!.grid).toBeCloseTo(
      0.125 * (2 / 3),
      6,
    );
    expect(service.getPreset("triplet_1_4")!.grid).toBeCloseTo(
      0.25 * (2 / 3),
      6,
    );
  });

  it("divides a 16-step bar into musically correct triplet counts", () => {
    expect(service.getGridDivisionsPerBar("triplet_1_16")).toBe(24);
    expect(service.getGridDivisionsPerBar("triplet_1_8")).toBe(12);
    expect(service.getGridDivisionsPerBar("triplet_1_4")).toBe(6);
  });

  it("snaps a note onto the eighth-note triplet grid", () => {
    const result = service.quantizeNotes(
      [{ ...notes[0], step: 0.09 }] as any,
      "triplet_1_8",
    );
    // 0.09 of a bar is nearest to the 1/12-bar triplet position.
    expect(result.quantized[0].step).toBeCloseTo(0.125 * (2 / 3), 6);
  });

  it("applies swing to odd grid positions", () => {
    const result = service.quantizeNotes(
      [{ ...notes[0], step: 0.18 }] as any,
      "swing_1_16_75",
    );
    expect(result.quantized[0].step).toBeGreaterThan(0.1);
  });

  it("supports deterministic humanization with seed", () => {
    const first = service.quantizeNotes(
      [{ ...notes[0] }] as any,
      "human_medium",
      { seed: 42 },
    );
    const second = service.quantizeNotes(
      [{ ...notes[0] }] as any,
      "human_medium",
      { seed: 42 },
    );
    expect(first.quantized[0].step).toBeCloseTo(second.quantized[0].step, 8);
  });

  it("applies groove offsets when provided", () => {
    const result = service.quantizeNotes(
      [{ ...notes[0], step: 0.25 }] as any,
      "straight_1_16",
      { grooveOffsets: [0.5] },
    );
    expect(result.quantized[0].step).toBeCloseTo(0.28125, 5);
  });

  it("supports retroactive quantize options", () => {
    const result = service.retroactiveQuantize(
      [{ ...notes[0] }] as any,
      "human_tight",
      { seed: 7 },
    );
    expect(result.quantized).toHaveLength(1);
  });

  it("returns unchanged notes for unknown preset", () => {
    const result = service.quantizeNotes(notes as any, "missing");
    expect(result.changedCount).toBe(0);
    expect(result.quantized[0].step).toBe(notes[0].step);
  });
});
