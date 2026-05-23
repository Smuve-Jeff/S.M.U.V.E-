import {
  Component,
  inject,
  signal,
  computed,
  AfterViewInit,
  OnDestroy,
  EffectRef,
  effect,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  MusicManagerService,
  TrackNote,
} from '../../services/music-manager.service';
import { AudioEngineService } from '../../services/audio-engine.service';
import { InstrumentsService } from '../../services/instruments.service';
import { AiService } from '../../services/ai.service';
import { HapticService } from '../../services/haptic.service';

interface DrumStep {
  active: boolean;
  velocity: number;
}

interface DrumPad {
  id: string;
  name: string;
  midi: number;
  color: string;
  type: string;
  steps: DrumStep[];
  params: {
    semitone: number;
    decay: number;
    pan: number;
  };
}

@Component({
  selector: 'app-drum-machine',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './drum-machine.component.html',
  styleUrl: './drum-machine.component.css',
})
export class DrumMachineComponent implements AfterViewInit, OnDestroy {
  musicManager = inject(MusicManagerService);
  engine = inject(AudioEngineService);
  instrumentsService = inject(InstrumentsService);
  haptic = inject(HapticService);
  aiService = inject(AiService);

  selectedTrackId = this.musicManager.selectedTrackId;
  selectedTrack = computed(() =>
    this.musicManager.tracks().find((t) => t.id === this.selectedTrackId())
  );

  currentStep = this.musicManager.currentStep;
  isSequencerRunning = computed(() => this.engine.isPlaying());

  patternBars = 4;
  stepRange = Array.from({ length: 64 }, (_, i) => i);

  availableKits = computed(() =>
    this.instrumentsService.getPresets().filter((p) => p.category === 'drum')
  );
  selectedKitId = signal<string>('kit-808');
  selectedKit = computed(
    () =>
      this.availableKits().find((k) => k.id === this.selectedKitId()) ||
      this.availableKits()[0]
  );

  pads = signal<DrumPad[]>([
    {
      id: '1',
      name: 'KICK',
      midi: 36,
      color: '#ff4d4d',
      type: 'kick',
      steps: this.initSteps(),
      params: { semitone: 0, decay: 0.5, pan: 0 },
    },
    {
      id: '2',
      name: 'SNARE',
      midi: 38,
      color: '#ff944d',
      type: 'snare',
      steps: this.initSteps(),
      params: { semitone: 0, decay: 0.4, pan: 0 },
    },
    {
      id: '3',
      name: 'CLAP',
      midi: 39,
      color: '#ffdb4d',
      type: 'clap',
      steps: this.initSteps(),
      params: { semitone: 0, decay: 0.4, pan: 0.1 },
    },
    {
      id: '4',
      name: 'CH',
      midi: 42,
      color: '#4dff88',
      type: 'closed-hat',
      steps: this.initSteps(),
      params: { semitone: 0, decay: 0.1, pan: -0.2 },
    },
    {
      id: '5',
      name: 'OH',
      midi: 46,
      color: '#4dffff',
      type: 'open-hat',
      steps: this.initSteps(),
      params: { semitone: 0, decay: 0.8, pan: 0.2 },
    },
    {
      id: '6',
      name: 'TOM L',
      midi: 40,
      color: '#4d88ff',
      type: 'tom',
      steps: this.initSteps(),
      params: { semitone: 0, decay: 0.6, pan: -0.4 },
    },
    {
      id: '7',
      name: 'TOM M',
      midi: 43,
      color: '#944dff',
      type: 'tom',
      steps: this.initSteps(),
      params: { semitone: 0, decay: 0.6, pan: 0 },
    },
    {
      id: '8',
      name: 'TOM H',
      midi: 47,
      color: '#ff4dff',
      type: 'tom',
      steps: this.initSteps(),
      params: { semitone: 0, decay: 0.6, pan: 0.4 },
    },
    {
      id: '9',
      name: 'COWBELL',
      midi: 56,
      color: '#ffffff',
      type: 'cowbell',
      steps: this.initSteps(),
      params: { semitone: 0, decay: 0.3, pan: 0.3 },
    },
    {
      id: '10',
      name: 'SHAKER',
      midi: 70,
      color: '#aaaaaa',
      type: 'shaker',
      steps: this.initSteps(),
      params: { semitone: 0, decay: 0.2, pan: -0.3 },
    },
    {
      id: '11',
      name: 'RIDE',
      midi: 51,
      color: '#ffff00',
      type: 'ride',
      steps: this.initSteps(),
      params: { semitone: 0, decay: 1.2, pan: 0.5 },
    },
    {
      id: '12',
      name: 'RIM',
      midi: 37,
      color: '#888888',
      type: 'rim',
      steps: this.initSteps(),
      params: { semitone: 0, decay: 0.1, pan: -0.1 },
    },
  ]);

  selectedPad = signal<DrumPad | null>(null);

  isGeneratingPattern = signal(false);
  isGenerating = this.isGeneratingPattern;
  evolutionEnabled = signal(false);
  evolutionIntensity = signal(0.2); // 0 to 1
  evolutionSpeed = signal(16); // mutation every X steps

  private evolutionEffect?: EffectRef;

  constructor() {
    this.evolutionEffect = effect(() => {
      const step = this.currentStep();
      const enabled = this.evolutionEnabled();
      if (enabled && step % this.evolutionSpeed() === 0 && step !== -1) {
        this.evolvePattern();
      }
    });

    effect(() => {
      const track = this.selectedTrack();
      if (track) {
        this.syncFromMusicManager(track.notes);
      }
    });
  }

  private initSteps(): DrumStep[] {
    return Array.from({ length: 64 }, () => ({ active: false, velocity: 0.8 }));
  }

  ngAfterViewInit() {
    this.selectedPad.set(this.pads()[0]);
  }

  ngOnDestroy() {
    this.evolutionEffect?.destroy();
  }

  setKit(kitId: string) {
    this.selectedKitId.set(kitId);
    const trackId = this.selectedTrackId();
    if (trackId) {
      this.musicManager.setInstrument(trackId, kitId);
    }
  }

  toggleStep(pad: DrumPad, stepIndex: number) {
    pad.steps[stepIndex].active = !pad.steps[stepIndex].active;
    this.syncToMusicManager();
    if (pad.steps[stepIndex].active) {
      this.playPadSound(pad);
    }
  }

  selectPad(pad: DrumPad) {
    this.selectedPad.set(pad);
  }

  playPadSound(pad: DrumPad) {
    const trackId = this.selectedTrackId() || 0;
    this.engine.triggerAttack(
      trackId,
      this.musicManager.midiToFreq(pad.midi),
      this.engine.getContext().currentTime,
      0.8,
      pad.params.decay,
      1,
      pad.params.pan,
      0,
      0,
      { type: 'sine' },
      1
    );
  }

  clearPattern() {
    this.pads.update((ps) =>
      ps.map((p) => ({
        ...p,
        steps: p.steps.map((s) => ({ ...s, active: false })),
      }))
    );
    this.syncToMusicManager();
  }

  async generateAiPattern(genre: string = 'house') {
    this.isGeneratingPattern.set(true);

    this.pads.update((ps) =>
      ps.map((p) => {
        const newSteps = this.initSteps();

        if (p.name === 'KICK') {
          if (genre === 'house' || genre === 'techno') {
            for (let i = 0; i < 64; i += 4) newSteps[i].active = true;
          } else if (genre === 'trap') {
            [0, 10, 16, 26, 32, 42, 48, 58].forEach(
              (i) => (newSteps[i].active = true)
            );
          } else if (genre === 'afrobeat') {
            [0, 6, 12, 16, 22, 28, 32, 38, 44, 48, 54, 60].forEach(
              (i) => (newSteps[i].active = true)
            );
          }
        }

        if (p.name === 'SNARE' || p.name === 'CLAP') {
          if (genre === 'house' || genre === 'techno') {
            for (let i = 4; i < 64; i += 8) newSteps[i].active = true;
          } else {
            for (let i = 8; i < 64; i += 16) newSteps[i].active = true;
          }
        }

        if (p.name === 'CH') {
          const skip = genre === 'trap' ? 2 : 4;
          for (let i = 0; i < 64; i += skip) {
            newSteps[i].active = Math.random() < 0.8;
            newSteps[i].velocity = 0.5 + Math.random() * 0.5;
          }
        }

        return { ...p, steps: newSteps };
      })
    );

    this.syncToMusicManager();
    this.isGeneratingPattern.set(false);
  }

  evolvePattern() {
    const intensity = this.evolutionIntensity();
    this.pads.update((ps) =>
      ps.map((p) => {
        const newSteps = [...p.steps];
        for (let i = 0; i < 64; i++) {
          if (Math.random() < intensity * 0.1) {
            newSteps[i].active = !newSteps[i].active;
            newSteps[i].velocity = Math.max(
              0.2,
              Math.min(1.2, newSteps[i].velocity + (Math.random() - 0.5) * 0.2)
            );
          }
        }
        return { ...p, steps: newSteps };
      })
    );
    this.syncToMusicManager();
  }

  private syncToMusicManager() {
    const trackId = this.selectedTrackId();
    if (!trackId) return;

    const allNotes: TrackNote[] = [];
    this.pads().forEach((pad) => {
      pad.steps.forEach((step, idx) => {
        if (step.active) {
          allNotes.push({
            id: `drum-${pad.id}-${idx}`,
            midi: pad.midi,
            step: idx,
            length: 1,
            velocity: step.velocity,
          });
        }
      });
    });

    this.musicManager.tracks.update((ts) =>
      ts.map((t) => {
        if (t.id === trackId)
          return {
            ...t,
            notes: allNotes,
            steps: this.calculateSteps(allNotes),
          };
        return t;
      })
    );
  }

  private calculateSteps(notes: TrackNote[]): boolean[] {
    const steps = new Array(64).fill(false);
    notes.forEach((n) => {
      if (n.step >= 0 && n.step < 64) steps[Math.floor(n.step)] = true;
    });
    return steps;
  }

  private syncFromMusicManager(notes: TrackNote[]) {
    const nextPads = this.pads().map((p) => {
      const newSteps = this.initSteps();
      notes.forEach((n) => {
        if (n.midi === p.midi && n.step < 64) {
          newSteps[n.step] = { active: true, velocity: n.velocity };
        }
      });
      return { ...p, steps: newSteps };
    });
    // Simple deep equality check to prevent loops
    if (JSON.stringify(nextPads) !== JSON.stringify(this.pads())) {
      this.pads.set(nextPads);
    }
  }

  hasQuantumDrumEngine() {
    return this.aiService.isUnlocked('upg-quantum-drum-engine') || true;
  }

  isStepActive(midi: number, step: number) {
    const pad = this.pads().find((p) => p.midi === midi);
    return pad ? pad.steps[step].active : false;
  }
}
