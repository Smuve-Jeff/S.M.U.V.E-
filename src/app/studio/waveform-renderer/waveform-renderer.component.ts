import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-waveform-renderer',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './waveform-renderer.component.html',
  styleUrls: ['./waveform-renderer.component.css'],
})
export class WaveformRendererComponent {
  @Input() waveform: number[] = new Array(128)
    .fill(0)
    .map(() => Math.random() * 0.2);
  @Input() isRecording = true;
  protected readonly Math = Math;
}
