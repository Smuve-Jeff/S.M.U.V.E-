import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { InstrumentService } from '../../services/instrument.service';

@Component({
  selector: 'app-midi-device-manager',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './midi-device-manager.component.html',
  styleUrls: ['./midi-device-manager.component.css'],
})
export class MidiDeviceManagerComponent {
  readonly instrumentService = inject(InstrumentService);
  availableDevices = this.instrumentService.midiInputs;

  connectDevice(event: Event) {
    const selectElement = event.target as HTMLSelectElement;
    const deviceId = selectElement.value;
    if (deviceId) {
      this.instrumentService.connectToMidiDevice(deviceId);
    }
  }
}
