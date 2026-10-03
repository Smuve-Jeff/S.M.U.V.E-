import {
  Component,
  EventEmitter,
  OnDestroy,
  Output,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  AutomationInterpolation,
  AutomationLane,
  AutomationService,
} from '../automation.service';
import {
  AutomationRange,
  laneParameterLabel,
  laneRange,
  normToValue,
  valueToNorm,
} from './automation-curve.util';

export interface AutomationLaneView {
  lane: AutomationLane;
  range: AutomationRange;
  path: string;
  points: Array<{ x: number; y: number; index: number }>;
}

export const AUTOMATION_LANE_HEIGHT = 72;

/** Pixels of padding inside the lane so the curve never clips. */
const LANE_PADDING = 8;
/** Samples per bar used to draw interpolated (bezier/smooth) curves. */
const SAMPLES_PER_BAR = 16;

/**
 * Arrangement automation editor — renders every automation lane of the
 * selected track as an editable SVG curve. Click to add a keyframe, drag to
 * move it (time + value), double-click / right-click to delete. Uses the same
 * pixel-per-bar scale as the arrangement canvas so curves line up with clips.
 */
@Component({
  selector: 'app-automation-curve-editor',
  standalone: true,
  imports: [CommonModule],
  template: `
    <section class="automation-editor" aria-label="Automation curve editor">
      <header class="automation-toolbar">
        <span class="automation-title">AUTOMATION CURVES</span>
        <label class="automation-add">
          <select
            class="automation-param-select"
            [value]="addParameter()"
            (change)="setAddParameter($event)"
            aria-label="Parameter to automate"
          >
            <option *ngFor="let parameter of parameters" [value]="parameter">
              {{ parameterLabel(parameter) }}
            </option>
          </select>
          <button
            type="button"
            class="automation-add-btn"
            [disabled]="!trackId"
            (click)="addLane()"
          >
            + Lane
          </button>
        </label>
      </header>

      <p class="automation-empty" *ngIf="laneViews().length === 0">
        No automation lanes for this track yet — pick a parameter and add one.
      </p>

      <div class="automation-scroll" *ngIf="laneViews().length > 0">
        <div class="automation-lanes" [style.width.px]="width()">
          <article
            class="automation-lane"
            *ngFor="let view of laneViews()"
            [class.automation-lane-selected]="selectedLaneId() === view.lane.id"
            [class.automation-lane-disabled]="!view.lane.enabled"
          >
            <header class="automation-lane-head">
              <button
                type="button"
                class="automation-lane-toggle"
                [class.active]="view.lane.enabled"
                (click)="toggleLane(view.lane)"
                [attr.aria-label]="
                  view.lane.enabled ? 'Disable this automation lane' : 'Enable this automation lane'
                "
              >
                {{ view.lane.enabled ? 'ON' : 'OFF' }}
              </button>
              <span class="automation-lane-name">
                {{ laneName(view.lane) }}
              </span>
              <select
                class="automation-interp"
                [value]="view.lane.interpolation"
                (change)="setInterpolation(view.lane, $event)"
                aria-label="Curve interpolation"
              >
                <option value="linear">Linear</option>
                <option value="step">Step</option>
                <option value="smooth">Smooth</option>
                <option value="bezier">Bezier</option>
              </select>
              <button
                type="button"
                class="automation-lane-action"
                (click)="openBezierEditor.emit(view.lane.id)"
              >
                Curve
              </button>
              <button
                type="button"
                class="automation-lane-action"
                (click)="clearLane(view.lane)"
              >
                Clear
              </button>
              <button
                type="button"
                class="automation-lane-action automation-lane-remove"
                (click)="removeLane(view.lane)"
                [attr.aria-label]="'Remove ' + laneName(view.lane) + ' lane'"
              >
                ×
              </button>
            </header>
            <svg
              class="automation-canvas"
              [attr.data-lane-id]="view.lane.id"
              [attr.width]="width()"
              [attr.height]="laneHeight"
              (pointerdown)="onBackgroundPointerDown($event, view.lane)"
            >
              <line
                *ngFor="let x of barLines()"
                class="automation-grid-line"
                [attr.x1]="x"
                [attr.x2]="x"
                y1="0"
                [attr.y2]="laneHeight"
              ></line>
              <path
                *ngIf="view.path"
                class="automation-curve"
                [attr.d]="view.path"
                fill="none"
              ></path>
              <circle
                *ngFor="let point of view.points"
                class="automation-point"
                [attr.cx]="point.x"
                [attr.cy]="point.y"
                r="5"
                (pointerdown)="
                  onPointPointerDown($event, view.lane, point.index)
                "
                (dblclick)="onPointDelete($event, view.lane, point.index)"
                (contextmenu)="onPointDelete($event, view.lane, point.index)"
              ></circle>
            </svg>
          </article>
        </div>
      </div>
    </section>
  `,
  styles: [
    `
      .automation-editor {
        display: flex;
        flex-direction: column;
        gap: 6px;
        padding: 8px 10px 10px;
      }
      .automation-toolbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
      }
      .automation-title {
        font-size: 10px;
        font-weight: 800;
        letter-spacing: 0.14em;
        color: var(--espresso-muted, #6b6257);
      }
      .automation-add {
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .automation-param-select,
      .automation-interp {
        font-size: 11px;
        padding: 3px 6px;
        border-radius: 6px;
        border: 1px solid var(--espresso-line, rgba(120, 110, 95, 0.35));
        background: transparent;
        color: inherit;
      }
      .automation-add-btn,
      .automation-lane-action,
      .automation-lane-toggle {
        font-size: 10px;
        font-weight: 700;
        padding: 3px 8px;
        border-radius: 6px;
        border: 1px solid var(--espresso-line, rgba(120, 110, 95, 0.35));
        background: transparent;
        color: inherit;
        cursor: pointer;
      }
      .automation-lane-toggle.active {
        border-color: var(--teal-500, #14b8a6);
        color: var(--teal-500, #14b8a6);
      }
      .automation-empty {
        margin: 0;
        font-size: 11px;
        color: var(--espresso-muted, #6b6257);
      }
      .automation-scroll {
        overflow-x: auto;
        overflow-y: hidden;
      }
      .automation-lanes {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .automation-lane {
        border: 1px solid var(--espresso-line, rgba(120, 110, 95, 0.35));
        border-radius: 8px;
        background: rgba(255, 255, 255, 0.35);
      }
      .automation-lane-selected {
        border-color: var(--teal-500, #14b8a6);
      }
      .automation-lane-disabled {
        opacity: 0.55;
      }
      .automation-lane-head {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 5px 8px;
        border-bottom: 1px solid var(--espresso-line, rgba(120, 110, 95, 0.2));
      }
      .automation-lane-name {
        font-size: 10px;
        font-weight: 800;
        letter-spacing: 0.08em;
        margin-right: auto;
      }
      .automation-canvas {
        display: block;
        touch-action: none;
        cursor: crosshair;
      }
      .automation-grid-line {
        stroke: rgba(120, 110, 95, 0.18);
        stroke-width: 1;
      }
      .automation-curve {
        stroke: var(--teal-500, #14b8a6);
        stroke-width: 2;
      }
      .automation-point {
        fill: var(--orange, #f97316);
        stroke: #fff;
        stroke-width: 1.5;
        cursor: grab;
      }
      .automation-point:active {
        cursor: grabbing;
      }
    `,
  ],
})
export class AutomationCurveEditorComponent implements OnDestroy {
  // Signal inputs: the lane view + geometry computeds depend on these and a
  // plain @Input mutation would leave them stale.
  readonly barWidth = input(200);
  readonly totalBars = input(64);
  readonly trackId = input<string | null>(null);
  @Output() openBezierEditor = new EventEmitter<string>();

  private readonly automation = inject(AutomationService);

  readonly laneHeight = AUTOMATION_LANE_HEIGHT;
  readonly parameters = ['volume', 'pan', 'cutoff', 'reverb', 'cc_1', 'cc_11'];
  readonly addParameter = signal('volume');
  readonly selectedLaneId = signal<string | null>(null);

  readonly lanes = computed(() => {
    const all = this.automation.lanes();
    const trackId = this.trackId();
    if (!trackId) return all;
    return all.filter((lane) => lane.target.trackId === trackId);
  });

  readonly width = computed(() =>
    Math.max(1, this.totalBars()) * this.barWidth(),
  );

  readonly barLines = computed(() => {
    const lines: number[] = [];
    for (let bar = 0; bar <= Math.max(1, this.totalBars()); bar++) {
      lines.push(bar * this.barWidth());
    }
    return lines;
  });

  readonly laneViews = computed<AutomationLaneView[]>(() =>
    this.lanes().map((lane) => this.buildView(lane)),
  );

  /** Active drag bookkeeping; index is refreshed when points re-sort. */
  private drag: { laneId: string; index: number } | null = null;
  private readonly onDragMove = (event: PointerEvent) => this.dragMove(event);
  private readonly onDragEnd = () => this.endDrag();

  ngOnDestroy(): void {
    this.endDrag();
  }

  // ── Geometry helpers ─────────────────────────────────────────────

  /** 16 steps per bar, matching the arrangement grid. */
  timeToX(time: number): number {
    return (time / 16) * this.barWidth();
  }

  xToTime(x: number): number {
    return (x / this.barWidth()) * 16;
  }

  valueToY(value: number, range: AutomationRange): number {
    const norm = valueToNorm(value, range);
    return (1 - norm) * (this.laneHeight - LANE_PADDING * 2) + LANE_PADDING;
  }

  yToValue(y: number, range: AutomationRange): number {
    const norm = 1 - (y - LANE_PADDING) / (this.laneHeight - LANE_PADDING * 2);
    return normToValue(norm, range);
  }

  laneName(lane: AutomationLane): string {
    return laneParameterLabel(lane.target.parameter);
  }

  parameterLabel(parameter: string): string {
    return laneParameterLabel(parameter);
  }

  // ── Lane controls ────────────────────────────────────────────────

  setAddParameter(event: Event): void {
    this.addParameter.set((event.target as HTMLSelectElement).value);
  }

  addLane(): void {
    const trackId = this.trackId();
    if (!trackId) return;
    const lane = this.automation.ensureLane(trackId, this.addParameter(), {
      interpolation: 'smooth',
    });
    this.selectedLaneId.set(lane.id);
  }

  removeLane(lane: AutomationLane): void {
    this.automation.removeLane(lane.id);
    if (this.selectedLaneId() === lane.id) this.selectedLaneId.set(null);
  }

  toggleLane(lane: AutomationLane): void {
    this.automation.setLaneEnabled(lane.id, !lane.enabled);
  }

  setInterpolation(lane: AutomationLane, event: Event): void {
    const value = (event.target as HTMLSelectElement)
      .value as AutomationInterpolation;
    this.automation.setLaneInterpolation(lane.id, value);
  }

  clearLane(lane: AutomationLane): void {
    this.automation.setPoints(lane.id, []);
  }

  // ── Keyframe editing ─────────────────────────────────────────────

  /** Add a keyframe from lane-local pixel coordinates. */
  addPointAt(lane: AutomationLane, x: number, y: number): void {
    const range = laneRange(
      lane.target.parameter,
      lane.target.min,
      lane.target.max,
    );
    const time = this.clampTime(this.xToTime(x));
    const value = this.yToValue(y, range);
    this.automation.addPoint(lane.id, round4(time), round4(value));
    this.selectedLaneId.set(lane.id);
  }

  /**
   * Move a keyframe to a lane-local time/value. Returns its (possibly new)
   * index after the lane re-sorts so a drag can keep following the point.
   */
  movePointTo(
    laneId: string,
    index: number,
    time: number,
    value: number,
  ): number {
    const lane = this.lanes().find((l) => l.id === laneId);
    if (!lane) return -1;
    const range = laneRange(
      lane.target.parameter,
      lane.target.min,
      lane.target.max,
    );
    const clampedValue = Math.max(
      range.min,
      Math.min(range.max, Number.isFinite(value) ? value : range.min),
    );
    return this.automation.movePoint(
      laneId,
      index,
      round4(this.clampTime(time)),
      round4(clampedValue),
    );
  }

  deletePoint(laneId: string, index: number): void {
    this.automation.removePoint(laneId, index);
  }

  onPointDelete(
    event: Event,
    lane: AutomationLane,
    index: number,
  ): void {
    event.preventDefault();
    event.stopPropagation();
    this.deletePoint(lane.id, index);
  }

  onBackgroundPointerDown(
    event: PointerEvent,
    lane: AutomationLane,
  ): void {
    const target = event.target as Element | null;
    if (target?.closest?.('circle')) return;
    const local = this.localPoint(event, lane.id);
    if (!local) return;
    this.addPointAt(lane, local.x, local.y);
  }

  onPointPointerDown(
    event: PointerEvent,
    lane: AutomationLane,
    index: number,
  ): void {
    event.preventDefault();
    event.stopPropagation();
    this.selectedLaneId.set(lane.id);
    this.drag = { laneId: lane.id, index };
    if (typeof window !== 'undefined') {
      window.addEventListener('pointermove', this.onDragMove);
      window.addEventListener('pointerup', this.onDragEnd);
      window.addEventListener('pointercancel', this.onDragEnd);
    }
    this.dragMove(event);
  }

  private dragMove(event: PointerEvent): void {
    if (!this.drag) return;
    const lane = this.lanes().find((l) => l.id === this.drag!.laneId);
    if (!lane) return;
    const local = this.localPoint(event, lane.id);
    if (!local) return;
    const range = laneRange(
      lane.target.parameter,
      lane.target.min,
      lane.target.max,
    );
    const nextIndex = this.movePointTo(
      lane.id,
      this.drag.index,
      this.xToTime(local.x),
      this.yToValue(local.y, range),
    );
    if (nextIndex >= 0) this.drag = { laneId: lane.id, index: nextIndex };
  }

  private endDrag(): void {
    this.drag = null;
    if (typeof window === 'undefined') return;
    window.removeEventListener('pointermove', this.onDragMove);
    window.removeEventListener('pointerup', this.onDragEnd);
    window.removeEventListener('pointercancel', this.onDragEnd);
  }

  private localPoint(
    event: PointerEvent,
    laneId: string,
  ): { x: number; y: number } | null {
    if (typeof document === 'undefined') return null;
    const svg = document.querySelector<SVGSVGElement>(
      `svg[data-lane-id="${laneId}"]`,
    );
    if (!svg?.getBoundingClientRect) return null;
    const rect = svg.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
  }

  private buildView(lane: AutomationLane): AutomationLaneView {
    const range = laneRange(
      lane.target.parameter,
      lane.target.min,
      lane.target.max,
    );
    const totalBars = this.totalBars();
    const samples = Math.max(2, Math.round(totalBars * SAMPLES_PER_BAR));
    let path = '';
    for (let i = 0; i <= samples; i++) {
      const time = (i / samples) * totalBars * 16;
      const value = this.automation.getValueAtTime(lane.id, time);
      if (value === null) {
        path = '';
        break;
      }
      const x = this.timeToX(time);
      const y = this.valueToY(value, range);
      path += `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)} `;
    }
    const points = lane.points.map((point, index) => ({
      x: this.timeToX(point.time),
      y: this.valueToY(point.value, range),
      index,
    }));
    return { lane, range, path: path.trim(), points };
  }

  private clampTime(time: number): number {
    if (!Number.isFinite(time)) return 0;
    return Math.max(0, Math.min(this.totalBars() * 16, time));
  }
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}
