import {
  AfterViewInit,
  Component,
  EffectRef,
  computed,
  effect,
  inject,
  OnDestroy,
  signal,
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
import { InstrumentsService } from '../../services/instruments.service';
import { AiService } from '../../services/ai.service';
import { HapticService } from '../../services/haptic.service';

type DrumGenre = 'house' | 'trap' | 'afrobeats' | 'drill' | 'dnb';
type GraphTarget = 'velocity' | 'probability' | 'nudge';

interface DrumStep {
  active: boolean;
  velocity: number;
  probability: number;
  nudge: number;
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
    cutoff: number;
    resonance: number;
    attack: number;
  };
}

interface DrumPadBlueprint {
  id: string;
  name: string;
  midi: number;
  color: string;
  type: string;
  params: DrumPad['params'];
}

const TOTAL_STEPS = 64;
const STEPS_PER_BAR = 16;
const BAR_COUNT = TOTAL_STEPS / STEPS_PER_BAR;
const GENRES: DrumGenre[] = ['house', 'trap', 'afrobeats', 'drill', 'dnb'];
const BAR_RANGE = Array.from({ length: BAR_COUNT }, (_, index) => index);
const STEP_RANGE = Array.from({ length: TOTAL_STEPS }, (_, index) => index);
const BAR_STEP_RANGE = Array.from(
  { length: STEPS_PER_BAR },
  (_, index) => index
);

const DRUM_PAD_BLUEPRINTS: DrumPadBlueprint[] = [
  {
    id: 'kick',
    name: 'KICK',
    midi: 36,
    color: '#ff4d4d',
    type: 'kick',
    params: {
      semitone: 0,
      decay: 0.55,
      pan: 0,
      cutoff: 900,
      resonance: 1.1,
      attack: 0.002,
    },
  },
  {
    id: 'snare',
    name: 'SNARE',
    midi: 38,
    color: '#ff944d',
    type: 'snare',
    params: {
      semitone: 0,
      decay: 0.32,
      pan: 0,
      cutoff: 2600,
      resonance: 1.4,
      attack: 0.002,
    },
  },
  {
    id: 'clap',
    name: 'CLAP',
    midi: 39,
    color: '#ffdb4d',
    type: 'clap',
    params: {
      semitone: 0,
      decay: 0.28,
      pan: 0.08,
      cutoff: 3200,
      resonance: 0.9,
      attack: 0.004,
    },
  },
  {
    id: 'closed-hat',
    name: 'CH',
    midi: 42,
    color: '#4dff88',
    type: 'closed-hat',
    params: {
      semitone: 0,
      decay: 0.11,
      pan: -0.18,
      cutoff: 9200,
      resonance: 1.7,
      attack: 0.001,
    },
  },
  {
    id: 'open-hat',
    name: 'OH',
    midi: 46,
    color: '#4dffff',
    type: 'open-hat',
    params: {
      semitone: 0,
      decay: 0.62,
      pan: 0.24,
      cutoff: 7600,
      resonance: 1.1,
      attack: 0.001,
    },
  },
  {
    id: 'tom-low',
    name: 'TOM L',
    midi: 41,
    color: '#4d88ff',
    type: 'tom',
    params: {
      semitone: -2,
      decay: 0.52,
      pan: -0.32,
      cutoff: 720,
      resonance: 1.0,
      attack: 0.003,
    },
  },
  {
    id: 'tom-mid',
    name: 'TOM M',
    midi: 43,
    color: '#944dff',
    type: 'tom',
    params: {
      semitone: 0,
      decay: 0.5,
      pan: 0,
      cutoff: 940,
      resonance: 1.0,
      attack: 0.003,
    },
  },
  {
    id: 'tom-high',
    name: 'TOM H',
    midi: 47,
    color: '#ff4dff',
    type: 'tom',
    params: {
      semitone: 2,
      decay: 0.46,
      pan: 0.3,
      cutoff: 1300,
      resonance: 1.0,
      attack: 0.003,
    },
  },
  {
    id: 'rim',
    name: 'RIM',
    midi: 37,
    color: '#ffc857',
    type: 'rim',
    params: {
      semitone: 0,
      decay: 0.18,
      pan: -0.12,
      cutoff: 4000,
      resonance: 2.2,
      attack: 0.001,
    },
  },
  {
    id: 'cowbell',
    name: 'COWBELL',
    midi: 56,
    color: '#ff8fab',
    type: 'cowbell',
    params: {
      semitone: 0,
      decay: 0.22,
      pan: 0.16,
      cutoff: 4800,
      resonance: 2.6,
      attack: 0.001,
    },
  },
  {
    id: 'shaker',
    name: 'SHAKER',
    midi: 82,
    color: '#95f9e3',
    type: 'shaker',
    params: {
      semitone: 0,
      decay: 0.12,
      pan: 0.2,
      cutoff: 9000,
      resonance: 0.8,
      attack: 0.001,
    },
  },
  {
    id: 'ride',
    name: 'RIDE',
    midi: 51,
    color: '#8ecae6',
    type: 'ride',
    params: {
      semitone: 0,
      decay: 0.9,
      pan: 0.12,
      cutoff: 7000,
      resonance: 1.3,
      attack: 0.001,
    },
  },
];

@Component({
  selector: 'app-drum-machine',
  standalone: true,
  imports: [CommonModule, FormsModule, KnobComponent],
  templateUrl: './drum-machine.component.html',
  styleUrl: './drum-machine.component.css',
})
export class DrumMachineComponent implements AfterViewInit, OnDestroy {
  public readonly musicManager = inject(MusicManagerService);
  public readonly engine = inject(AudioEngineService);
  public readonly audioSession = inject(AudioSessionService);
  private readonly instrumentsService = inject(InstrumentsService);
  private readonly haptic = inject(HapticService);
  public readonly aiService = inject(AiService);

  readonly selectedTrackId = this.musicManager.selectedTrackId;
  readonly selectedTrack = computed(() =>
    this.musicManager
      .tracks()
      .find((track) => track.id === this.selectedTrackId())
  );
  readonly currentStep = this.musicManager.currentStep;
  readonly isSequencerRunning = computed(() => this.engine.isPlaying());

  readonly pads = signal<DrumPad[]>(this.createDefaultPads());
  readonly selectedPadId = signal<string | null>(null);
  readonly selectedPad = computed(
    () => this.pads().find((pad) => pad.id === this.selectedPadId()) ?? null
  );
  readonly selectedGenre = signal<DrumGenre>('house');
  readonly viewMode = signal<'knobs' | 'graph'>('knobs');
  readonly graphTarget = signal<GraphTarget>('velocity');
  readonly evolutionIntensity = signal(0.35);
  readonly swing = signal(0.12);
  readonly stepRange = STEP_RANGE;
  readonly barRange = BAR_RANGE;
  readonly barStepRange = BAR_STEP_RANGE;
  readonly availableGenres = GENRES;
  readonly playheadStep = computed(() => {
    const step = this.currentStep();
    return step < 0 ? 0 : this.normalizeStep(step);
  });
  readonly patternDensity = computed(() => {
    const totalActive = this.pads().reduce(
      (count, pad) => count + pad.steps.filter((step) => step.active).length,
      0
    );
    return Math.round((totalActive / (this.pads().length * TOTAL_STEPS)) * 100);
  });

  private evolutionEffect?: EffectRef;
  private readonly triggerTimers = new Map<
    string,
    ReturnType<typeof setTimeout>
  >();
  private readonly triggeredPadIds = signal<string[]>([]);

  constructor() {
    void this.instrumentsService.getPresets();

    this.evolutionEffect = effect(() => {
      const step = this.currentStep();
      if (step < 0) {
        return;
      }

      const normalizedStep = this.normalizeStep(step);
      this.pads().forEach((pad) => {
        if (pad.steps[normalizedStep]?.active) {
          this.markPadTriggered(pad.id);
        }
      });
    });

    effect(() => {
      const track = this.selectedTrack();
      if (track) {
        this.syncFromMusicManager(track.notes);
      }
    });
  }

  ngAfterViewInit() {
    if (!this.selectedPadId()) {
      this.selectedPadId.set(this.pads()[0]?.id ?? null);
    }
  }

  ngOnDestroy() {
    this.evolutionEffect?.destroy();
    this.triggerTimers.forEach((timer) => clearTimeout(timer));
    this.triggerTimers.clear();
  }

  isPadTriggered(padId: string): boolean {
    return this.triggeredPadIds().includes(padId);
  }

  selectPad(pad: DrumPad) {
    this.selectedPadId.set(pad.id);
  }

  previewPad(pad: DrumPad) {
    this.playPadSound(pad);
    this.haptic.impact('light');
    this.markPadTriggered(pad.id);
  }

  toggleStep(pad: DrumPad, stepIndex: number) {
    this.pads.update((pads) =>
      pads.map((currentPad) =>
        currentPad.id === pad.id
          ? {
              ...currentPad,
              steps: currentPad.steps.map((step, index) =>
                index === stepIndex ? { ...step, active: !step.active } : step
              ),
            }
          : currentPad
      )
    );

    const updatedPad = this.pads().find(
      (currentPad) => currentPad.id === pad.id
    );
    const updatedStep = updatedPad?.steps[stepIndex];

    this.syncToMusicManager();

    if (updatedPad && updatedStep?.active) {
      this.playPadSound(updatedPad, updatedStep.velocity);
      this.markPadTriggered(updatedPad.id);
      this.haptic.impact('light');
    }
  }

  updatePadParam(pad: DrumPad, param: keyof DrumPad['params'], value: number) {
    this.pads.update((pads) =>
      pads.map((currentPad) =>
        currentPad.id === pad.id
          ? {
              ...currentPad,
              params: {
                ...currentPad.params,
                [param]: value,
              },
            }
          : currentPad
      )
    );
    this.syncToMusicManager();
  }

  clearPad(pad: DrumPad) {
    this.pads.update((pads) =>
      pads.map((currentPad) =>
        currentPad.id === pad.id
          ? { ...currentPad, steps: this.initSteps() }
          : currentPad
      )
    );
    this.syncToMusicManager();
  }

  clearPattern() {
    this.pads.update((pads) =>
      pads.map((pad) => ({ ...pad, steps: this.initSteps() }))
    );
    this.syncToMusicManager();
  }

  async aiDrumGen() {
    let genre: DrumGenre = this.selectedGenre();

    try {
      const response = await this.aiService.generateAiResponse(
        'Return one genre only for a pro drum groove: house, trap, afrobeats, drill, or dnb.'
      );
      genre = this.extractGenre(response) ?? genre;
    } catch {
      genre = this.selectedGenre();
    }

    this.generateAiPattern(genre);
    this.haptic.impact('medium');
  }

  randomizePattern() {
    this.pads.update((pads) =>
      pads.map((pad) => ({
        ...pad,
        steps: pad.steps.map((_step, index) => {
          const grooveBias = this.getRandomDensityForPad(pad, index);
          const active = Math.random() < grooveBias;
          return {
            active,
            velocity: active
              ? this.clamp(0.55 + Math.random() * 0.55, 0.1, 1.5)
              : 0.8,
            probability: active
              ? this.clamp(0.6 + Math.random() * 0.4, 0, 1)
              : 1,
            nudge: active
              ? Number(((Math.random() - 0.5) * 0.16).toFixed(2))
              : 0,
          };
        }),
      }))
    );
    this.syncToMusicManager();
  }

  evolvePattern() {
    const intensity = this.evolutionIntensity();

    this.pads.update((pads) =>
      pads.map((pad, padIndex) => {
        const steps = pad.steps.map((step, stepIndex) => {
          const shouldMutate =
            step.active &&
            ((stepIndex + padIndex) % 4 === 0 || intensity > 0.6);
          if (!shouldMutate) {
            return step;
          }

          const toggled =
            intensity > 0.72 && stepIndex % 8 === 7
              ? !step.active
              : step.active;
          return {
            active: toggled,
            velocity: this.clamp(
              step.velocity + (intensity - 0.5) * 0.25,
              0.1,
              1.5
            ),
            probability: this.clamp(step.probability + intensity * 0.12, 0, 1),
            nudge: this.clamp(
              step.nudge + (padIndex % 2 === 0 ? 0.02 : -0.02) * intensity,
              -0.5,
              0.5
            ),
          };
        });

        if (!steps.some((step) => step.active) && intensity > 0) {
          const anchorStep = (padIndex * 2) % STEPS_PER_BAR;
          steps[anchorStep] = {
            active: true,
            velocity: this.clamp(0.75 + intensity * 0.25, 0.1, 1.5),
            probability: this.clamp(0.7 + intensity * 0.2, 0, 1),
            nudge: 0,
          };
        }

        return { ...pad, steps };
      })
    );

    this.syncToMusicManager();
  }

  startGraphEdit(event: MouseEvent, pad: DrumPad, stepIndex: number) {
    const initialY = event.clientY;
    const initialValue = this.getGraphValue(pad.steps[stepIndex]);

    const onMove = (moveEvent: MouseEvent) => {
      const delta = (initialY - moveEvent.clientY) / 120;
      this.pads.update((pads) =>
        pads.map((currentPad) =>
          currentPad.id === pad.id
            ? {
                ...currentPad,
                steps: currentPad.steps.map((step, index) =>
                  index === stepIndex
                    ? this.updateGraphStep(step, initialValue + delta)
                    : step
                ),
              }
            : currentPad
        )
      );
      this.syncToMusicManager();
    };

    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  generateAiPattern(genre: DrumGenre = this.selectedGenre()) {
    this.selectedGenre.set(genre);
    this.pads.update((pads) =>
      pads.map((pad, index) => ({
        ...pad,
        steps: this.buildGenreSteps(pad, genre, index),
      }))
    );
    this.syncToMusicManager();
  }

  addAutomation(parameter: string) {
    const trackId = this.selectedTrackId();
    if (trackId !== null) {
      this.musicManager.addAutomationLane(trackId, parameter);
    }
  }

  getPadActiveCount(pad: DrumPad): number {
    return pad.steps.filter((step) => step.active).length;
  }

  getSelectedPadAverageVelocity(pad: DrumPad): number {
    const activeSteps = pad.steps.filter((step) => step.active);
    if (!activeSteps.length) {
      return 0;
    }

    const average =
      activeSteps.reduce((sum, step) => sum + step.velocity, 0) /
      activeSteps.length;
    return Math.round(average * 100);
  }

  getGraphBarHeight(step: DrumStep): number {
    const value = this.getGraphValue(step);
    if (this.graphTarget() === 'nudge') {
      return Math.max(6, Math.abs(value) * 200);
    }
    return Math.max(6, value * 100);
  }

  getGraphValueLabel(step: DrumStep): string {
    const value = this.getGraphValue(step);
    if (this.graphTarget() === 'nudge') {
      return `${Math.round(value * 100)} ms`;
    }
    return `${Math.round(value * 100)}%`;
  }

  getGraphTargetLabel(): string {
    switch (this.graphTarget()) {
      case 'probability':
        return 'Trigger Probability';
      case 'nudge':
        return 'Micro Timing';
      default:
        return 'Velocity';
    }
  }

  private initSteps(): DrumStep[] {
    return Array.from({ length: TOTAL_STEPS }, () => ({
      active: false,
      velocity: 0.8,
      probability: 1,
      nudge: 0,
    }));
  }

  private createDefaultPads(): DrumPad[] {
    return DRUM_PAD_BLUEPRINTS.map((pad) => ({
      ...pad,
      params: { ...pad.params },
      steps: this.initSteps(),
    }));
  }

  private markPadTriggered(padId: string) {
    if (!this.triggeredPadIds().includes(padId)) {
      this.triggeredPadIds.update((padIds) => [...padIds, padId]);
    }

    const previousTimer = this.triggerTimers.get(padId);
    if (previousTimer) {
      clearTimeout(previousTimer);
    }

    const timer = setTimeout(() => {
      this.triggeredPadIds.update((padIds) =>
        padIds.filter((id) => id !== padId)
      );
      this.triggerTimers.delete(padId);
    }, 100);

    this.triggerTimers.set(padId, timer);
  }

  private normalizeStep(step: number): number {
    return ((Math.floor(step) % TOTAL_STEPS) + TOTAL_STEPS) % TOTAL_STEPS;
  }

  private playPadSound(pad: DrumPad, velocity: number = 0.8) {
    const trackId = this.selectedTrackId() ?? 0;
    this.engine.triggerAttack(
      trackId,
      this.musicManager.midiToFreq(pad.midi + pad.params.semitone),
      this.engine.getContext().currentTime,
      velocity,
      pad.params.decay,
      1,
      pad.params.pan,
      0,
      0,
      {
        type: 'sine',
        attack: pad.params.attack,
        cutoff: pad.params.cutoff,
        q: pad.params.resonance,
      },
      1
    );
  }

  private buildGenreSteps(
    pad: DrumPad,
    genre: DrumGenre,
    padIndex: number
  ): DrumStep[] {
    const steps = this.initSteps();

    switch (genre) {
      case 'trap':
        this.applyTrapPattern(pad, steps, padIndex);
        break;
      case 'afrobeats':
        this.applyAfrobeatsPattern(pad, steps, padIndex);
        break;
      case 'drill':
        this.applyDrillPattern(pad, steps, padIndex);
        break;
      case 'dnb':
        this.applyDnbPattern(pad, steps, padIndex);
        break;
      default:
        this.applyHousePattern(pad, steps, padIndex);
        break;
    }

    return steps;
  }

  private applyHousePattern(pad: DrumPad, steps: DrumStep[], padIndex: number) {
    if (pad.name === 'KICK') {
      this.repeatBarPattern(steps, [0, 4, 8, 12], { velocity: 0.98 });
    } else if (pad.name === 'SNARE' || pad.name === 'CLAP') {
      this.repeatBarPattern(steps, [4, 12], {
        velocity: pad.name === 'SNARE' ? 0.92 : 0.8,
      });
    } else if (pad.name === 'CH') {
      this.repeatBarPattern(steps, [2, 6, 10, 14], {
        velocity: 0.68,
        probability: 0.92,
      });
    } else if (pad.name === 'OH') {
      this.repeatBarPattern(steps, [7, 15], {
        velocity: 0.72,
        probability: 0.86,
      });
    } else if (pad.type === 'shaker') {
      this.repeatBarPattern(steps, [1, 3, 5, 7, 9, 11, 13, 15], {
        velocity: 0.55,
        probability: 0.84,
      });
    } else if (pad.type === 'ride') {
      this.repeatBarPattern(steps, [0, 4, 8, 12], {
        velocity: 0.5,
        probability: 0.72,
      });
    } else if (pad.type === 'cowbell') {
      this.repeatBarPattern(steps, [8, 10], {
        velocity: 0.62,
        probability: 0.75,
      });
    } else if (pad.type === 'rim') {
      this.repeatBarPattern(steps, [3, 11], {
        velocity: 0.48,
        probability: 0.64,
      });
    } else if (pad.type === 'tom') {
      this.applyPattern(steps, [46 + padIndex, 62], {
        velocity: 0.74,
        probability: 0.78,
      });
    }
  }

  private applyTrapPattern(pad: DrumPad, steps: DrumStep[], padIndex: number) {
    if (pad.name === 'KICK') {
      this.repeatPatternWithVariation(steps, [0, 7, 10], [0, 6, 10, 13], {
        velocity: 0.96,
        probability: 0.94,
      });
    } else if (pad.name === 'SNARE') {
      this.repeatBarPattern(steps, [4, 12], { velocity: 0.92 });
    } else if (pad.name === 'CLAP') {
      this.repeatBarPattern(steps, [12], { velocity: 0.76, probability: 0.8 });
    } else if (pad.name === 'CH') {
      this.repeatBarPattern(steps, [0, 2, 4, 6, 8, 10, 12, 14], {
        velocity: 0.6,
        probability: 0.96,
      });
      this.applyPattern(steps, [22, 23, 54, 55], {
        velocity: 0.72,
        probability: 0.88,
      });
    } else if (pad.name === 'OH') {
      this.repeatPatternWithVariation(steps, [11, 15], [7, 11, 15], {
        velocity: 0.76,
        probability: 0.84,
      });
    } else if (pad.type === 'shaker') {
      this.repeatBarPattern(steps, [3, 7, 11, 15], {
        velocity: 0.48,
        probability: 0.8,
      });
    } else if (pad.type === 'cowbell') {
      this.repeatBarPattern(steps, [9], { velocity: 0.58, probability: 0.7 });
    } else if (pad.type === 'ride') {
      this.repeatBarPattern(steps, [12], { velocity: 0.45, probability: 0.65 });
    } else if (pad.type === 'tom') {
      this.applyPattern(steps, [27 + padIndex, 31, 59], {
        velocity: 0.8,
        probability: 0.82,
      });
    }
  }

  private applyAfrobeatsPattern(
    pad: DrumPad,
    steps: DrumStep[],
    padIndex: number
  ) {
    if (pad.name === 'KICK') {
      this.repeatPatternWithVariation(steps, [0, 3, 9, 12], [0, 6, 9, 13], {
        velocity: 0.9,
        probability: 0.9,
      });
    } else if (pad.name === 'SNARE' || pad.name === 'CLAP') {
      this.repeatBarPattern(steps, [4, 10, 14], {
        velocity: pad.name === 'SNARE' ? 0.8 : 0.66,
        probability: 0.86,
      });
    } else if (pad.name === 'CH') {
      this.repeatBarPattern(steps, [2, 6, 8, 12, 14], {
        velocity: 0.58,
        probability: 0.88,
      });
    } else if (pad.name === 'OH') {
      this.repeatBarPattern(steps, [7, 15], {
        velocity: 0.7,
        probability: 0.8,
      });
    } else if (pad.type === 'shaker') {
      this.repeatBarPattern(steps, [1, 3, 5, 7, 9, 11, 13, 15], {
        velocity: 0.5,
        probability: 0.76,
      });
    } else if (pad.type === 'cowbell' || pad.type === 'rim') {
      this.repeatBarPattern(steps, [5, 11], {
        velocity: 0.56,
        probability: 0.7,
      });
    } else if (pad.type === 'ride') {
      this.repeatBarPattern(steps, [0, 8, 12], {
        velocity: 0.44,
        probability: 0.64,
      });
    } else if (pad.type === 'tom') {
      this.applyPattern(steps, [29 + padIndex, 45 + padIndex, 61], {
        velocity: 0.78,
        probability: 0.8,
      });
    }
  }

  private applyDrillPattern(pad: DrumPad, steps: DrumStep[], padIndex: number) {
    if (pad.name === 'KICK') {
      this.repeatPatternWithVariation(steps, [0, 5, 10, 13], [0, 6, 11, 14], {
        velocity: 0.94,
        probability: 0.9,
      });
    } else if (pad.name === 'SNARE') {
      this.repeatBarPattern(steps, [4, 12], { velocity: 0.88 });
    } else if (pad.name === 'CLAP') {
      this.repeatBarPattern(steps, [12], { velocity: 0.72, probability: 0.76 });
    } else if (pad.name === 'CH') {
      this.repeatBarPattern(steps, [0, 2, 4, 6, 8, 10, 12, 14], {
        velocity: 0.64,
        probability: 0.94,
      });
      this.applyPattern(steps, [30, 31, 62, 63], {
        velocity: 0.74,
        probability: 0.82,
      });
    } else if (pad.name === 'OH') {
      this.repeatBarPattern(steps, [11, 15], {
        velocity: 0.72,
        probability: 0.82,
      });
    } else if (pad.type === 'shaker') {
      this.repeatBarPattern(steps, [1, 5, 9, 13], {
        velocity: 0.46,
        probability: 0.74,
      });
    } else if (pad.type === 'ride') {
      this.repeatBarPattern(steps, [4, 12], {
        velocity: 0.42,
        probability: 0.6,
      });
    } else if (pad.type === 'cowbell' || pad.type === 'rim') {
      this.repeatBarPattern(steps, [6, 14], {
        velocity: 0.54,
        probability: 0.66,
      });
    } else if (pad.type === 'tom') {
      this.applyPattern(steps, [28 + padIndex, 44 + padIndex, 60], {
        velocity: 0.76,
        probability: 0.78,
      });
    }
  }

  private applyDnbPattern(pad: DrumPad, steps: DrumStep[], padIndex: number) {
    if (pad.name === 'KICK') {
      this.repeatPatternWithVariation(steps, [0, 10], [0, 9, 10], {
        velocity: 0.98,
        probability: 0.94,
      });
    } else if (pad.name === 'SNARE' || pad.name === 'CLAP') {
      this.repeatBarPattern(steps, [4, 12], {
        velocity: pad.name === 'SNARE' ? 0.96 : 0.74,
        probability: 0.88,
      });
    } else if (pad.name === 'CH') {
      this.repeatBarPattern(steps, [0, 2, 4, 6, 8, 10, 12, 14], {
        velocity: 0.66,
        probability: 0.98,
      });
    } else if (pad.name === 'OH' || pad.type === 'ride') {
      this.repeatBarPattern(steps, [6, 14], {
        velocity: 0.62,
        probability: 0.84,
      });
    } else if (pad.type === 'shaker') {
      this.repeatBarPattern(steps, [1, 3, 5, 7, 9, 11, 13, 15], {
        velocity: 0.44,
        probability: 0.78,
      });
    } else if (pad.type === 'cowbell' || pad.type === 'rim') {
      this.repeatBarPattern(steps, [2, 10], {
        velocity: 0.5,
        probability: 0.68,
      });
    } else if (pad.type === 'tom') {
      this.applyPattern(steps, [27 + padIndex, 43 + padIndex, 59], {
        velocity: 0.74,
        probability: 0.8,
      });
    }
  }

  private applyPattern(
    steps: DrumStep[],
    indexes: number[],
    config: Partial<Pick<DrumStep, 'velocity' | 'probability' | 'nudge'>> = {}
  ) {
    indexes.forEach((index) => {
      if (index < 0 || index >= TOTAL_STEPS) {
        return;
      }

      steps[index] = {
        active: true,
        velocity: config.velocity ?? steps[index].velocity,
        probability: config.probability ?? steps[index].probability,
        nudge: config.nudge ?? steps[index].nudge,
      };
    });
  }

  private repeatBarPattern(
    steps: DrumStep[],
    baseIndexes: number[],
    config: Partial<Pick<DrumStep, 'velocity' | 'probability' | 'nudge'>> = {}
  ) {
    BAR_RANGE.forEach((bar) => {
      this.applyPattern(
        steps,
        baseIndexes.map((index) => index + bar * STEPS_PER_BAR),
        config
      );
    });
  }

  private repeatPatternWithVariation(
    steps: DrumStep[],
    evenBarIndexes: number[],
    oddBarIndexes: number[],
    config: Partial<Pick<DrumStep, 'velocity' | 'probability' | 'nudge'>> = {}
  ) {
    BAR_RANGE.forEach((bar) => {
      const pattern = bar % 2 === 0 ? evenBarIndexes : oddBarIndexes;
      this.applyPattern(
        steps,
        pattern.map((index) => index + bar * STEPS_PER_BAR),
        config
      );
    });
  }

  private extractGenre(value: string): DrumGenre | null {
    const normalized = value.toLowerCase();
    return GENRES.find((genre) => normalized.includes(genre)) ?? null;
  }

  private getRandomDensityForPad(pad: DrumPad, stepIndex: number): number {
    if (pad.type === 'kick') {
      return stepIndex % 4 === 0 ? 0.7 : 0.18;
    }
    if (pad.name === 'SNARE' || pad.name === 'CLAP') {
      return stepIndex % 8 === 4 ? 0.5 : 0.16;
    }
    if (pad.name === 'CH' || pad.type === 'shaker') {
      return 0.42;
    }
    if (pad.name === 'OH' || pad.type === 'ride') {
      return 0.18;
    }
    return 0.12;
  }

  private getGraphValue(step: DrumStep): number {
    switch (this.graphTarget()) {
      case 'probability':
        return step.probability;
      case 'nudge':
        return Math.abs(step.nudge);
      default:
        return step.velocity;
    }
  }

  private updateGraphStep(step: DrumStep, value: number): DrumStep {
    switch (this.graphTarget()) {
      case 'probability':
        return {
          ...step,
          probability: this.clamp(value, 0, 1),
          active: step.active || value > 0,
        };
      case 'nudge':
        return {
          ...step,
          nudge: this.clamp(value - 0.5, -0.5, 0.5),
          active: step.active || Math.abs(value) > 0,
        };
      default:
        return {
          ...step,
          velocity: this.clamp(value, 0.1, 1.5),
          active: step.active || value > 0,
        };
    }
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }

  private syncToMusicManager() {
    const trackId = this.selectedTrackId();
    if (trackId === null) {
      return;
    }

    const allNotes: TrackNote[] = [];

    this.pads().forEach((pad) => {
      pad.steps.forEach((step, index) => {
        if (!step.active) {
          return;
        }

        allNotes.push({
          id: `drum-${pad.id}-${index}`,
          midi: pad.midi,
          step: index,
          length: 1,
          velocity: step.velocity,
          probability: step.probability,
          offset: step.nudge,
          pan: pad.params.pan,
          cutoff: pad.params.cutoff,
        });
      });
    });

    this.musicManager.tracks.update((tracks) =>
      tracks.map((track) =>
        track.id === trackId ? { ...track, notes: allNotes } : track
      )
    );
  }

  private syncFromMusicManager(notes: TrackNote[]) {
    this.pads.update((pads) =>
      pads.map((pad) => {
        const newSteps = this.initSteps();
        notes.forEach((note) => {
          const stepIndex = this.normalizeStep(Math.round(note.step));
          if (note.midi === pad.midi) {
            newSteps[stepIndex] = {
              active: true,
              velocity: note.velocity,
              probability: note.probability ?? 1,
              nudge: note.offset ?? 0,
            };
          }
        });
        return { ...pad, steps: newSteps };
      })
    );
  }
}
