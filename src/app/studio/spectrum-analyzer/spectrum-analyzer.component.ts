import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Input,
  OnChanges,
  OnDestroy,
  SimpleChanges,
  ViewChild,
} from "@angular/core";

/** dB grid lines drawn behind the trace, loudest first. */
const DB_GRID = [0, -6, -12, -24, -36, -48, -60];
/** Frequency labels, in Hz. Log-spaced labels are what makes a spectra readable. */
const HZ_LABELS = [50, 100, 200, 500, 1000, 2000, 5000, 10000];
const MIN_HZ = 20;
const MAX_HZ = 20000;
const FALLBACK_SAMPLE_RATE = 48_000;
/** 4.5 dB of falloff per frame on a hold — slow enough to read, fast enough to track. */
const PEAK_FALLOFF = 4.5;

/**
 * High-resolution FFT spectrum analyzer for mix monitoring.
 *
 * Why a log-frequency scale: a linear FFT spends 90% of its width on the top
 * two octaves, which is exactly where a producer needs it least. Mapping 20 Hz
 * → 20 kHz logarithmically across the width is what makes kick, body, presence
 * and air all legible at once — the same reason every hardware RTA is log.
 *
 * Why peak-hold: a Fourier frame is a snapshot, so a transient that lasts three
 * frames is invisible on a live trace. The held peaks decay at a fixed dB rate
 * and are the only way to see how far above the average a snare actually sits.
 *
 * Cost control, in order: one `getByteFrequencyData` per frame into a
 * pre-allocated buffer; `requestAnimationFrame` only while `active`; a single
 * static frame under `prefers-reduced-motion` or when the tab is hidden; and
 * no allocation inside the loop.
 */
@Component({
  selector: "app-spectrum-analyzer",
  standalone: true,
  imports: [],
  template: `
    <div class="spec-host" [style.height.px]="height">
      <canvas #surface class="spec-canvas" aria-hidden="true"></canvas>
      <div class="spec-overlay">
        <span class="spec-label">{{ label }}</span>
        <span class="spec-state" [class.is-live]="active">
          {{ active ? "RTA LIVE" : "RTA HOLD" }}
        </span>
      </div>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        min-width: 0;
      }
      .spec-host {
        position: relative;
        width: 100%;
        overflow: hidden;
        border: 1px solid var(--fl-line, #34353d);
        border-radius: 10px;
        background: var(--fl-inset, #0e0f12);
      }
      .spec-canvas {
        display: block;
        width: 100%;
        height: 100%;
      }
      .spec-overlay {
        position: absolute;
        inset: 6px 8px auto 8px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        pointer-events: none;
      }
      .spec-label {
        font-size: 9px;
        font-weight: 800;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        color: var(--fl-dim, #a0a1ab);
      }
      .spec-state {
        font-size: 9px;
        font-weight: 800;
        letter-spacing: 0.12em;
        color: var(--fl-dim-2, #6c6d76);
      }
      .spec-state.is-live {
        color: var(--fl-play, #74c05a);
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SpectrumAnalyzerComponent
  implements AfterViewInit, OnChanges, OnDestroy
{
  /** The tap to visualize. Usually `AudioEngineService.masterAnalyser`. */
  @Input() analyser: AnalyserNode | null = null;
  /** Render loop on/off. The host drives this from transport + visibility. */
  @Input() active = false;
  @Input() label = "Master spectrum";
  @Input() height = 132;

  @ViewChild("surface", { static: false })
  surface?: ElementRef<HTMLCanvasElement>;

  private ctx: CanvasRenderingContext2D | null = null;
  private buffer: Uint8Array<ArrayBuffer> | null = null;
  private peaks: Float32Array | null = null;
  private rafId = 0;
  private observer: ResizeObserver | null = null;
  private lastCssWidth = 0;
  private lastCssHeight = 0;

  ngAfterViewInit() {
    const canvas = this.surface?.nativeElement;
    if (!canvas) return;
    this.ctx = canvas.getContext("2d");
    this.ensureBuffer();
    this.resize();
    this.observeSize(canvas);
    // Paint one frame immediately so a paused analyzer shows the grid rather
    // than an empty black rectangle.
    this.draw();
    if (this.active) this.start();
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes["analyser"] || changes["active"]) {
      this.ensureBuffer();
      if (this.active) this.start();
      else this.stop();
    }
  }

  ngOnDestroy() {
    this.stop();
    this.observer?.disconnect();
    this.observer = null;
  }

  // ── Public helpers (deterministic, unit-tested) ────────────────────────

  /**
   * Log-frequency mapping. `fraction` 0..1 → Hz, the same curve the canvas
   * x-axis uses, so a test can assert the grid without a real canvas.
   */
  static frequencyAt(fraction: number): number {
    const clamped = Math.min(1, Math.max(0, fraction));
    return MIN_HZ * Math.pow(MAX_HZ / MIN_HZ, clamped);
  }

  /** Inverse of {@link frequencyAt}: Hz → 0..1 across the canvas. */
  static fractionFor(frequency: number): number {
    const clamped = Math.min(MAX_HZ, Math.max(MIN_HZ, frequency));
    return Math.log(clamped / MIN_HZ) / Math.log(MAX_HZ / MIN_HZ);
  }

  /** Byte magnitude (0–255) → dBFS-ish, floored at -100. */
  static dbFor(byte: number): number {
    return (Math.max(0, Math.min(255, byte)) / 255) * 100 - 100;
  }

  /** Advance and return the peak-hold line. Exposed so a test can step it. */
  step(frame: Uint8Array): Float32Array {
    if (!this.peaks || this.peaks.length !== frame.length) {
      this.peaks = new Float32Array(frame.length);
    }
    for (let i = 0; i < frame.length; i += 1) {
      const value = frame[i];
      const held = this.peaks[i];
      this.peaks[i] = value >= held ? value : Math.max(0, held - PEAK_FALLOFF);
    }
    return this.peaks;
  }

  /** One read-and-draw. Public so hosts and tests can drive it without rAF. */
  tick(): void {
    const analyser = this.analyser;
    const buffer = this.buffer;
    if (!analyser || !buffer) return;
    try {
      analyser.getByteFrequencyData(buffer);
    } catch {
      return; // detached node mid-teardown
    }
    this.step(buffer);
    this.draw();
  }

  // ── Internals ──────────────────────────────────────────────────────────

  private start(): void {
    if (this.rafId) return;
    if (this.prefersReducedMotion()) return; // one static frame is the whole UI
    if (typeof requestAnimationFrame !== "function") return;
    const loop = () => {
      if (!this.isHidden()) this.tick();
      this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);
  }

  private stop(): void {
    if (this.rafId && typeof cancelAnimationFrame === "function") {
      cancelAnimationFrame(this.rafId);
    }
    this.rafId = 0;
  }

  private ensureBuffer(): void {
    const binCount = this.analyser?.frequencyBinCount || 1024;
    if (!this.buffer || this.buffer.length !== binCount) {
      this.buffer = new Uint8Array(binCount);
      this.peaks = new Float32Array(binCount);
    }
  }

  private observeSize(canvas: HTMLCanvasElement): void {
    if (typeof ResizeObserver === "undefined") return;
    this.observer = new ResizeObserver(() => {
      if (this.resize()) this.draw();
    });
    this.observer.observe(canvas.parentElement ?? canvas);
  }

  /** Returns true when the backing store actually changed. */
  private resize(): boolean {
    const canvas = this.surface?.nativeElement;
    if (!canvas) return false;
    const rect = canvas.getBoundingClientRect();
    const cssWidth = Math.max(1, Math.round(rect.width));
    const cssHeight = Math.max(1, Math.round(rect.height));
    if (cssWidth === this.lastCssWidth && cssHeight === this.lastCssHeight) {
      return false;
    }
    const dpr =
      typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    // Cap at 2: a 3x phone panel triples the fill cost for no visible gain on a
    // gradient trace.
    const scale = Math.min(2, dpr);
    canvas.width = Math.round(cssWidth * scale);
    canvas.height = Math.round(cssHeight * scale);
    this.ctx?.setTransform(scale, 0, 0, scale, 0, 0);
    this.lastCssWidth = cssWidth;
    this.lastCssHeight = cssHeight;
    return true;
  }

  private draw(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const width = this.lastCssWidth || 1;
    const height = this.lastCssHeight || 1;

    ctx.clearRect(0, 0, width, height);
    this.drawGrid(ctx, width, height);

    const frame = this.buffer;
    if (!frame) return;
    this.drawBand(ctx, width, height, frame, 0.35);
    this.drawBand(ctx, width, height, this.peaks ?? frame, 1);
  }

  private drawGrid(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
  ): void {
    ctx.save();
    ctx.lineWidth = 1;
    // dB grid — horizontal.
    ctx.strokeStyle = "rgba(255,255,255,0.07)";
    for (const db of DB_GRID) {
      const y = this.yForDb(db, height);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
    // Frequency grid — vertical, at the log positions of the labels.
    ctx.strokeStyle = "rgba(255,255,255,0.05)";
    ctx.fillStyle = "rgba(160,161,171,0.75)";
    ctx.font = "9px system-ui, sans-serif";
    ctx.textBaseline = "bottom";
    for (const hz of HZ_LABELS) {
      const x = SpectrumAnalyzerComponent.fractionFor(hz) * width;
      if (x < 1 || x > width - 1) continue;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
      const text = hz >= 1000 ? `${hz / 1000}k` : `${hz}`;
      ctx.fillText(text, Math.min(width - 14, x + 3), height - 2);
    }
    ctx.restore();
  }

  private drawBand(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    frame: Uint8Array | Float32Array,
    alpha: number,
  ): void {
    const sampleRate =
      Number(this.analyser?.context?.sampleRate) > 0
        ? (this.analyser as AnalyserNode).context.sampleRate
        : FALLBACK_SAMPLE_RATE;
    const nyquist = sampleRate / 2;
    const binCount = frame.length;
    const hzPerBin = nyquist / binCount;

    const points: Array<[number, number]> = [];
    // Two samples per CSS pixel is already more than the trace can show; more
    // would just re-read the same bin.
    const columns = Math.max(2, Math.min(512, Math.round(width * 2)));
    for (let c = 0; c <= columns; c += 1) {
      const fraction = c / columns;
      const hz = SpectrumAnalyzerComponent.frequencyAt(fraction);
      const bin = Math.min(
        binCount - 1,
        Math.max(0, Math.round(hz / hzPerBin)),
      );
      const db = SpectrumAnalyzerComponent.dbFor(frame[bin]);
      points.push([fraction * width, this.yForDb(db, height)]);
    }

    ctx.save();
    ctx.globalAlpha = alpha;

    // Filled area under the trace.
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, "rgba(255, 154, 31, 0.55)");
    gradient.addColorStop(0.55, "rgba(0, 229, 255, 0.28)");
    gradient.addColorStop(1, "rgba(0, 229, 255, 0.03)");
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.moveTo(points[0][0], height);
    for (const [x, y] of points) ctx.lineTo(x, y);
    ctx.lineTo(points[points.length - 1][0], height);
    ctx.closePath();
    ctx.fill();

    // The trace itself — thin, bright, and the thing the eye tracks.
    ctx.strokeStyle =
      alpha === 1 ? "rgba(255, 214, 160, 0.95)" : "rgba(120, 220, 255, 0.6)";
    ctx.lineWidth = alpha === 1 ? 1.25 : 1;
    ctx.beginPath();
    for (let i = 0; i < points.length; i += 1) {
      const [x, y] = points[i];
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.restore();
  }

  /** dB → canvas y. 0 dBFS sits 6px below the top so the trace never clips. */
  private yForDb(db: number, height: number): number {
    const top = 6;
    const bottom = Math.max(top + 1, height - 12);
    const clamped = Math.max(-100, Math.min(0, db));
    return top + (clamped / -100) * (bottom - top);
  }

  private isHidden(): boolean {
    return (
      typeof document !== "undefined" && document.visibilityState === "hidden"
    );
  }

  private prefersReducedMotion(): boolean {
    if (
      typeof window === "undefined" ||
      typeof window.matchMedia !== "function"
    ) {
      return false;
    }
    try {
      return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch {
      return false;
    }
  }
}
