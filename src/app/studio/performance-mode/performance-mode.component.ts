import {
  Component,
  Input,
  Output,
  EventEmitter,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { HapticService } from '../../services/haptic.service';

export interface PerformancePad {
  id: number;
  name: string;
  type: 'loop' | 'one-shot';
  isPlaying: boolean;
}

@Component({
  selector: 'app-performance-mode',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './performance-mode.component.html',
  styleUrls: ['./performance-mode.component.css'],
})
export class PerformanceModeComponent {
  private haptic = inject(HapticService);

  @Input() pads: PerformancePad[] = [];
  @Output() padClicked = new EventEmitter<PerformancePad>();

  activeVelocity = signal(0.85);
  longPressPadId = signal<number | null>(null);
  private longPressTimer: any = null;
  private readonly LONG_PRESS_MS = 500;

  triggerPad(pad: PerformancePad, event?: MouseEvent | TouchEvent): void {
    if (this.longPressPadId() === pad.id) return;
    this.haptic.medium();
    this.padClicked.emit(pad);
  }

  onPointerDown(pad: PerformancePad, event: PointerEvent): void {
    event.preventDefault();
    this.longPressPadId.set(null);
    this.longPressTimer = setTimeout(() => {
      this.haptic.heavy();
      this.longPressPadId.set(pad.id);
    }, this.LONG_PRESS_MS);
  }

  onPointerUp(pad: PerformancePad, event: PointerEvent): void {
    event.preventDefault();
    if (this.longPressTimer) {
      clearTimeout(this.longPressTimer);
      this.longPressTimer = null;
    }
    if (this.longPressPadId() === pad.id) return;
    this.triggerPad(pad);
  }

  onContextMenu(pad: PerformancePad): void {
    this.longPressPadId.set(this.longPressPadId() === pad.id ? null : pad.id);
  }

  dismissLongPress(): void {
    this.longPressPadId.set(null);
  }

  setVelocity(value: number): void {
    this.activeVelocity.set(value);
  }

  trackByPad = (_i: number, p: PerformancePad) => p.id;
}
