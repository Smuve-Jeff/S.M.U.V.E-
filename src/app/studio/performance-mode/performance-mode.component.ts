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

  /** Sustain pedal state (CC64) surfaced from the hardware layer. */
  readonly sustainActive = this.hardware.sustainActive;
  /** Half-pedal state (CC68 < 64 while held) surfaced from the hardware layer. */
  readonly sustainHalfPedal = this.hardware.sustainHalfPedal;
  /** Continuous pedal position 0-127 (CC68) surfaced from the hardware layer. */
  readonly sustainAmount = this.hardware.sustainAmount;

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

  // ── Pressure-sensitive pads ───────────────────────────────
  /** Current touch pressure (0..1 from PointerEvent.pressure) */
  activePressure = signal(0);
  /** Pad id currently being pressed */
  pressedPadId = signal<number | null>(null);

  /** Combined velocity = base slider velocity modulated by pressure */
  effectiveVelocity = computed(() => {
    const base = this.activeVelocity();
    const pressure = this.activePressure();
    // If pressure is available, modulate velocity by it
    if (pressure > 0) {
      // Pressure 0.5 = base velocity, <0.5 = softer, >0.5 = harder
      return Math.max(0.1, Math.min(1.0, base * (0.5 + pressure)));
    }
    return base;
  });

  // ── MIDI Learn Mode ──────────────────────────────────────
  isLearnMode = signal(false);
  /** Pad id we're currently trying to assign a MIDI note to via learn */
  selectedLearnPadId = signal<number | null>(null);
  private learnTimeout: ReturnType<typeof setTimeout> | null = null;
  private readonly LEARN_TIMEOUT_MS = 15000;

  /** Start MIDI learn mode for a specific pad. Next MIDI note-on auto-assigns. */
  startLearnMode(padId: number): void {
    this.isLearnMode.set(true);
    this.selectedLearnPadId.set(padId);
    this.haptic.medium();

    // Auto-cancel after timeout
    if (this.learnTimeout) clearTimeout(this.learnTimeout);
    this.learnTimeout = setTimeout(() => {
      this.cancelLearnMode();
    }, this.LEARN_TIMEOUT_MS);
  }

  cancelLearnMode(): void {
    this.isLearnMode.set(false);
    this.selectedLearnPadId.set(null);
    if (this.learnTimeout) {
      clearTimeout(this.learnTimeout);
      this.learnTimeout = null;
    }
    this.haptic.light();
  }

  /** Returns true if the given pad is the one being learned */
  isPadLearning(padId: number): boolean {
    return this.isLearnMode() && this.selectedLearnPadId() === padId;
  }

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
    // ── MIDI Learn: capture the first MIDI note and assign to selected pad ──
    if (this.isLearnMode()) {
      const learnPadId = this.selectedLearnPadId();
      if (learnPadId !== null) {
        this.midiNoteMap.update((m) => ({
          ...m,
          [learnPadId]: Math.max(0, Math.min(127, Math.round(note))),
        }));
        this.haptic.heavy();
        this.cancelLearnMode();
        return;
      }
    }

    // ── Normal mode: find pad by mapped note ──
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
    this.pressedPadId.set(pad.id);
    try {
      (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    } catch {
      /* Pointer capture is unavailable in some test/webview implementations. */
    }

    // ── Pressure sensing ──
    // PointerEvent.pressure: 0 = no pressure, 0.5 = normal click,
    // 1.0 = full pressure. Touch screens report ~0.5 for normal touch.
    const pressure = event.pressure ?? 0.5;
    this.activePressure.set(Math.max(0, Math.min(1, pressure)));

    this.longPressPadId.set(null);
    this.longPressTimer = setTimeout(() => {
      this.haptic.heavy();
      this.longPressPadId.set(pad.id);
    }, this.LONG_PRESS_MS);
  }

  onPointerMove(pad: PerformancePad, event: PointerEvent): void {
    // Update pressure continuously during drag/touch
    if (this.pressedPadId() !== pad.id) return;
    const pressure = event.pressure ?? 0.5;
    this.activePressure.set(Math.max(0, Math.min(1, pressure)));
  }

  onPointerCancel(pad: PerformancePad): void {
    if (this.longPressTimer) {
      clearTimeout(this.longPressTimer);
      this.longPressTimer = null;
    }
    this.pressedPadId.set(null);
    this.activePressure.set(0);
    this.longPressPadId.set(null);
  }

  onPointerUp(pad: PerformancePad, event: PointerEvent): void {
    event.preventDefault();
    this.pressedPadId.set(null);
    this.activePressure.set(0);

    if (this.longPressTimer) {
      clearTimeout(this.longPressTimer);
      this.longPressTimer = null;
    }
    if (this.longPressPadId() === pad.id) return;
    this.triggerPad(pad);
  }

  onPadKeydown(pad: PerformancePad, event: KeyboardEvent): void {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
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
    if (this.learnTimeout) clearTimeout(this.learnTimeout);
    // This component is hosted persistently in the studio, so this is a safety net.
  }
}
