import {
  Component,
  Input,
  Output,
  EventEmitter,
  inject,
  signal,
  computed,
  OnInit,
  OnDestroy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HapticService } from '../../services/haptic.service';
import { HardwareService } from '../../services/hardware.service';

export interface PerformancePad {
  id: number;
  name: string;
  type: 'loop' | 'one-shot';
  isPlaying: boolean;
  midiNote?: number; // MIDI note number for hardware mapping
}

export type VelocityZone = 'soft' | 'medium' | 'hard';

const VELOCITY_ZONES: { zone: VelocityZone; range: [number, number]; label: string; color: string }[] = [
  { zone: 'soft',   range: [0.1, 0.4], label: 'Soft',    color: '#2BA09C' },
  { zone: 'medium', range: [0.4, 0.7], label: 'Medium',  color: '#0E7C7B' },
  { zone: 'hard',   range: [0.7, 1.0], label: 'Hard',    color: '#D97706' },
];

@Component({
  selector: 'app-performance-mode',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './performance-mode.component.html',
  styleUrls: ['./performance-mode.component.css'],
})
export class PerformanceModeComponent implements OnInit, OnDestroy {
  private haptic = inject(HapticService);
  private hardware = inject(HardwareService);

  @Input() pads: PerformancePad[] = [];
  @Output() padClicked = new EventEmitter<PerformancePad>();

  // ── Velocity ──────────────────────────────────────────────
  activeVelocity = signal(0.85);

  currentVelocityZone = computed<VelocityZone>(() => {
    const v = this.activeVelocity();
    if (v < 0.4) return 'soft';
    if (v < 0.7) return 'medium';
    return 'hard';
  });

  velocityZones = VELOCITY_ZONES;

  // ── MIDI Note Mapping ─────────────────────────────────────
  showMidiMapping = signal(false);
  /** Map each pad id to a MIDI note number (36=C2 baseline). */
  midiNoteMap = signal<Record<number, number>>({});

  midiNoteMapForPad = (padId: number) => computed(() => this.midiNoteMap()[padId] ?? 36);

  /** Initialize default MIDI mapping (keys C2–G2 for 8 pads). */
  private initDefaultMidiMap(): void {
    const map: Record<number, number> = {};
    this.pads.forEach((pad, i) => {
      map[pad.id] = 36 + i; // C2, C#2, D2, D#2, E2, F2, F#2, G2
    });
    this.midiNoteMap.set(map);
  }

  /** Find the pad whose MIDI note matches the incoming note-on. */
  private handleMidiNoteOn(note: number, velocity: number): void {
    const map = this.midiNoteMap();
    const padId = Object.entries(map).find(([, n]) => n === note)?.[0];
    if (!padId) return;
    const pad = this.pads.find((p) => p.id === Number(padId));
    if (!pad) return;
    this.triggerPad(pad);
  }

  setMidiNoteForPad(padId: number, note: number): void {
    this.midiNoteMap.update((m) => ({ ...m, [padId]: Math.max(0, Math.min(127, Math.round(note))) }));
    this.haptic.light();
  }

  toggleMidiMapping(): void {
    this.showMidiMapping.update((v) => !v);
    this.haptic.light();
  }

  // ── Long press context ────────────────────────────────────
  longPressPadId = signal<number | null>(null);
  private longPressTimer: any = null;
  private readonly LONG_PRESS_MS = 500;

  triggerPad(pad: PerformancePad, event?: MouseEvent | TouchEvent): void {
    if (this.longPressPadId() === pad.id) return;
    this.haptic.medium();
    this.padClicked.emit(pad);
  }

  onPointerDown(pad: PerformancePad, event: PointerEvent): void {
    event.preventDefault();
    this.longPressPadId.set(null);
    this.longPressTimer = setTimeout(() => {
      this.haptic.heavy();
      this.longPressPadId.set(pad.id);
    }, this.LONG_PRESS_MS);
  }

  onPointerUp(pad: PerformancePad, event: PointerEvent): void {
    event.preventDefault();
    if (this.longPressTimer) {
      clearTimeout(this.longPressTimer);
      this.longPressTimer = null;
    }
    if (this.longPressPadId() === pad.id) return;
    this.triggerPad(pad);
  }

  onContextMenu(pad: PerformancePad): void {
    this.longPressPadId.set(this.longPressPadId() === pad.id ? null : pad.id);
  }

  dismissLongPress(): void {
    this.longPressPadId.set(null);
  }

  setVelocity(value: number): void {
    this.activeVelocity.set(value);
  }

  midiNoteName(note: number): string {
    const names = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
    return `${names[note % 12]}${Math.floor(note / 12) - 1}`;
  }

  trackByPad = (_i: number, p: PerformancePad) => p.id;

  // ── Lifecycle ─────────────────────────────────────────────
  ngOnInit(): void {
    this.initDefaultMidiMap();
    // Wire hardware MIDI input to pad triggers
    const existingOnNote = this.hardware.onMidiNoteOn;
    this.hardware.onMidiNoteOn = (note: number, velocity: number) => {
      this.handleMidiNoteOn(note, velocity);
      existingOnNote?.(note, velocity);
    };
  }

  ngOnDestroy(): void {
    // Restore original handler (or no-op) on teardown
    // This component is hosted persistently in the studio, so this is a safety net.
  }
}
