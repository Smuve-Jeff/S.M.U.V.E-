import {
  ChangeDetectionStrategy,
  Component,
  Input,
} from '@angular/core';
import { CommonModule } from '@angular/common';

export type StudioMeterState = 'normal' | 'warning' | 'clip' | 'muted';

@Component({
  selector: 'app-studio-meter',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './studio-meter.component.html',
  styleUrl: './studio-meter.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StudioMeterComponent {
  @Input() label = '';
  @Input() level = 0;
  @Input() peak = 0;
  @Input() state: StudioMeterState = 'normal';
  @Input() vertical = true;
  @Input() unit = 'dB';

  normalized(value: number): number {
    return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  }

  displayValue(): string {
    if (this.unit === '%') return `${Math.round(this.normalized(this.level) * 100)}%`;
    const db = this.level <= 0 ? -60 : 20 * Math.log10(this.normalized(this.level));
    return `${Math.round(db)} dB`;
  }
}
