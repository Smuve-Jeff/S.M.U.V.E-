import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';

export interface RackChannel {
  id: string;
  name: string;
  steps: boolean[];
}

@Component({
  selector: 'app-channel-rack',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './channel-rack.component.html',
  styleUrls: ['./channel-rack.component.css']
})
export class ChannelRackComponent {
  steps = new Array(16).fill(false);

  channels = signal<RackChannel[]>([
    { id: '1', name: 'Kick', steps: [true, false, false, false, true, false, false, false, true, false, false, false, true, false, false, false] },
    { id: '2', name: 'Snare', steps: [false, false, false, false, true, false, false, false, false, false, false, false, true, false, false, false] },
    { id: '3', name: 'Hi-Hat', steps: [true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true] },
    { id: '4', name: 'Bass', steps: [true, false, true, false, false, false, false, false, true, false, true, false, false, false, false, false] },
    { id: '5', name: 'Lead Synth', steps: [false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false] }
  ]);

  toggleStep(channel: RackChannel, index: number) {
    channel.steps[index] = !channel.steps[index];
  }
}
