import {
  Component,
  inject,
  Input,
  signal,
  computed,
  ElementRef,
  ViewChild,
  AfterViewInit,
  OnDestroy,
  HostListener,
  Output,
  EventEmitter,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { AutomationService, AutomationLane, AutomationPoint } from '../automation.service';
import { BezierPresets, BezierSegment, buildBezierSegment, evaluateCubicBezier } from './bezier-utils';
import { WebGLRenderer, GLColor } from '../webgl/webgl-renderer';

/** Pre-built bezier curve presets exposed to the UI */
interface BezierPresetEntry {
  id: string;
  label: string;
  handles: { cpIn: { t: number; value: number }; cpOut: { t: number; value: number } };
}

const PRESET_ENTRIES: BezierPresetEntry[] = [
  { id: 'linear', label: 'Linear', handles: BezierPresets.linear },
  { id: 'easeIn', label: 'Ease In', handles: BezierPresets.easeIn },
  { id: 'easeOut', label: 'Ease Out', handles: BezierPresets.easeOut },
  { id: 'easeInOut', label: 'Ease In-Out', handles: BezierPresets.easeInOut },
  { id: 'quick', label: 'Quick Jump', handles: BezierPresets.quick },
  { id: 'expoRise', label: 'Expo Rise', handles: BezierPresets.expoRise },
  { id: 'expoFall', label: 'Expo Fall', handles: BezierPresets.expoFall },
];

const CURVE_COLOR: GLColor = { r: 0.15, g: 0.85, b: 0.95, a: 0.9 };
const HANDLE_LINE_COLOR: GLColor = { r: 0.4, g: 0.4, b: 0.6, a: 0.7 };
const HANDLE_POINT_COLOR: GLColor = { r: 1.0, g: 0.85, b: 0.1, a: 0.9 };
const GRID_COLOR: GLColor = { r: 0.12, g: 0.15, b: 0.25, a: 0.4 };
const BG_COLOR: GLColor = { r: 0.04, g: 0.06, b: 0.11, a: 1.0 };
const READOUT_COLOR: GLColor = { r: 0.95, g: 0.3, b: 0.45, a: 0.95 };

@Component({
  selector: 'app-bezier-editor',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="bezier-editor-shell">
      <div class="bezier-header">
        <span class="bezier-title">BEZIER CURVE EDITOR</span>
        <div class="bezier-presets">
          <button
            *ngFor="let preset of presets"
            type="button"
            class="bezier-preset-btn"
            [class.active]="activePreset() === preset.id"
            (click)="applyPreset(preset.id)"
          >{{ preset.label }}</button>
        </div>
      </div>
      <div class="bezier-canvas-wrap" #canvasWrap>
        <canvas #bezierCanvas class="bezier-canvas"></canvas>
        <div class="bezier-labels">
          <span class="bezier-label-tl">0%</span>
          <span class="bezier-label-tr">100%</span>
          <span class="bezier-label-bl">Time →</span>
          <span class="bezier-label-br">Value</span>
        </div>
      </div>
      <div class="bezier-footer">
        <div class="bezier-point-info" *ngIf="draggingHandle() as h">
          CP{{ h }}: {{ handlePositions() }}
        </div>
        <div class="bezier-readout-info" *ngIf="readoutDots().length > 0">
          <span class="bezier-readout-dot"></span>
          {{ readoutDots().length }} recorded keyframes
        </div>
        <button type="button" class="bezier-reset-btn" (click)="resetHandles()">Reset</button>
        <button type="button" class="bezier-apply-btn" (click)="commitCurve()">Apply to Lane</button>
      </div>
    </div>
  `,
  styleUrls: ['./bezier-editor.component.css'],
})
export class BezierEditorComponent implements AfterViewInit, OnDestroy {
  @Input() laneId!: string;

  @Output() curveChanged = new EventEmitter<{
    cpIn: { t: number; value: number };
    cpOut: { t: number; value: number };
  }>();

  private autoSvc = inject(AutomationService);
  private gl!: WebGLRenderer;
  /** False when the device cannot give us a WebGL2 context (older Android
   *  WebViews, GPU-blocklisted drivers, exhausted context budget). The curve
   *  then stays a DOM/readout-only editor instead of throwing in view init. */
  private isGlReady = false;
  private renderRaf: number | null = null;

  @ViewChild('bezierCanvas') canvasRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('canvasWrap') wrapRef!: ElementRef<HTMLDivElement>;

  presets = PRESET_ENTRIES;
  activePreset = signal('easeInOut');

  /** Current control handles (0..1 in both t and value dimensions) */
  cpIn = signal({ t: 0.33, value: 0 });
  cpOut = signal({ t: 0.67, value: 0 });

  draggingHandle = signal<'in' | 'out' | null>(null);

  handlePositions = computed(() => {
    const i = this.cpIn();
    const o = this.cpOut();
    return `IN(${(i.t * 100).toFixed(0)}%,${(i.value * 100).toFixed(0)}%) OUT(${(o.t * 100).toFixed(0)}%,${(o.value * 100).toFixed(0)}%)`;
  });

  /**
   * Readout sync: recorded keyframes from the automation lane mapped to
   * normalized canvas space (x = time%, y = value%) so the editor overlays
   * the same dots the piano-roll CC strip shows.
   */
  readoutDots = computed(() => {
    if (!this.laneId) return [];
    const lane = this.autoSvc.lanes().find((l) => l.id === this.laneId);
    if (!lane || lane.points.length === 0) return [];
    const maxT = Math.max(1, ...lane.points.map((p) => p.time));
    const minV = lane.target.min ?? 0;
    const maxV = lane.target.max ?? 127;
    const span = Math.max(1, maxV - minV);
    return lane.points.map((p) => ({
      x: p.time / maxT,
      y: (p.value - minV) / span,
    }));
  });

  ngAfterViewInit(): void {
    this.initWebGL();
    this.loadLaneHandles();
    this.startRenderLoop();
  }

  ngOnDestroy(): void {
    if (this.renderRaf !== null) cancelAnimationFrame(this.renderRaf);
    this.gl?.destroy();
  }

  /** Same defensive shape as the piano roll / arrangement views: a missing
   *  WebGL2 context is a degraded mode, never a thrown error. */
  private initWebGL(): void {
    try {
      this.gl = new WebGLRenderer();
      this.gl.initialize(this.canvasRef.nativeElement);
      this.isGlReady = true;
    } catch (e) {
      console.warn('WebGL init failed for the bezier editor', e);
    }
  }

  // ── Render loop ─────────────────────────────────────────

  private startRenderLoop(): void {
    const tick = () => {
      this.renderRaf = requestAnimationFrame(tick);
      this.renderCurve();
    };
    this.renderRaf = requestAnimationFrame(tick);
  }

  private renderCurve(): void {
    if (!this.isGlReady) return;
    const canvas = this.canvasRef.nativeElement;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      this.gl.resize();
    }

    const cpIn = this.cpIn();
    const cpOut = this.cpOut();

    this.gl.clear(BG_COLOR.r, BG_COLOR.g, BG_COLOR.b, BG_COLOR.a);
    this.gl.beginFrame({ scrollX: 0, scrollY: 0, zoom: 1 });

    // Grid
    for (let i = 0; i <= 4; i++) {
      const t = i / 4;
      const x = t * w;
      this.gl.drawVLine(x, 0, h, GRID_COLOR);
      this.gl.drawHLine(t * h, 0, w, GRID_COLOR);
    }

    // Diagonal reference line (linear)
    for (let i = 0; i < 100; i++) {
      const t = i / 100;
      const refX = t * w;
      const refY = (1 - t) * h;
      if (i % 5 === 0) {
        this.gl.drawVLine(refX, refY - 2, refY + 2, { ...GRID_COLOR, a: 0.2 });
      }
    }

    // Handle lines from corners to control points
    const hxIn = cpIn.t * w;
    const hyIn = (1 - cpIn.value) * h;
    const hxOut = cpOut.t * w;
    const hyOut = (1 - cpOut.value) * h;

    this.gl.drawLine(0, h, hxIn, hyIn, HANDLE_LINE_COLOR);
    this.gl.drawLine(w, 0, hxOut, hyOut, HANDLE_LINE_COLOR);

    // Bezier curve (64 segments)
    const segment: BezierSegment = {
      p0: { t: 0, value: 1 },
      p1: { t: cpIn.t, value: 1 - cpIn.value },
      p2: { t: cpOut.t, value: 1 - cpOut.value },
      p3: { t: 1, value: 0 },
    };

    let prevX = 0, prevY = h;
    for (let i = 1; i <= 64; i++) {
      const t = i / 64;
      const val = evaluateCubicBezier(segment, t);
      const cx = t * w;
      const cy = val * h;

      this.gl.drawLine(prevX, prevY, cx, cy, CURVE_COLOR);
      prevX = cx;
      prevY = cy;
    }

    // Control point handles
    this.gl.drawQuad(hxIn - 6, hyIn - 6, 12, 12, HANDLE_POINT_COLOR, 6);
    this.gl.drawQuad(hxOut - 6, hyOut - 6, 12, 12, HANDLE_POINT_COLOR, 6);

    // Corner anchors
    this.gl.drawQuad(-4, h - 4, 8, 8, HANDLE_POINT_COLOR, 4);
    this.gl.drawQuad(w - 4, -4, 8, 8, HANDLE_POINT_COLOR, 4);

    // Readout sync: recorded keyframe dots from the automation lane
    for (const dot of this.readoutDots()) {
      const dx = dot.x * w;
      const dy = (1 - dot.y) * h;
      this.gl.drawQuad(dx - 4, dy - 4, 8, 8, READOUT_COLOR, 4);
    }

    this.gl.flush();
  }

  // ── Interaction ─────────────────────────────────────────

  @HostListener('pointerdown', ['$event'])
  onPointerDown(e: PointerEvent): void {
    const rect = this.canvasRef.nativeElement.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;

    const cpIn = this.cpIn();
    const cpOut = this.cpOut();

    // Hit test: within 20px of a control point
    const distIn = Math.hypot(x - cpIn.t, (1 - y) - cpIn.value);
    const distOut = Math.hypot(x - cpOut.t, (1 - y) - cpOut.value);

    if (distIn < 0.06) {
      this.draggingHandle.set('in');
    } else if (distOut < 0.06) {
      this.draggingHandle.set('out');
    }
  }

  @HostListener('pointermove', ['$event'])
  onPointerMove(e: PointerEvent): void {
    const handle = this.draggingHandle();
    if (!handle) return;

    const rect = this.canvasRef.nativeElement.getBoundingClientRect();
    const t = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const value = 1 - Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));

    if (handle === 'in') {
      this.cpIn.set({ t, value });
    } else {
      this.cpOut.set({ t, value });
    }
    this.activePreset.set(''); // custom
  }

  @HostListener('pointerup')
  onPointerUp(): void {
    this.draggingHandle.set(null);
  }

  // ── Presets & actions ───────────────────────────────────

  applyPreset(id: string): void {
    const preset = PRESET_ENTRIES.find((p) => p.id === id);
    if (!preset) return;
    this.cpIn.set({ ...preset.handles.cpIn });
    this.cpOut.set({ ...preset.handles.cpOut });
    this.activePreset.set(id);
  }

  resetHandles(): void {
    this.cpIn.set({ t: 0.33, value: 0 });
    this.cpOut.set({ t: 0.67, value: 0 });
    this.activePreset.set('easeInOut');
  }

  commitCurve(): void {
    const cpIn = this.cpIn();
    const cpOut = this.cpOut();
    this.curveChanged.emit({ cpIn, cpOut });

    // Write bezier handles to the automation lane points
    if (this.laneId) {
      const lane = this.autoSvc.lanes().find((l) => l.id === this.laneId);
      if (lane && lane.points.length >= 2) {
        // Apply to the first segment
        this.autoSvc.updatePoint(this.laneId, 0, { bezierHandles: { cpIn, cpOut } });
        this.autoSvc.setLaneInterpolation(this.laneId, 'bezier');
      }
    }
  }

  private loadLaneHandles(): void {
    if (!this.laneId) return;
    const lane = this.autoSvc.lanes().find((l) => l.id === this.laneId);
    if (lane && lane.points.length >= 2 && lane.points[0].bezierHandles) {
      const handles = lane.points[0].bezierHandles;
      this.cpIn.set({ ...handles.cpIn });
      this.cpOut.set({ ...handles.cpOut });
    }
  }
}
