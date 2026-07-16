import {
  Component,
  computed,
  inject,
  OnDestroy,
  OnInit,
  signal,
  ViewChild,
  ElementRef,
  effect,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AudioSessionService } from '../audio-session.service';
import { KnobComponent } from '../shared/knob/knob.component';
import {
  MusicManagerService,
  TrackNote,
} from '../../services/music-manager.service';
import { AudioEngineService } from '../../services/audio-engine.service';
import { AiService } from '../../services/ai.service';
import { HapticService } from '../../services/haptic.service';
import { SnackbarService } from '../../services/snackbar.service';

interface DrumPad {
  id: string;
  name: string;
  midi: number;
  color: string;
  type: string;
  params: any;
  sampleBuffer?: AudioBuffer;
}

interface DrumStyle {
  id: string;
  label: string;
  emoji: string;
  /** Mapping: midi -> step indices in a single bar (0..15) */
  patterns: Record<number, number[]>;
  /** Velocity shaping for that style (0..1) */
  velocity: number;
}

@Component({
  selector: 'app-drum-machine',
  standalone: true,
  imports: [CommonModule, FormsModule, KnobComponent],
  templateUrl: './drum-machine.component.html',
  styleUrls: ['./drum-machine.component.css'],
})
export class DrumMachineComponent implements OnInit, OnDestroy {
  public musicManager = inject(MusicManagerService);
  public audioEngine = inject(AudioEngineService);
  public audioSession = inject(AudioSessionService);
  public aiService = inject(AiService);
  private haptic = inject(HapticService);
  private snack = inject(SnackbarService);

  @ViewChild('sampleInput') sampleInput!: ElementRef<HTMLInputElement>;

  public pads = signal<DrumPad[]>([]);
  public viewMode = signal<'sequencer' | 'knobs'>('sequencer');
  public currentBar = signal(0);
  public barRange = [0, 1, 2, 3];
  public barStepRange = Array.from({ length: 16 }, (_, i) => i);
  public fullStepRange = Array.from({ length: 64 }, (_, i) => i);
  public selectedPadId = signal<string>('pad-36');
  public selectedPad = computed(() =>
    this.pads().find((p) => p.id === this.selectedPadId())
  );
  public graphTarget = signal<'velocity' | 'probability'>('velocity');
  public inspectorCollapsed = signal(false);
  public padsCollapsed = signal(false);
  public highDensity = computed(
    () => this.padsCollapsed() && this.inspectorCollapsed()
  );

  public selectedPadSteps = computed(() => {
    const pad = this.selectedPad();
    if (!pad) return [];
    return Array.from({ length: 64 }, (_, i) => this.getPadStep(pad.id, i));
  });

  // ── Pro: AI Style picker ───────────────────────────────────
  /** 6 curated generative styles, each with characteristic patterns */
  drumStyles: DrumStyle[] = [
    {
      id: 'trap',
      label: 'Trap',
      emoji: '🔥',
      // 808 long-tail kick at 1, snare on 5/13, hat rolls on 1/16
      patterns: {
        36: [0, 6, 8, 11],
        38: [4, 12],
        42: Array.from({ length: 16 }, (_, i) => i),
        46: [3, 7, 11, 14],
        49: [0, 8],
        39: [10],
      },
      velocity: 0.9,
    },
    {
      id: 'house',
      label: 'House',
      emoji: '🪩',
      // Four-on-floor kick, off-beat clap, hat on every 8th
      patterns: {
        36: [0, 4, 8, 12],
        38: [4, 12],
        42: [0, 2, 4, 6, 8, 10, 12, 14],
        46: [4, 12],
        49: [0],
      },
      velocity: 0.85,
    },
    {
      id: 'boombap',
      label: 'Boom Bap',
      emoji: '🎤',
      patterns: {
        36: [0, 8],
        38: [4, 12],
        42: [0, 2, 4, 6, 8, 10, 12, 14],
        46: [6, 14],
        39: [10],
        43: [8],
      },
      velocity: 0.78,
    },
    {
      id: 'drill',
      label: 'Drill',
      emoji: '🧊',
      // Slides + sliding 808 + snare rolls
      patterns: {
        36: [0, 3, 7, 11, 15],
        38: [4, 12, 13, 14],
        42: Array.from({ length: 16 }, (_, i) => i),
        46: [4, 12],
        49: [0, 8],
        39: [9, 11],
      },
      velocity: 0.92,
    },
    {
      id: 'techno',
      label: 'Techno',
      emoji: '⚡',
      patterns: {
        36: [0, 4, 8, 12],
        42: Array.from({ length: 16 }, (_, i) => i),
        46: [3, 11],
        49: [0, 8],
        39: [4, 12],
      },
      velocity: 0.88,
    },
    {
      id: 'lofi',
      label: "Lo-Fi",
      emoji: '☕',
      // Soft swing-friendly pattern with ghosts and ride
      patterns: {
        36: [0, 10],
        38: [4, 12],
        42: [0, 4, 6, 10, 14],
        46: [8],
        49: [2, 14],
        41: [12],
      },
      velocity: 0.65,
    },
  ];
  selectedDrumStyle = signal<DrumStyle>(this.drumStyles[0]);

  // ── Pro: Swing slider ──────────────────────────────────────
  /** Swing 0..75% — pushes off-beat 16ths back */
  swingPercent = signal(20);

  private blueprints = [
    { name: 'KICK', midi: 36, color: '#ff4444', type: 'kick' },
    { name: 'SNARE', midi: 38, color: '#44ff44', type: 'snare' },
    { name: 'CLAP', midi: 39, color: '#ffbb33', type: 'perc' },
    { name: 'HAT CL', midi: 42, color: '#33b5e5', type: 'hihat' },
    { name: 'HAT OP', midi: 46, color: '#33b5e5', type: 'hihat' },
    { name: 'TOM LO', midi: 41, color: '#aa66cc', type: 'tom' },
    { name: 'TOM HI', midi: 43, color: '#aa66cc', type: 'tom' },
    { name: 'CRASH', midi: 49, color: '#ffbb33', type: 'perc' },
  ];

  constructor() {
    this.initPads();
  }

  ngOnInit() {}
  ngOnDestroy() {}

  private initPads() {
    const initialPads = this.blueprints.map((b) => ({
      ...b,
      id: `pad-${b.midi}`,
      params: {
        semitone: 0,
        decay: 0.3,
        pan: 0,
        cutoff: 15000,
        resonance: 1,
        saturation: 0,
        compression: 0,
        attack: 0.005,
      },
    }));
    this.pads.set(initialPads);
  }

  private getDrumTrack() {
    return this.musicManager
      .tracks()
      .find((t) => t.id === MusicManagerService.DRUM_TRACK_ID);
  }

  private clearDrumPattern() {
    const track = this.getDrumTrack();
    if (track)
      this.musicManager.removeNotes(
        track.id,
        track.notes.map((n) => n.id)
      );
  }

  toggleStep(padId: string, stepIndex: number, velocity?: number) {
    this.haptic.light();
    const pad = this.pads().find((p) => p.id === padId);
    if (!pad) return;

    const drumTrack = this.getDrumTrack();
    if (!drumTrack) return;

    const existingNote = drumTrack.notes.find(
      (n) => n.midi === pad.midi && n.step === stepIndex
    );
    if (existingNote) {
      this.musicManager.removeNotes(drumTrack.id, [existingNote.id]);
    } else {
      const swing = this.applySwing(stepIndex);
      this.musicManager.addNoteToTrack(drumTrack.id, {
        id: 'drum_' + Date.now() + Math.random(),
        midi: pad.midi,
        step: stepIndex,
        length: 1,
        velocity: velocity ?? this.selectedDrumStyle().velocity,
        probability: 1.0,
        params: { ...pad.params, sampleBuffer: pad.sampleBuffer, swing },
      });
    }
  }

  /** Apply swing to a step index: off-beat 16ths (odd) get pushed back */
  applySwing(step: number): number {
    if (step % 2 === 0) return 0; // on-beat unchanged
    return this.swingPercent() / 100; // 0..0.75 fraction of a 16th pushed
  }

  selectPad(id: string) {
    this.selectedPadId.set(id);
  }

  crossLinkSelectedPad() {
    const pad = this.selectedPad();
    if (!pad) return;
    const track = this.getDrumTrack();
    this.selectedPadId.set(pad.id);
    this.musicManager.selectedTrackId.set(MusicManagerService.DRUM_TRACK_ID);
    const padNotes = track?.notes.filter((n) => n.midi === pad.midi) ?? [];
    if (padNotes.length === 0) {
      this.musicManager.requestCrossLink({
        view: 'piano-roll',
        trackId: MusicManagerService.DRUM_TRACK_ID,
        label: pad.name + ' pad',
      });
    } else {
      const steps = padNotes.map((n) => n.step);
      this.musicManager.requestCrossLink({
        view: 'piano-roll',
        trackId: MusicManagerService.DRUM_TRACK_ID,
        noteRange: {
          startStep: Math.max(0, Math.floor(Math.min(...steps))),
          endStep: Math.ceil(Math.max(...steps)) + 1,
        },
        label: pad.name + ' pad',
      });
    }
    this.haptic.medium();
  }

  getPadStep(padId: string, stepIdx: number) {
    const pad = this.pads().find((p) => p.id === padId);
    if (!pad) return { active: false, velocity: 0.8, probability: 1 };

    const note = this.getDrumTrack()?.notes.find(
      (n) => n.midi === pad.midi && n.step === stepIdx
    );
    return {
      active: !!note,
      velocity: note?.velocity || 0.8,
      probability: note?.probability || 1.0,
    };
  }

  isStepPlaying(pad: DrumPad) {
    const currentStep = this.audioEngine.visualStep() % 64;
    return (
      this.audioSession.isPlaying() &&
      !!this.getDrumTrack()?.notes.find(
        (n) => n.midi === pad.midi && n.step === currentStep
      )
    );
  }

  isGlobalStep(step: number) {
    return this.audioEngine.visualStep() % 64 === step;
  }

  resolveStepIdx(stepIdx: number) {
    return this.highDensity() ? stepIdx : stepIdx + this.currentBar() * 16;
  }

  evolveRhythm() {
    this.haptic.impact('heavy');
    const pad = this.selectedPad();
    if (!pad) return;
    for (let i = 0; i < 64; i++) {
      if (Math.random() > 0.9) this.toggleStep(pad.id, i);
    }
  }

  generateGenre(genre: string) {
    this.haptic.medium();
    this.clearDrumPattern();
    const patterns: Record<number, number[]> = {
      36: [0, 8, 11, 24, 32],
      42: Array.from({ length: 32 }, (_, i) => i * 2),
      38: [4, 12, 20, 28],
    };
    Object.entries(patterns).forEach(([midi, steps]) => {
      steps.forEach((s) => this.toggleStep(`pad-${midi}`, s));
    });
    this.snack.success(`Pattern generated (genre: ${genre})`);
  }

  // ── Pro: Apply current AI Style across the whole kit ───────
  applyDrumStyle(): void {
    const style = this.selectedDrumStyle();
    this.haptic.heavy();
    this.clearDrumPattern();
    Object.entries(style.patterns).forEach(([midiStr, steps]) => {
      const padId = `pad-${midiStr}`;
      steps.forEach((s) => this.toggleStep(padId, s, style.velocity));
    });
    // Duplicate into bar 2 + 3 + 4 so the pattern fills all 64 steps
    const track = this.getDrumTrack();
    if (track) {
      const source = track.notes.filter((n) => n.step < 16);
      const offsetSteps = [16, 32, 48];
      offsetSteps.forEach((off) => {
        source.forEach((n) => {
          this.musicManager.addNoteToTrack(track.id, {
            id: 'drum_' + Date.now() + Math.random(),
            midi: n.midi,
            step: n.step + off,
            length: n.length,
            velocity: n.velocity,
            probability: n.probability,
            params: { ...n.params },
          });
        });
      });
    }
    this.snack.success(
      `${style.emoji} ${style.label} pattern loaded · swing ${this.swingPercent()}%`
    );
  }

  setDrumStyle(style: DrumStyle): void {
    this.selectedDrumStyle.set(style);
    this.haptic.light();
  }

  setSwing(pct: number): void {
    this.swingPercent.set(Math.max(0, Math.min(75, pct)));
    this.haptic.light();
  }

  // ── Pro: Generate pattern for the current pad using style ───
  generateForSelectedPad(): void {
    const pad = this.selectedPad();
    if (!pad) return;
    const style = this.selectedDrumStyle();
    const steps = style.patterns[pad.midi] ?? [];
    if (steps.length === 0) {
      this.snack.info(
        `${style.label} recipe has no ${pad.name} · try Generate Style`
      );
      return;
    }
    // Replace existing hits on this pad
    const track = this.getDrumTrack();
    if (track) {
      const existing = track.notes.filter((n) => n.midi === pad.midi);
      this.musicManager.removeNotes(
        track.id,
        existing.map((n) => n.id)
      );
    }
    steps.forEach((s) => this.toggleStep(pad.id, s, style.velocity));
    this.haptic.medium();
    this.snack.success(
      `${pad.name} · ${style.label} recipe loaded`
    );
  }

  clearCurrentPad() {
    const pad = this.selectedPad();
    if (!pad) return;
    const track = this.getDrumTrack();
    if (track) {
      const notes = track.notes.filter((n) => n.midi === pad.midi);
      this.musicManager.removeNotes(
        track.id,
        notes.map((n) => n.id)
      );
    }
  }

  doublePattern() {
    const track = this.getDrumTrack();
    if (!track) return;
    const sourceNotes = track.notes.filter((n) => n.step < 32);
    sourceNotes.forEach((n) => {
      const exists = track.notes.find(
        (e) => e.midi === n.midi && e.step === n.step + 32
      );
      if (!exists) {
        this.musicManager.addNoteToTrack(track.id, {
          id: 'drum_' + Date.now() + Math.random(),
          midi: n.midi,
          step: n.step + 32,
          length: n.length,
          velocity: n.velocity,
          probability: n.probability,
          params: { ...n.params },
        });
      }
    });
  }

  humanize() {
    const track = this.getDrumTrack();
    if (!track) return;
    track.notes.forEach((n) => {
      const velocity = Math.min(
        1,
        Math.max(0.1, n.velocity + (Math.random() - 0.5) * 0.2)
      );
      this.musicManager.updateNote(track.id, n.id, { velocity });
    });
  }

  generateEuclidean(pulses: number, steps = 16) {
    const pad = this.selectedPad();
    if (!pad) return;
    const track = this.getDrumTrack();
    if (!track) return;
    const existing = track.notes.filter(
      (n) => n.midi === pad.midi && n.step < steps
    );
    this.musicManager.removeNotes(
      track.id,
      existing.map((n) => n.id)
    );
    const pattern: boolean[] = Array(steps).fill(false);
    let bucket = 0;
    for (let i = 0; i < steps; i++) {
      bucket += pulses;
      if (bucket >= steps) {
        bucket -= steps;
        pattern[i] = true;
      }
    }
    pattern.forEach((active, i) => {
      if (active) {
        this.musicManager.addNoteToTrack(track.id, {
          id: 'drum_' + Date.now() + Math.random(),
          midi: pad.midi,
          step: i,
          length: 1,
          velocity: 0.8,
          probability: 1.0,
          params: { ...pad.params, sampleBuffer: pad.sampleBuffer },
        });
      }
    });
  }

  randomizeAll() {
    this.clearDrumPattern();
    this.pads().forEach((p) => {
      for (let i = 0; i < 64; i++) {
        if (Math.random() > 0.9) this.toggleStep(p.id, i);
      }
    });
  }

  updatePadParam(padId: string, param: string, value: number) {
    this.pads.update((ps) =>
      ps.map((p) =>
        p.id === padId ? { ...p, params: { ...p.params, [param]: value } } : p
      )
    );
    this.haptic.light();
  }

  triggerPad(pad: DrumPad) {
    this.haptic.impact('light');
    const freq = 440 * Math.pow(2, (pad.midi - 69) / 12);
    if (pad.sampleBuffer) {
      this.audioEngine.triggerSampler(
        MusicManagerService.DRUM_TRACK_ID,
        pad.sampleBuffer,
        this.audioEngine.ctx.currentTime,
        1.0,
        pad.params.pan,
        pad.params.decay || 0.3
      );
    } else {
      this.audioEngine.triggerAttack(
        MusicManagerService.DRUM_TRACK_ID,
        freq,
        this.audioEngine.ctx.currentTime,
        1.0,
        pad.params.decay || 0.3,
        1,
        pad.params.pan,
        0,
        0,
        pad.params
      );
    }
  }

  openSamplePicker() {
    this.sampleInput.nativeElement.click();
  }

  async onSampleSelected(event: any) {
    const file = event.target.files?.[0];
    if (file && this.selectedPad()) {
      const arrayBuffer = await file.arrayBuffer();
      const audioBuffer =
        await this.audioEngine.ctx.decodeAudioData(arrayBuffer);
      this.pads.update((ps) =>
        ps.map((p) =>
          p.id === this.selectedPadId()
            ? {
                ...p,
                sampleBuffer: audioBuffer,
                name: file.name.split('.')[0].toUpperCase().substring(0, 8),
              }
            : p
        )
      );
      this.haptic.medium();
    }
  }
}
