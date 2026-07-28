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
  styles: [`
    .midi-widget {
      background: var(--ivory-panel, #14192e);
      border: 1px solid var(--ivory-line, rgba(180,200,255,0.08));
      border-radius: 8px;
      padding: 10px 12px;
      margin: 6px 0;
      font-family: var(--font-sans);
      color: var(--text-main, #e0e4f0);
      font-size: 12px;
    }
    .midi-widget-header {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-bottom: 8px;
    }
    .midi-widget-header .material-symbols-outlined {
      font-size: 18px;
      color: var(--teal-300, #5dc4c2);
    }
    .midi-widget-title {
      font-weight: 600;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--text-dim, #7e7259);
    }
    .midi-widget-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #555;
      margin-left: auto;
      transition: background 0.15s;
    }
    .midi-widget-dot.midi-active {
      background: #0E7C7B;
      box-shadow: 0 0 6px rgba(14,124,123,0.7);
    }
    .midi-widget-list {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .midi-device-item {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 4px 6px;
      border-radius: 4px;
      background: rgba(255,255,255,0.03);
      cursor: default;
    }
    .midi-device-item .material-symbols-outlined {
      font-size: 16px;
      opacity: 0.6;
    }
    .midi-device-active {
      background: rgba(14,124,123,0.15);
      border-left: 2px solid #0E7C7B;
    }
    .midi-device-name {
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .midi-widget-empty {
      padding: 6px;
      opacity: 0.4;
    }
    .midi-empty-text {
      font-style: italic;
    }
    .midi-note-display {
      margin-top: 8px;
      padding: 6px 8px;
      background: rgba(14,124,123,0.1);
      border-radius: 4px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .midi-note-value {
      font-weight: 700;
      font-size: 14px;
      color: var(--teal-300, #5dc4c2);
    }
    .midi-note-vel {
      font-size: 10px;
      opacity: 0.6;
    }
  `],
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
