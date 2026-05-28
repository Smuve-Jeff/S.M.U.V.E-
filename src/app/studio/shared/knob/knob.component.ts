import { Component, Input, Output, EventEmitter, ElementRef, ViewChild, HostListener, signal } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-knob',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="knob-wrapper" #knobWrapper (mousedown)="startDrag($event)" (touchstart)="startDrag($event)">
      <div class="knob-label" *ngIf="label">{{ label }}</div>
      <div class="knob-outer" [style.transform]="'rotate(' + rotation() + 'deg)'">
        <div class="knob-indicator"></div>
      </div>
      <div class="knob-value" *ngIf="showValue">{{ displayValue() }}</div>
    </div>
  `,
  styles: [`
    :host { display: inline-block; }
    .knob-wrapper {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 4px;
      user-select: none;
      touch-action: none;
    }
    .knob-outer {
      width: 44px;
      height: 44px;
      border-radius: 50%;
      background: rgba(255, 255, 255, 0.05);
      border: 2px solid rgba(255, 255, 255, 0.1);
      position: relative;
      cursor: ns-resize;
      box-shadow: inset 0 2px 4px rgba(0,0,0,0.5), 0 2px 10px rgba(0,0,0,0.3);
      transition: border-color 0.2s;
    }
    .knob-outer:hover {
      border-color: #ec5b13;
    }
    .knob-indicator {
      width: 4px;
      height: 12px;
      background: #ec5b13;
      position: absolute;
      top: 4px;
      left: 50%;
      transform: translateX(-50%);
      border-radius: 2px;
      box-shadow: 0 0 8px #ec5b13;
    }
    .knob-label {
      font-size: 8px;
      font-weight: 800;
      color: #7a7a9a;
      text-transform: uppercase;
      letter-spacing: 0.1em;
    }
    .knob-value {
      font-family: 'Geist Mono', monospace;
      font-size: 9px;
      color: #ec5b13;
    }
  `]
})
export class KnobComponent {
  @Input() label = '';
  @Input() min = 0;
  @Input() max = 100;
  @Input() step = 1;
  @Input() value = 0;
  @Input() showValue = true;
  @Input() unit = '';

  @Output() valueChange = new EventEmitter<number>();

  rotation = signal(-135);
  displayValue = signal('0');

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
    this.startY = event instanceof MouseEvent ? event.clientY : event.touches[0].clientY;
    this.startValue = this.value;

    // Prevent scrolling on mobile
    if (event instanceof TouchEvent) {
      // event.preventDefault(); // Might cause issues in some browsers
    }
  }

  @HostListener('window:mousemove', ['$event'])
  @HostListener('window:touchmove', ['$event'])
  onDrag(event: MouseEvent | TouchEvent) {
    if (!this.isDragging) return;

    const currentY = event instanceof MouseEvent ? event.clientY : event.touches[0].clientY;
    const deltaY = this.startY - currentY;
    const range = this.max - this.min;
    const sensitivity = 200; // Pixels to go from min to max

    let newValue = this.startValue + (deltaY / sensitivity) * range;
    newValue = Math.max(this.min, Math.min(this.max, newValue));

    // Round to step
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
    const percent = (val - this.min) / (this.max - this.min);
    // Range from -135 to 135 degrees
    const rot = -135 + (percent * 270);
    this.rotation.set(rot);

    // Format display value
    const formatted = val % 1 === 0 ? val.toString() : val.toFixed(2);
    this.displayValue.set(formatted + this.unit);
  }
}
