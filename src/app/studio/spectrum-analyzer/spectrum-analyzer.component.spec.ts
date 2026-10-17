import { TestBed } from "@angular/core/testing";
import { SpectrumAnalyzerComponent } from "./spectrum-analyzer.component";

const SAMPLE_RATE = 48_000;
const BIN_COUNT = 1024;

function fakeAnalyser(spectrum: (index: number) => number = () => 0) {
  const data = new Uint8Array(BIN_COUNT);
  for (let i = 0; i < BIN_COUNT; i += 1) data[i] = spectrum(i);
  return {
    fftSize: BIN_COUNT * 2,
    frequencyBinCount: BIN_COUNT,
    context: { sampleRate: SAMPLE_RATE },
    getByteFrequencyData(target: Uint8Array) {
      target.set(data);
    },
    _data: data,
  } as unknown as AnalyserNode & { _data: Uint8Array };
}

function stubMatchMedia(reducedMotion: boolean) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: query.includes("prefers-reduced-motion") ? reducedMotion : false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

describe("SpectrumAnalyzerComponent", () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [SpectrumAnalyzerComponent] });
    stubMatchMedia(false);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("log-frequency mapping", () => {
    it("puts the low end and the top end at the ends of the axis", () => {
      expect(SpectrumAnalyzerComponent.frequencyAt(0)).toBeCloseTo(20, 5);
      expect(SpectrumAnalyzerComponent.frequencyAt(1)).toBeCloseTo(20000, 5);
    });

    it("does not give half the axis to the top 1.5 octaves like a linear FFT", () => {
      // 1 kHz is 5.4 octaves above 20 Hz out of ~10 octaves total: on a log axis
      // it belongs just past the middle, not at 5% of the width.
      const at1k = SpectrumAnalyzerComponent.fractionFor(1000);
      expect(at1k).toBeGreaterThan(0.5);
      expect(at1k).toBeLessThan(0.62);
    });

    it("round-trips Hz ↔ fraction", () => {
      for (const hz of [20, 100, 440, 1000, 6000, 20000]) {
        const back = SpectrumAnalyzerComponent.frequencyAt(
          SpectrumAnalyzerComponent.fractionFor(hz),
        );
        expect(back).toBeCloseTo(hz, 3);
      }
    });

    it("clamps out-of-range input instead of returning NaN", () => {
      expect(SpectrumAnalyzerComponent.frequencyAt(-1)).toBeCloseTo(20, 5);
      expect(SpectrumAnalyzerComponent.frequencyAt(2)).toBeCloseTo(20000, 5);
      expect(Number.isFinite(SpectrumAnalyzerComponent.fractionFor(0.5))).toBe(
        true,
      );
    });
  });

  describe("magnitude → dB", () => {
    it("maps full scale to 0 dBFS and silence to the -100 floor", () => {
      expect(SpectrumAnalyzerComponent.dbFor(255)).toBeCloseTo(0, 5);
      expect(SpectrumAnalyzerComponent.dbFor(0)).toBeCloseTo(-100, 5);
      expect(SpectrumAnalyzerComponent.dbFor(128)).toBeCloseTo(-49.8, 1);
    });

    it("never returns a positive dB, however it is fed", () => {
      expect(SpectrumAnalyzerComponent.dbFor(999)).toBeLessThanOrEqual(0);
    });
  });

  describe("peak hold", () => {
    it("rises instantly and falls at the fixed dB rate", () => {
      const component = TestBed.createComponent(
        SpectrumAnalyzerComponent,
      ).componentInstance;
      const first = component.step(new Uint8Array([200, 0]));
      expect(first[0]).toBe(200);
      expect(first[1]).toBe(0);

      const second = component.step(new Uint8Array([0, 0]));
      expect(second[0]).toBeCloseTo(200 - 4.5, 5);
      expect(second[1]).toBe(0);
    });

    it("never lets a held peak fall below zero", () => {
      const component = TestBed.createComponent(
        SpectrumAnalyzerComponent,
      ).componentInstance;
      for (let i = 0; i < 200; i += 1) component.step(new Uint8Array([0]));
      expect(component.step(new Uint8Array([0]))[0]).toBe(0);
    });
  });

  describe("render loop", () => {
    it("does not throw when ticked without a canvas or an analyser", () => {
      const component = TestBed.createComponent(
        SpectrumAnalyzerComponent,
      ).componentInstance;
      expect(() => component.tick()).not.toThrow();
    });

    it("survives a detached analyser instead of taking the renderer down", () => {
      const component = TestBed.createComponent(
        SpectrumAnalyzerComponent,
      ).componentInstance;
      const detached = {
        frequencyBinCount: BIN_COUNT,
        context: { sampleRate: SAMPLE_RATE },
        getByteFrequencyData() {
          throw new Error("node detached");
        },
      } as unknown as AnalyserNode;
      component.analyser = detached;
      expect(() => component.tick()).not.toThrow();
    });

    // Asserting on the component's own frame handle rather than on the global
    // requestAnimationFrame: Angular's test harness drives its own frames, so a
    // global spy cannot tell our loop apart from the framework's.
    it("schedules no frames while the host reports it is inactive", () => {
      spyOnAllAnimationFrames();
      const component = TestBed.createComponent(
        SpectrumAnalyzerComponent,
      ).componentInstance;
      component.analyser = fakeAnalyser(() => 120);
      component.active = false;
      component.ngOnChanges({ active: {} as never });
      expect(component["rafId"]).toBe(0);
    });

    it("starts a frame loop once the host reports it is active", () => {
      spyOnAllAnimationFrames();
      const component = TestBed.createComponent(
        SpectrumAnalyzerComponent,
      ).componentInstance;
      component.analyser = fakeAnalyser(() => 120);
      component.active = true;
      component.ngOnChanges({ active: {} as never });
      expect(component["rafId"]).not.toBe(0);
    });

    it("keeps a single static frame for reduced-motion users", () => {
      stubMatchMedia(true);
      spyOnAllAnimationFrames();
      const component = TestBed.createComponent(
        SpectrumAnalyzerComponent,
      ).componentInstance;
      component.analyser = fakeAnalyser(() => 120);
      component.active = true;
      component.ngOnChanges({ active: {} as never });
      expect(component["rafId"]).toBe(0);
    });
  });
});

function spyOnAllAnimationFrames() {
  return jest
    .spyOn(globalThis, "requestAnimationFrame")
    .mockImplementation(() => 1 as unknown as number);
}
