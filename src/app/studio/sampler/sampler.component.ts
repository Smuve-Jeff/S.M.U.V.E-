import {
  Component,
  inject,
  signal,
  computed,
  AfterViewInit,
  OnDestroy,
  ViewChild,
  ElementRef,
  effect,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Sampler, SampleZone } from '../sampler';
import { AudioSessionService } from '../audio-session.service';
import { AudioEngineService } from '../../services/audio-engine.service';
import { FileLoaderService } from '../../services/file-loader.service';
import { HapticService } from '../../services/haptic.service';
import { WaveformRendererComponent } from '../waveform-renderer/waveform-renderer.component';


interface SamplerZoneUI {
  pitch: number;
  noteName: string;
  sampleCount: number;
  outputChannel: number;
  roundRobin: boolean;
  attack: number;
  decay: number;
  sustain: number;
  release: number;
  loopStart: number;
  loopEnd: number;
  loopEnabled: boolean;
}

const NOTE_NAMES = [
  'C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'
];

@Component({
  selector: 'app-sampler',
  standalone: true,
  imports: [CommonModule, FormsModule, WaveformRendererComponent],
  templateUrl: './sampler.component.html',
  styleUrls: ['./sampler.component.css'],
  // KnobComponent available for future ADSR knob UI
})
export class SamplerComponent implements AfterViewInit, OnDestroy {
  public audioSession = inject(AudioSessionService);
  public audioEngine = inject(AudioEngineService);
  private fileLoader = inject(FileLoaderService);
  private haptic = inject(HapticService);

  @ViewChild('dropZone') dropZoneRef!: ElementRef<HTMLDivElement>;

  private sampler: Sampler | null = null;

  // ── UI State ─────────────────────────────────────────
  zones = signal<SamplerZoneUI[]>([]);
  selectedPitch = signal<number | null>(null);
  selectedZone = computed(() => {
    const pitch = this.selectedPitch();
    if (pitch === null) return null;
    return this.zones().find((z) => z.pitch === pitch) || null;
  });

  masterVolume = signal(80);
  pitchBend = signal(0);
  modulation = signal(0);
  isImporting = signal(false);
  dragOver = signal(false);
  activeTab = signal<'zones' | 'adsr' | 'loops' | 'routing'>('zones');

  // Waveform data for the selected zone
  waveformData = signal<Float32Array | null>(null);
  waveformDuration = signal(0);

  // Output channel names
  outputChannels = ['Master', 'Ch 1', 'Ch 2', 'Ch 3', 'Ch 4', 'Ch 5', 'Ch 6', 'Ch 7'];

  // ── ADSR SVG calculation helpers ─────────────────────
  adsrSvgPoints = computed(() => {
    const zone = this.selectedZone();
    if (!zone) return '';
    const total = zone.attack + zone.decay + 0.5 + zone.release;
    const ax = (zone.attack / total) * 180;
    const dx = (zone.decay / total) * 180;
    const sx = (0.5 / total) * 180;
    const rx = (zone.release / total) * 180;
    const sustainY = 50 - (zone.sustain * 35);
    return `10,50 ${10+ax},10 ${10+ax+dx},${sustainY} ${10+ax+dx+sx},${sustainY} ${10+ax+dx+sx+rx},50`;
  });

  // ── Initialization ───────────────────────────────────
  constructor() {
    effect(() => {
      // Rebuild zone list when sampler changes
      if (this.sampler) {
        this.refreshZones();
      }
    });
  }

  ngAfterViewInit(): void {
    this.initializeSampler();
  }

  ngOnDestroy(): void {
    this.sampler?.dispose();
    this.sampler = null;
  }

  private async initializeSampler(): Promise<void> {
    try {
      const ctx = this.audioEngine.ctx as AudioContext;
      this.sampler = new Sampler(ctx);
      await this.sampler.init();
      this.sampler.connect(ctx.destination);
    } catch (e) {
      console.warn('Sampler init failed:', e);
    }
  }

  // ── Template helpers for event value extraction ──────
  getInputValue(event: Event): number {
    return parseFloat((event.target as HTMLInputElement).value) || 0;
  }

  getSelectValue(event: Event): string {
    return (event.target as HTMLSelectElement).value || '';
  }

  // ── Zone Management ──────────────────────────────────
  private refreshZones(): void {
    if (!this.sampler) return;
    const allZones = this.sampler.getAllZones();
    this.zones.set(allZones.map((z) => this.zoneToUI(z)));
  }

  private zoneToUI(z: SampleZone): SamplerZoneUI {
    return {
      pitch: z.pitch,
      noteName: this.midiToNoteName(z.pitch),
      sampleCount: z.sampleBuffers.length,
      outputChannel: z.outputChannel,
      roundRobin: z.roundRobin,
      attack: z.adsr?.attack ?? 0.005,
      decay: z.adsr?.decay ?? 0.1,
      sustain: z.adsr?.sustain ?? 0.8,
      release: z.adsr?.release ?? 0.2,
      loopStart: z.loop?.start ?? 0,
      loopEnd: z.loop?.end ?? 1,
      loopEnabled: !!z.loop,
    };
  }

  private midiToNoteName(midi: number): string {
    const octave = Math.floor(midi / 12) - 1;
    const note = NOTE_NAMES[midi % 12];
    return `${note}${octave}`;
  }

  selectZone(pitch: number): void {
    this.haptic.light();
    this.selectedPitch.set(pitch);
    this.updateWaveform(pitch);
  }

  // ── Waveform Display ─────────────────────────────────
  private async updateWaveform(pitch: number): Promise<void> {
    if (!this.sampler) return;
    const zone = this.sampler.getZone(pitch);
    if (!zone || zone.sampleBuffers.length === 0) {
      this.waveformData.set(null);
      this.waveformDuration.set(0);
      return;
    }

    const buffer = zone.sampleBuffers[0];
    this.waveformData.set(buffer.getChannelData(0));
    this.waveformDuration.set(buffer.duration);
  }

  // ── Sample Import ────────────────────────────────────
  async importSample(): Promise<void> {
    this.isImporting.set(true);
    try {
      const files = await this.fileLoader.pickLocalFiles('.mp3,.wav,.ogg,.flac,.aiff');
      if (files.length === 0) return;

      const ctx = this.audioEngine.ctx;
      for (const file of files) {
        try {
          const buffer = await this.fileLoader.decodeToAudioBuffer(ctx, file);
          if (!this.sampler) await this.initializeSampler();
          if (!this.sampler) return;

          const pitch = this.findFreePitch();
          this.sampler.loadSample(pitch, buffer);
        } catch (e) {
          console.warn('Failed to import:', file.name, e);
        }
      }
      this.refreshZones();
    } finally {
      this.isImporting.set(false);
    }
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.dragOver.set(true);
  }

  onDragLeave(): void {
    this.dragOver.set(false);
  }

  async onDrop(event: DragEvent): Promise<void> {
    event.preventDefault();
    this.dragOver.set(false);

    const files = Array.from(event.dataTransfer?.files || []);
    if (files.length === 0) return;

    this.isImporting.set(true);
    try {
      const ctx = this.audioEngine.ctx;
      for (const file of files) {
        if (!file.type.startsWith('audio/')) continue;
        try {
          const buffer = await this.fileLoader.decodeToAudioBuffer(ctx, file);
          if (!this.sampler) await this.initializeSampler();
          if (!this.sampler) return;

          const pitch = this.findFreePitch();
          this.sampler.loadSample(pitch, buffer);
          this.selectZone(pitch);
        } catch (e) {
          console.warn('Failed to drop import:', file.name, e);
        }
      }
      this.refreshZones();
    } finally {
      this.isImporting.set(false);
    }
  }

  private findFreePitch(): number {
    if (!this.sampler) return 60;
    const used = new Set(this.sampler.getLoadedPitches());
    for (let p = 60; p <= 96; p++) {
      if (!used.has(p)) return p;
    }
    return 60;
  }

  // ── ADSR Controls ────────────────────────────────────
  updateAdsr(pitch: number, param: string, value: number): void {
    if (!this.sampler) return;
    const zone = this.sampler.getZone(pitch);
    if (!zone) return;

    const adsr = zone.adsr || { attack: 0.005, decay: 0.1, sustain: 0.8, release: 0.2 };
    (adsr as any)[param] = value;
    this.sampler.setAdsr(pitch, adsr);
    this.refreshZones();
  }

  // ── Round-Robin Toggle ───────────────────────────────
  toggleRoundRobin(pitch: number): void {
    if (!this.sampler) return;
    const zone = this.sampler.getZone(pitch);
    if (!zone) return;
    this.sampler.setRoundRobin(pitch, !zone.roundRobin);
    this.refreshZones();
  }

  // ── Output Channel ──────────────────────────────────
  setOutputChannel(pitch: number, channel: string): void {
    if (!this.sampler) return;
    this.sampler.setOutputChannel(pitch, parseInt(channel, 10));
    this.refreshZones();
  }

  // ── Play / Stop ─────────────────────────────────────
  playNote(pitch: number): void {
    if (!this.sampler) return;
    this.audioEngine.resume();
    this.sampler.play(pitch, 0.8);
  }

  stopNote(pitch: number): void {
    if (!this.sampler) return;
    this.sampler.stop(pitch);
  }

  stopAll(): void {
    if (!this.sampler) return;
    this.sampler.stopAll();
  }

  // ── Pitch Bend / Mod ────────────────────────────────
  onPitchBendChange(rawValue: number): void {
    this.pitchBend.set(rawValue);
    if (!this.sampler) return;
    // Normalize slider 0..100 → -1..+1 (center at 50)
    const normalized = ((rawValue - 50) / 50);
    this.sampler.setPitchBend(Math.max(-1, Math.min(1, normalized)));
  }

  onModulationChange(rawValue: number): void {
    this.modulation.set(rawValue);
    if (!this.sampler) return;
    this.sampler.setModulation(rawValue / 100);
  }

  // ── Tab Switching ────────────────────────────────────
  setActiveTab(tab: 'zones' | 'adsr' | 'loops' | 'routing'): void {
    this.haptic.light();
    this.activeTab.set(tab);
  }

  // ── Remove Zone ─────────────────────────────────────
  removeZone(pitch: number): void {
    if (this.selectedPitch() === pitch) {
      this.selectedPitch.set(null);
    }
  }
}
