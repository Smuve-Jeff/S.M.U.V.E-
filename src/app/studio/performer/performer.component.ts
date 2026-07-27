import { Component, inject, signal, computed, OnDestroy, OnInit } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AudioSessionService } from '../audio-session.service';
import { KnobComponent } from '../shared/knob/knob.component';
import {
  MusicManagerService,
  PerformerScene,
} from '../../services/music-manager.service';
import { LiveEngineService } from '../../services/live-engine.service';
import { HapticService } from '../../services/haptic.service';
import {
  InstrumentsService,
  InstrumentPreset,
} from '../../services/instruments.service';
import { PerformanceGridComponent } from '../performance-grid/performance-grid.component';
import { PerformanceRecordingService } from '../performance-recording.service';
import { RecordingStatusService } from '../recording-status.service';
import { FxMacrosService } from '../../services/fx-macros.service';
import { DjMidiService } from '../../services/dj-midi.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-performer',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    KnobComponent,
    PerformanceGridComponent,
    DecimalPipe,
  ],
  templateUrl: './performer.component.html',
  styleUrls: ['./performer.component.css'],
})
export class PerformerComponent implements OnDestroy, OnInit {
  public readonly audioSession = inject(AudioSessionService);
  public readonly musicManager = inject(MusicManagerService);
  public readonly liveEngine = inject(LiveEngineService);
  public readonly perfRecording = inject(PerformanceRecordingService);
  private readonly recordingStatus = inject(RecordingStatusService);
  private readonly haptic = inject(HapticService);
  private readonly instrumentsService = inject(InstrumentsService);
  public readonly midiService = inject(DjMidiService);

  layout = signal<'keyboard' | 'pads' | 'matrix' | 'macros'>('keyboard');
  scenes = this.musicManager.performerScenes;
  smartChords = signal(false);
  velocity = 0.8;
  octave = signal(0);
  activeKeys = signal<Set<number>>(new Set());
  availableInstruments = signal<InstrumentPreset[]>([]);
  activeInstrumentId = this.liveEngine.activeInstrument;
  pitchBend = signal(0);
  selectedTrack = computed(() =>
    this.musicManager
      .tracks()
      .find((t) => t.id === this.musicManager.selectedTrackId())
  );
  modWheel = signal(0);
  spectrumData = signal<number[]>(new Array(64).fill(0));
  performanceLog = signal<string[]>([]);
  private visualizerFrame: number | null = null;

  private readonly activePointers = new Map<number, number>();

  /** FX Macros — one-finger XY control over master EQ + limiter + reverb. */
  public readonly fxMacros = inject(FxMacrosService);
  /** ptr<=>position while dragging. Null when not engaged. */
  private xyPointerId: number | null = null;

  /** MIDI subscriptions */
  private midiSubs = new Subscription();

  /** MIDI device picker panel visibility */
  midiPanelOpen = signal(false);
  /** MIDI mapping editor panel visibility */
  midiMappingEditorOpen = signal(false);
  /** MIDI activity log panel visibility */
  midiLogOpen = signal(false);
  /** Enabled device names (all enabled by default) */
  enabledDevices = signal<string[]>([]);

  keyboardKeys = this.generateKeyboardKeys();
  performerPads = this.generatePads();

  constructor() {
    this.availableInstruments.set(this.instrumentsService.getPresets());
    this.startVisualizer();
  }

  ngOnInit(): void {
    // Auto-init MIDI on performer mount
    this.midiService.autoInit();

    // Subscribe to MIDI note on → trigger performer keys
    this.midiSubs.add(
      this.midiService.performerNoteOn.subscribe((ev) => {
        const midiNote = ev.note;
        const vel = ev.velocity;
        this.liveEngine.initialize().then(() => {
          this.liveEngine.triggerNoteStart(midiNote + this.octave() * 12, vel);
          if (this.audioSession.isRecording()) {
            this.musicManager.recordLiveNote(midiNote, vel);
          }
          this.perfRecording.recordMidi(midiNote, vel);
          this.activeKeys.update((keys) => {
            const next = new Set(keys);
            next.add(midiNote);
            return next;
          });
        });
      })
    );

    // Subscribe to MIDI note off
    this.midiSubs.add(
      this.midiService.performerNoteOff.subscribe((ev) => {
        const midiNote = ev.note;
        this.liveEngine.triggerNoteEnd(midiNote + this.octave() * 12);
        this.activeKeys.update((keys) => {
          const next = new Set(keys);
          next.delete(midiNote);
          return next;
        });
      })
    );

    // Subscribe to MIDI CC → performer controls (uses performerCCMap for custom mappings)
    this.midiSubs.add(
      this.midiService.performerCC.subscribe((ev) => {
        // Check custom performer CC mappings first
        const customMap = this.midiService.performerCCMap().find(
          (m) => m.controller === ev.controller && m.channel === ev.channel
        );
        const target = customMap?.target ?? this.defaultCCTarget(ev.controller);
        this.applyCCTarget(target, ev.value);
      })
    );
  }

  ngOnDestroy() {
    if (this.visualizerFrame) cancelAnimationFrame(this.visualizerFrame);
    this.midiSubs.unsubscribe();
  }

  // ────────────────────────────────────────────────────────────────
  // Multi-take recording wiring
  // ────────────────────────────────────────────────────────────────
  toggleArm() {
    // Toggles armed → immediately starts capture so the user can dive in.
    // Pressing again while recording finalizes the take.
    if (this.perfRecording.isRecording()) {
      const track = this.selectedTrack();
      this.perfRecording
        .finishTake(track?.id, track?.name)
        .catch(() => undefined);
      this.haptic.medium();
      this.recordingStatus.clearRecordingSource();
      return;
    }
    if (!this.perfRecording.isArmed()) {
      this.perfRecording.arm();
      this.haptic.light();
      // Auto-start capture within a short delay so the artist can prepare.
      setTimeout(() => {
        const track = this.selectedTrack();
        this.perfRecording.startRecording(track?.id, track?.name);
        this.haptic.medium();
        this.recordingStatus.setRecordingSource({
          type: 'performer',
          takeNumber: this.perfRecording.armedTakeNumber(),
        });
      }, 120);
    } else {
      this.perfRecording.disarm();
    }
  }

  /** Convert dBFS (-60..0) to a 0-100 percentage for meter fills. */
  dbToPct(db: number): number {
    if (!isFinite(db) || db <= -60) return 0;
    if (db >= 0) return 100;
    // Map -60..0 → 0..100 with a perceptual curve
    const raw = ((db + 60) / 60) * 100;
    return Math.round(Math.max(0, Math.min(100, raw)));
  }

  /** Format a duration in ms as M:SS.s */
  formatTakeDuration(ms: number): string {
    if (!ms || !isFinite(ms)) return '0:00.0';
    const total = Math.floor(ms / 1000);
    const minutes = Math.floor(total / 60);
    const seconds = total % 60;
    const tenths = Math.floor((ms % 1000) / 100);
    return `${minutes}:${seconds.toString().padStart(2, '0')}.${tenths}`;
  }

  private startVisualizer() {
    const update = () => {
      const analyser = this.musicManager.engine.masterAnalyser;
      if (analyser) {
        const data = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(data);
        const downsampled = [];
        const step = Math.floor(data.length / 64);
        for (let i = 0; i < 64; i++) {
          downsampled.push(data[i * step] / 255);
        }
        this.spectrumData.set(downsampled);
      }
      this.visualizerFrame = requestAnimationFrame(update);
    };
    this.visualizerFrame = requestAnimationFrame(update);
  }

  generateKeyboardKeys() {
    const keys = [];
    const names = [
      'C',
      'C#',
      'D',
      'D#',
      'E',
      'F',
      'F#',
      'G',
      'G#',
      'A',
      'A#',
      'B',
    ];
    for (let i = 0; i < 25; i++) {
      const midi = 48 + i;
      keys.push({
        midi,
        name: '' + names[midi % 12] + (Math.floor(midi / 12) - 1),
      });
    }
    return keys;
  }

  generatePads() {
    const pads = [];
    const colors = [
      '#f43f5e',
      '#ec4899',
      '#d946ef',
      '#a855f7',
      '#8b5cf6',
      '#6366f1',
      '#3b82f6',
      '#0ea5e9',
    ];
    for (let i = 0; i < 16; i++) {
      pads.push({
        midi: 36 + i,
        name: 'Pad ' + (i + 1),
        color: colors[i % colors.length],
      });
    }
    return pads;
  }

  isBlackKey(midi: number): boolean {
    return [1, 3, 6, 8, 10].includes(midi % 12);
  }
  isKeyPressed(midi: number): boolean {
    return this.activeKeys().has(midi);
  }

  setLayout(mode: 'keyboard' | 'pads' | 'matrix' | 'macros') {
    this.layout.set(mode);
  }

  // ── FX Macros XY Pad handlers ─────────────────────────────────────

  onPadDown(event: PointerEvent, padEl: HTMLElement): void {
    event.preventDefault();
    padEl.setPointerCapture?.(event.pointerId);
    this.xyPointerId = event.pointerId;
    this.fxMacros.engage();
    this.updatePadXY(event, padEl);
  }

  onPadMove(event: PointerEvent, padEl: HTMLElement): void {
    if (this.xyPointerId !== event.pointerId) return;
    event.preventDefault();
    this.updatePadXY(event, padEl);
  }

  onPadUp(event: PointerEvent, padEl: HTMLElement): void {
    if (this.xyPointerId !== event.pointerId) return;
    padEl.releasePointerCapture?.(event.pointerId);
    this.xyPointerId = null;
    this.fxMacros.release();
  }

  private updatePadXY(event: PointerEvent, padEl: HTMLElement): void {
    const rect = padEl.getBoundingClientRect();
    const safeRect = { w: Math.max(1, rect.width), h: Math.max(1, rect.height) };
    const x = Math.max(0, Math.min(1, (event.clientX - rect.left) / safeRect.w));
    const yRaw = (event.clientY - rect.top) / safeRect.h;
    // Y on-screen = (clientY - top) / h → 0 at top, 1 at bottom.
    // Map to engine Y: top of pad = 1 (max), bottom = 0 (min). Invert.
    const y = 1 - Math.max(0, Math.min(1, yRaw));
    this.fxMacros.setXY(x, y);
  }
  toggleSmartChords() {
    this.smartChords.update((value) => !value);
    this.liveEngine.smartChords.set(this.smartChords());
  }
  nudgeOctave(delta: number) {
    this.octave.update((value) => Math.min(2, Math.max(-2, value + delta)));
  }

  updateTrackVolume(val: number) {
    const trackId = this.musicManager.selectedTrackId();
    if (trackId !== null) {
      this.musicManager.tracks.update((ts) =>
        ts.map((t) => (t.id === trackId ? { ...t, gain: val / 100 } : t))
      );
      this.musicManager.engine.updateTrack(trackId, { gain: val / 100 });
    }
  }

  updateTrackPan(val: number) {
    const trackId = this.musicManager.selectedTrackId();
    if (trackId !== null) {
      this.musicManager.tracks.update((ts) =>
        ts.map((t) => (t.id === trackId ? { ...t, pan: val / 100 } : t))
      );
      this.musicManager.engine.updateTrack(trackId, { pan: val / 100 });
    }
  }

  async setInstrument(presetId: string) {
    await this.liveEngine.initialize();
    await this.liveEngine.setInstrument(presetId);
    this.haptic.light();
  }

  async onKeyDown(midi: number, event?: PointerEvent) {
    if (event && event.pointerType === 'touch') {
      const prevMidi = this.activePointers.get(event.pointerId);
      if (prevMidi !== undefined && prevMidi !== midi) {
        this.onKeyUp(prevMidi, event);
      }
      this.activePointers.set(event.pointerId, midi);
    }
    // CRITICAL: Resume AudioContext if suspended (browser autoplay policy)
    if (this.liveEngine['audioEngine']?.ctx?.state === 'suspended') {
      this.liveEngine['audioEngine'].resume();
    }
    await this.liveEngine.initialize();
    const actualMidi = midi + this.octave() * 12;
    this.liveEngine.triggerNoteStart(actualMidi, this.velocity);
    this.haptic.light();

    if (this.audioSession.isRecording()) {
      this.musicManager.recordLiveNote(actualMidi, this.velocity);
    }

    // Tag MIDI to current take if we're capturing.
    this.perfRecording.recordMidi(actualMidi, this.velocity);

    this.activeKeys.update((keys) => {
      const next = new Set(keys);
      next.add(midi);
      return next;
    });
    this.performanceLog.update((log) => [
      this.liveEngine.midiToNote(actualMidi),
      ...log.slice(0, 9),
    ]);
  }

  onKeyUp(midi: number, event?: PointerEvent) {
    const actualMidi = midi + this.octave() * 12;
    // Always release note, even if AudioContext was suspended
    this.liveEngine.triggerNoteEnd(actualMidi);

    this.activeKeys.update((keys) => {
      const next = new Set(keys);
      next.delete(midi);
      return next;
    });
    // Release pointer tracking
    if (event && event.pointerType === 'touch') {
      this.activePointers.delete(event.pointerId);
    }
  }

  onPadPointerDown(event: PointerEvent, midi: number) {
    event.preventDefault();
    event.stopPropagation();
    this.onKeyDown(midi, event);
  }

  onPadPointerUp(event: PointerEvent, midi: number) {
    this.onKeyUp(midi, event);
  }

  onPitchBend(event: any) {
    const val = parseFloat(event.target.value);
    this.pitchBend.set(val);
    this.liveEngine.setPitchBend(val);
  }

  onModWheel(event: any) {
    const val = parseFloat(event.target.value);
    this.modWheel.set(val);
    this.liveEngine.setModWheel(val);
  }

  launchScene(scene: PerformerScene) {
    this.musicManager.launchScene(scene.id);
    this.haptic.medium();
  }

  isSceneActive(scene: PerformerScene): boolean {
    return this.musicManager.activeSceneId() === scene.id;
  }

  // ── MIDI CC routing helpers ──────────────────────────
  private defaultCCTarget(controller: number): string {
    switch (controller) {
      case 1: return 'modulation';
      case 7: return 'volume';
      case 10: return 'pan';
      default: return 'none';
    }
  }

  private applyCCTarget(target: string, value: number): void {
    switch (target) {
      case 'modulation': this.modWheel.set(value); this.liveEngine.setModWheel(value); break;
      case 'volume': this.updateTrackVolume(value * 100); break;
      case 'pan': this.updateTrackPan((value - 0.5) * 200); break;
    }
  }

  // ── MIDI Learn ────────────────────────────────────────
  startLearn(target: string): void {
    this.haptic.light();
    this.midiService.startPerformerLearn(target);
  }

  cancelLearn(): void {
    this.midiService.cancelPerformerLearn();
  }

  getCCMappingLabel(target: string): string {
    const mapping = this.midiService.performerCCMap().find((m) => m.target === target);
    return mapping ? `CH${mapping.channel} CC${mapping.controller}` : '—';
  }

  // ── MIDI mapping editor ───────────────────────────────
  toggleMappingEditor(): void {
    this.midiMappingEditorOpen.update((v) => !v);
  }

  deletePerformerMapping(target: string): void {
    this.midiService.performerCCMap.update((m) => m.filter((x) => x.target !== target));
    // Persist immediately
    if ((this.midiService as any).savePerformerCCMappings) {
      (this.midiService as any).savePerformerCCMappings();
    }
  }

  clearAllPerformerMappings(): void {
    this.midiService.performerCCMap.set([]);
    if ((this.midiService as any).savePerformerCCMappings) {
      (this.midiService as any).savePerformerCCMappings();
    }
  }

  /** MIDI log helper */
  logTypeIcon(type: string): string {
    switch (type) {
      case 'note_on': return '♪';
      case 'note_off': return '♩';
      case 'cc': return '🎛';
      case 'clock': return '⏱';
      case 'start': return '▶';
      case 'stop': return '⏹';
      case 'continue': return '⏩';
      default: return '•';
    }
  }

  /** MIDI clock controls */
  toggleClock(): void {
    if (this.midiService.clockEnabled()) {
      this.midiService.stopClock();
    } else {
      this.midiService.startClock();
    }
  }

  // ── MIDI device picker ────────────────────────────────
  toggleMidiPanel(): void {
    this.midiPanelOpen.update((v) => !v);
  }

  isDeviceEnabled(name: string): boolean {
    if (this.enabledDevices().length === 0) return true;
    return this.enabledDevices().includes(name);
  }

  toggleDevice(name: string): void {
    this.enabledDevices.update((list) => {
      if (list.includes(name)) return list.filter((d) => d !== name);
      return [...list, name];
    });
  }
}
