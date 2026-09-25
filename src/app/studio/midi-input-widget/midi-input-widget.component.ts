import { Component, inject, signal, computed, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HardwareService } from '../../services/hardware.service';
import { MusicManagerService } from '../../services/music-manager.service';

interface MidiDevice {
  id: string;
  name: string;
  manufacturer: string;
}

@Component({
  selector: 'app-midi-input-widget',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="midi-widget" *ngIf="hasDevices()">
      <div class="midi-widget-header">
        <span class="material-symbols-outlined">piano</span>
        <span class="midi-widget-title">MIDI IN</span>
        <span class="midi-widget-dot" [class.midi-active]="lastNote() !== null"></span>
      </div>

      <div class="midi-widget-list" *ngIf="devices().length > 0">
        <div
          *ngFor="let dev of devices()"
          class="midi-device-item"
          [class.midi-device-active]="activeDeviceId() === dev.id"
        >
          <span class="material-symbols-outlined">keyboard</span>
          <span class="midi-device-name">{{ dev.name }}</span>
        </div>
      </div>

      <div class="midi-widget-empty" *ngIf="devices().length === 0">
        <span class="midi-empty-text">No MIDI devices</span>
      </div>

      <div class="midi-note-display" *ngIf="lastNote() !== null">
        <span class="midi-note-value">{{ lastNoteLabel() }}</span>
        <span class="midi-note-vel">vel {{ lastVelocity() }}</span>
      </div>
    </div>
  `,
  styleUrls: ['./midi-input-widget.component.css'],
})
export class MidiInputWidgetComponent implements OnDestroy {
  private hardware = inject(HardwareService);
  private musicManager = inject(MusicManagerService);

  devices = this.hardware.midiInputs;
  activeDeviceId = signal<string | null>(null);
  lastNote = signal<number | null>(null);
  lastVelocity = signal<number>(0);

  hasDevices = computed(() => this.devices().length > 0);

  /** Convert MIDI note number to human-readable label */
  lastNoteLabel = computed(() => {
    const n = this.lastNote();
    if (n === null) return '—';
    const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const octave = Math.floor(n / 12) - 1;
    return `${names[n % 12]}${octave}`;
  });

  /** Called by HardwareService when a MIDI note-on message arrives */
  onNoteOn(note: number, velocity: number): void {
    this.lastNote.set(note);
    this.lastVelocity.set(velocity);
    // Route to selected track's instrument
    this.musicManager.recordLiveNote(note, velocity);

    // Auto-clear the note display after 1.5s
    setTimeout(() => {
      if (this.lastNote() === note) {
        this.lastNote.set(null);
      }
    }, 1500);
  }

  ngOnDestroy(): void {
    // Cleanup handled by hardware service
  }
}
