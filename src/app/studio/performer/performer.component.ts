import { Component, inject, signal, computed, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
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

@Component({
  selector: 'app-performer',
  standalone: true,
  imports: [CommonModule, FormsModule, KnobComponent, PerformanceGridComponent],
  templateUrl: './performer.component.html',
  styleUrls: ['./performer.component.css'],
})
export class PerformerComponent implements OnDestroy {
  public readonly audioSession = inject(AudioSessionService);
  public readonly musicManager = inject(MusicManagerService);
  public readonly liveEngine = inject(LiveEngineService);
  private readonly haptic = inject(HapticService);
  private readonly instrumentsService = inject(InstrumentsService);

  layout = signal<'keyboard' | 'pads' | 'matrix'>('keyboard');
  scenes = this.musicManager.performerScenes;
  smartChords = signal(false);
  velocity = 0.8;
  octave = signal(0);
  activeKeys = signal<Set<number>>(new Set());
  availableInstruments = signal<InstrumentPreset[]>([]);
  activeInstrumentId = this.liveEngine.activeInstrument;
  pitchBend = signal(0);
  selectedTrack = computed(() => this.musicManager.tracks().find(t => t.id === this.musicManager.selectedTrackId()));
  modWheel = signal(0);
  spectrumData = signal<number[]>(new Array(64).fill(0));
  performanceLog = signal<string[]>([]);
  private visualizerFrame: number | null = null;

  private readonly activePointers = new Map<number, number>();

  keyboardKeys = this.generateKeyboardKeys();
  performerPads = this.generatePads();

  constructor() {
    this.availableInstruments.set(this.instrumentsService.getPresets());
    this.startVisualizer();
  }

  ngOnDestroy() {
    if (this.visualizerFrame) cancelAnimationFrame(this.visualizerFrame);
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
    const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    for (let i = 0; i < 25; i++) {
      const midi = 48 + i;
      keys.push({
        midi,
        name: "" + names[midi % 12] + (Math.floor(midi / 12) - 1),
      });
    }
    return keys;
  }

  generatePads() {
    const pads = [];
    const colors = ['#f43f5e', '#ec4899', '#d946ef', '#a855f7', '#8b5cf6', '#6366f1', '#3b82f6', '#0ea5e9'];
    for (let i = 0; i < 16; i++) {
      pads.push({
        midi: 36 + i,
        name: 'Pad ' + (i + 1),
        color: colors[i % colors.length],
      });
    }
    return pads;
  }

  isBlackKey(midi: number): boolean { return [1, 3, 6, 8, 10].includes(midi % 12); }
  isKeyPressed(midi: number): boolean { return this.activeKeys().has(midi); }

  setLayout(mode: 'keyboard' | 'pads' | 'matrix') { this.layout.set(mode); }
  toggleSmartChords() { this.smartChords.update((value) => !value); this.liveEngine.smartChords.set(this.smartChords()); }
  nudgeOctave(delta: number) { this.octave.update((value) => Math.min(2, Math.max(-2, value + delta))); }

  updateTrackVolume(val: number) {
    const trackId = this.musicManager.selectedTrackId();
    if (trackId !== null) {
      this.musicManager.tracks.update(ts => ts.map(t => t.id === trackId ? { ...t, gain: val / 100 } : t));
      this.musicManager.engine.updateTrack(trackId, { gain: val / 100 });
    }
  }

  updateTrackPan(val: number) {
    const trackId = this.musicManager.selectedTrackId();
    if (trackId !== null) {
      this.musicManager.tracks.update(ts => ts.map(t => t.id === trackId ? { ...t, pan: val / 100 } : t));
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
    await this.liveEngine.initialize();
    const actualMidi = midi + this.octave() * 12;
    this.liveEngine.triggerNoteStart(actualMidi, this.velocity);
    this.haptic.light();

    if (this.audioSession.isRecording()) {
      this.musicManager.recordLiveNote(actualMidi, this.velocity);
    }

    this.activeKeys.update((keys) => {
      const next = new Set(keys);
      next.add(midi);
      return next;
    });
    this.performanceLog.update(log => [this.liveEngine.midiToNote(actualMidi), ...log.slice(0, 9)]);
  }

  onPadPointerDown(event: PointerEvent, midi: number) {
    event.preventDefault();
    event.stopPropagation();
    this.onKeyDown(midi, event);
  }

  onPadPointerEnter(event: PointerEvent, midi: number) {
    if (event.buttons > 0) {
      this.onKeyDown(midi, event);
    }
  }

  onPadPointerLeave(event: PointerEvent, midi: number) {
    if (event.buttons > 0) {
      this.onKeyUp(midi, event);
    }
  }

  onKeyUp(midi: number, event?: PointerEvent) {
    const actualMidi = midi + this.octave() * 12;
    this.liveEngine.triggerNoteEnd(actualMidi);
    if (event?.pointerType === 'touch') {
      this.activePointers.delete(event.pointerId);
    }
    this.activeKeys.update((keys) => {
      const next = new Set(keys);
      next.delete(midi);
      return next;
    });
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

  stopPerformance() {
    this.liveEngine.stopAllNotes();
    this.activeKeys.set(new Set());
    this.performanceLog.update((log) => ['PANIC', ...log.slice(0, 8)]);
    this.haptic.heavy();
  }

  isSceneActive(scene: PerformerScene): boolean {
    return this.musicManager.activeSceneId() === scene.id;
  }
}
