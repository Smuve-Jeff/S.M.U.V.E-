import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-sound-pad',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './sound-pad.component.html',
  styleUrls: ['./sound-pad.component.css']
})
export class SoundPadComponent {
  @Input() name: string = '';
  @Input() active: boolean = false;
  @Output() padTriggered = new EventEmitter<void>();

  triggerPad() {
    this.padTriggered.emit();
  }
}
