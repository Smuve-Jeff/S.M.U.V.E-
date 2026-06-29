import {
  Component,
  Input,
  Output,
  EventEmitter,
  HostListener,
  signal,
  OnChanges,
  OnInit,
  computed
} from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-knob',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div
      class="knob-wrapper"
      (mousedown)="startDrag($event)"
      (touchstart)="startDrag($event)"
    >
      <div class="knob-label" *ngIf="label">{{ label }}</div>
      <div class="knob-outer shadow-v42-xl">
        <div
          class="knob-face"
          [style.transform]="'rotate(' + rotation() + 'deg)'"
        >
          <div class="knob-indicator"></div>
          <div class="knob-center-cap"></div>
        </div>
        <svg class="knob-ring-svg absolute inset-[-4px]" viewBox="0 0 72 72">
          <circle class="ring-bg" cx="36" cy="36" r="32" />
          <circle class="ring-fill" cx="36" cy="36" r="32"
                  [style.stroke-dasharray]="dashArray()"
                  [style.stroke]="ringColor()" />
        </svg>
      </div>
      <div class="knob-value" *ngIf="showValue">{{ displayValue() }}</div>
    </div>
  `,
  styles: [
    `
      :host {
        display: inline-block;
      }
      .knob-wrapper {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 6px;
        user-select: none;
        touch-action: none;
        position: relative;
      }
      .knob-outer {
        width: 64px;
        height: 64px;
        position: relative;
        cursor: ns-resize;
      }
      .knob-face {
        width: 100%;
        height: 100%;
        border-radius: 50%;
        background: radial-gradient(circle at 30% 30%, #444 0%, #222 50%, #111 100%);
        border: 2px solid rgba(255, 255, 255, 0.05);
        position: relative;
        z-index: 2;
        box-shadow:
          0 4px 10px rgba(0, 0, 0, 0.5),
          inset 0 1px 1px rgba(255, 255, 255, 0.1);
        transition: border-color 0.2s;
      }
      .knob-outer:hover .knob-face {
        border-color: rgba(0, 229, 255, 0.4);
      }
      .knob-indicator {
        width: 3px;
        height: 10px;
        background: #00e5ff;
        position: absolute;
        top: 6px;
        left: 50%;
        transform: translateX(-50%);
        border-radius: 2px;
        box-shadow: 0 0 10px #00e5ff, 0 0 20px rgba(0, 229, 255, 0.4);
      }
      .knob-center-cap {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: 12px;
        height: 12px;
        border-radius: 50%;
        background: #111;
        border: 2px solid #000;
      }
      .knob-ring-svg {
        width: calc(100% + 8px);
        height: calc(100% + 8px);
        transform: rotate(135deg);
        pointer-events: none;
      }
      .ring-bg {
        fill: none;
        stroke: rgba(255, 255, 255, 0.05);
        stroke-width: 3;
      }
      .ring-fill {
        fill: none;
        stroke-width: 3;
        stroke-linecap: round;
        transition: stroke-dasharray 0.1s ease, stroke 0.3s ease;
      }
      .knob-label {
        font-size: 8px;
        font-weight: 900;
        color: #7a7a9a;
        text-transform: uppercase;
        letter-spacing: 0.15em;
        text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
      }
      .knob-value {
        font-family: 'Geist Mono', monospace;
        font-size: 9px;
        font-weight: 700;
        color: #00e5ff;
        background: rgba(0, 0, 0, 0.4);
        padding: 2px 6px;
        border-radius: 4px;
        min-width: 40px;
        text-align: center;
        border: 1px solid rgba(0, 229, 255, 0.1);
      }
      @media (max-width: 1024px) {
        .knob-outer {
          width: 72px;
          height: 72px;
        }
        .knob-label {
          font-size: 10px;
        }
      }
    `,
  ],
})
export class KnobComponent implements OnInit, OnChanges {
  @Input() label = '';
  @Input() min = 0;
  @Input() max = 100;
  @Input() step = 1;
  @Input() value = 0;
  @Input() defaultValue = 0;
  @Input() showValue = true;
  @Input() unit = '';

  @Output() valueChange = new EventEmitter<number>();

  rotation = signal(-135);
  displayValue = signal('0');

  percent = computed(() => {
    const range = this.max - this.min;
    return range === 0 ? 0.5 : (this.value - this.min) / range;
  });

  dashArray = computed(() => {
    const circumference = 2 * Math.PI * 32;
    const fill = (this.percent() * 270 / 360) * circumference;
    return `${fill} ${circumference}`;
  });

  ringColor = computed(() => {
    const p = this.percent();
    if (p > 0.8) return '#ff4d4d'; // Warning
    if (p > 0.5) return '#ec5b13'; // Active
    return '#00e5ff'; // Normal
  });

  private isDragging = false;
  private startY = 0;
  private startValue = 0;

  ngOnInit() {
    this.updateFromValue(this.value);
  }

  ngOnChanges() {
    if (!this.isDragging) {
      this.updateFromValue(this.value);
    }
  }

  startDrag(event: MouseEvent | TouchEvent) {
    this.isDragging = true;
    this.startY =
      event instanceof MouseEvent ? event.clientY : (event as TouchEvent).touches[0].clientY;
    this.startValue = this.value;
  }

  @HostListener('window:mousemove', ['$event'])
  @HostListener('window:touchmove', ['$event'])
  onDrag(event: MouseEvent | TouchEvent) {
    if (!this.isDragging) return;

    const currentY =
      event instanceof MouseEvent ? event.clientY : (event as TouchEvent).touches[0].clientY;
    const deltaY = this.startY - currentY;
    const range = this.max - this.min;
    const isMobile = typeof window !== "undefined" && window.innerWidth <= 1024;
    const sensitivity = isMobile ? 350 : 200;

    const isFine = (event instanceof MouseEvent && event.shiftKey) || (event instanceof TouchEvent && event.touches.length > 1);
    const finalSensitivity = isFine ? sensitivity * 5 : sensitivity;
    let newValue = this.startValue + (deltaY / finalSensitivity) * range;
    newValue = Math.max(this.min, Math.min(this.max, newValue));
    newValue = Math.round(newValue / this.step) * this.step;

    if (newValue !== this.value) {
      this.value = newValue;
      this.updateFromValue(newValue);
      this.valueChange.emit(newValue);
    }
  }

  @HostListener('window:mouseup')
  @HostListener('window:touchend')
  stopDrag() {
    this.isDragging = false;
  }

  private updateFromValue(val: number) {
    const range = this.max - this.min;
    const p = range === 0 ? 0.5 : (val - this.min) / range;
    const rot = -135 + p * 270;
    this.rotation.set(rot);

    const formatted = val % 1 === 0 ? val.toString() : val.toFixed(1);
    this.displayValue.set(formatted + this.unit);
  }

  }
}
