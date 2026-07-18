import { Component, Input, Output, EventEmitter, HostBinding } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-sound-pad',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './sound-pad.component.html',
  styleUrls: ['./sound-pad.component.css'],
})
export class SoundPadComponent {
  @Input() name: string = '';
  @Input() active: boolean = false;
  /**
   * Optional per-pad tint — applied as --pad-color CSS variable so
   * the surrounding grid can color each pad independently while
   * this component stays color-agnostic.
   */
  @Input() color: string = '#00E5FF';
  @Output() padTriggered = new EventEmitter<void>();

  triggerPad() {
    this.padTriggered.emit();
  }
}
