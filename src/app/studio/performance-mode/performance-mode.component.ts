import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';

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
  @Input() pads: PerformancePad[] = [];
  @Output() padClicked = new EventEmitter<PerformancePad>();
}
