import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-performance-mode',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './performance-mode.component.html',
  styleUrls: ['./performance-mode.component.css'],
})
export class PerformanceModeComponent {
  @Input() notes: any[] = [];
  @Output() noteClicked = new EventEmitter<any>();
}
