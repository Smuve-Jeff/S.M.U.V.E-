import {
  AfterViewInit,
  Component,
  computed,
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
    saturation: number;
    compression: number;
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
const DRUM_PAD_BLUEPRINTS: DrumPadBlueprint[] = [
  { id: 'kick', name: 'KICK', midi: 36, color: '#ff4d4d', type: 'kick', params: { semitone: 0, decay: 0.55, pan: 0, cutoff: 900, resonance: 1.1, attack: 0.002, saturation: 0.1, compression: 0.2 } },
  { id: 'snare', name: 'SNARE', midi: 38, color: '#ff944d', type: 'snare', params: { semitone: 0, decay: 0.32, pan: 0, cutoff: 2600, resonance: 1.4, attack: 0.002, saturation: 0.1, compression: 0.2 } },
  { id: 'clap', name: 'CLAP', midi: 39, color: '#ffdb4d', type: 'clap', params: { semitone: 0, decay: 0.28, pan: 0.08, cutoff: 3200, resonance: 0.9, attack: 0.004, saturation: 0.15, compression: 0.1 } },
  { id: 'closed-hat', name: 'CH', midi: 42, color: '#4dff88', type: 'closed-hat', params: { semitone: 0, decay: 0.11, pan: -0.18, cutoff: 9200, resonance: 1.7, attack: 0.001, saturation: 0, compression: 0 } },
  { id: 'open-hat', name: 'OH', midi: 46, color: '#4dffff', type: 'open-hat', params: { semitone: 0, decay: 0.62, pan: 0.24, cutoff: 7600, resonance: 1.1, attack: 0.001, saturation: 0, compression: 0 } },
  { id: 'tom-low', name: 'TOM L', midi: 40, color: '#4d88ff', type: 'tom', params: { semitone: -2, decay: 0.52, pan: -0.32, cutoff: 720, resonance: 1.0, attack: 0.003, saturation: 0.05, compression: 0.1 } },
  { id: 'tom-mid', name: 'TOM M', midi: 43, color: '#944dff', type: 'tom', params: { semitone: 0, decay: 0.5, pan: 0, cutoff: 940, resonance: 1.0, attack: 0.003, saturation: 0.05, compression: 0.1 } },
  { id: 'tom-high', name: 'TOM H', midi: 47, color: '#ff4dff', type: 'tom', params: { semitone: 2, decay: 0.46, pan: 0.3, cutoff: 1300, resonance: 1.0, attack: 0.003, saturation: 0.05, compression: 0.1 } },
  { id: 'rim', name: 'RIM', midi: 37, color: '#ffc857', type: 'rim', params: { semitone: 0, decay: 0.18, pan: -0.12, cutoff: 4000, resonance: 2.2, attack: 0.001, saturation: 0, compression: 0 } },
  { id: 'cowbell', name: 'COWBELL', midi: 56, color: '#ff8fab', type: 'cowbell', params: { semitone: 0, decay: 0.22, pan: 0.16, cutoff: 4800, resonance: 2.6, attack: 0.001, saturation: 0, compression: 0 } },
  { id: 'shaker', name: 'SHAKER', midi: 82, color: '#95f9e3', type: 'shaker', params: { semitone: 0, decay: 0.12, pan: 0.2, cutoff: 9000, resonance: 0.8, attack: 0.001, saturation: 0, compression: 0 } },
  { id: 'ride', name: 'RIDE', midi: 51, color: '#8ecae6', type: 'ride', params: { semitone: 0, decay: 0.9, pan: 0.12, cutoff: 7000, resonance: 1.3, attack: 0.001, saturation: 0, compression: 0 } },
  { id: 'crash', name: 'CRASH', midi: 49, color: '#ff006e', type: 'crash', params: { semitone: 0, decay: 1.2, pan: -0.1, cutoff: 6000, resonance: 1.1, attack: 0.001, saturation: 0.1, compression: 0.1 } },
  { id: 'conga-low', name: 'CONGA L', midi: 64, color: '#fb5607', type: 'conga', params: { semitone: -2, decay: 0.4, pan: -0.2, cutoff: 1500, resonance: 1.2, attack: 0.005, saturation: 0, compression: 0 } },
  { id: 'conga-mid', name: 'CONGA M', midi: 63, color: '#ffbe0b', type: 'conga', params: { semitone: 0, decay: 0.38, pan: 0, cutoff: 1600, resonance: 1.2, attack: 0.005, saturation: 0, compression: 0 } },
  { id: 'conga-high', name: 'CONGA H', midi: 62, color: '#3a86ff', type: 'conga', params: { semitone: 2, decay: 0.35, pan: 0.2, cutoff: 1800, resonance: 1.2, attack: 0.005, saturation: 0, compression: 0 } },
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
  private readonly haptic = inject(HapticService);
  public readonly aiService = inject(AiService);

  readonly selectedTrackId = this.musicManager.selectedTrackId;
  readonly drumTrack = computed(() => this.musicManager.tracks().find(t => t.id === MusicManagerService.DRUM_TRACK_ID));

  pads = signal<DrumPad[]>(this.initPads());
  selectedPadId = signal<string>('kick');
  selectedPad = computed(() => this.pads().find(p => p.id === this.selectedPadId()));
  viewMode = signal<'sequencer' | 'knobs'>('sequencer');
  graphTarget = signal<GraphTarget>('velocity');
  currentBar = signal(0);
  barRange = [0, 1, 2, 3];
  barStepRange = Array.from({ length: 16 }, (_, i) => i);

  constructor() {}

  ngAfterViewInit() {}

  ngOnDestroy() {}

  private initPads(): DrumPad[] {
    return DRUM_PAD_BLUEPRINTS.map(bp => ({
      ...bp,
      steps: Array.from({ length: TOTAL_STEPS }, () => ({
        active: false,
        velocity: 0.8,
        probability: 1,
        nudge: 0
      }))
    }));
  }

  selectPad(id: string) {
    this.selectedPadId.set(id);
    this.haptic.light();
  }

  getPadStep(padId: string, stepIdx: number) {
    const pad = this.pads().find(p => p.id === padId);
    return pad?.steps[stepIdx] || { active: false, velocity: 0, probability: 0, nudge: 0 };
  }

  toggleStep(padId: string, stepIdx: number) {
    this.pads.update(pads => pads.map(p => {
      if (p.id !== padId) return p;
      const steps = [...p.steps];
      steps[stepIdx] = { ...steps[stepIdx], active: !steps[stepIdx].active };

      if (steps[stepIdx].active) {
        this.musicManager.addNoteToTrack(MusicManagerService.DRUM_TRACK_ID, {
          id: `drum-${padId}-${stepIdx}`,
          midi: p.midi,
          step: stepIdx,
          length: 0.1,
          velocity: steps[stepIdx].velocity,
          params: p.params
        });
      } else {
        this.musicManager.removeNotes(MusicManagerService.DRUM_TRACK_ID, [`drum-${padId}-${stepIdx}`]);
      }

      return { ...p, steps };
    }));
    this.haptic.medium();
  }

  isStepPlaying(pad: DrumPad): boolean {
    const globalStep = this.musicManager.currentStep();
    return pad.steps[globalStep]?.active && this.audioSession.isPlaying();
  }

  isGlobalStep(step: number): boolean {
    return this.musicManager.currentStep() === step && this.audioSession.isPlaying();
  }

  evolveRhythm() {
    this.aiService.generateStrategicDecree();
    this.pads.update(pads => pads.map(p => {
      const steps = p.steps.map((s, i) => {
        let active = s.active;
        // Kick logic
        if (p.type === 'kick') {
          if (i % 8 === 0) active = true;
          else if (i % 4 === 0) active = Math.random() > 0.7;
        }
        // Snare logic
        if (p.type === 'snare' || p.type === 'clap') {
          if (i % 16 === 4 || i % 16 === 12) active = true;
        }
        // Hats logic
        if (p.type === 'closed-hat') {
          if (i % 2 === 0) active = Math.random() > 0.2;
        }

        if (active !== s.active) {
          if (active) {
             this.musicManager.addNoteToTrack(MusicManagerService.DRUM_TRACK_ID, {
               id: `drum-${p.id}-${i}`, midi: p.midi, step: i, length: 0.1, velocity: 0.8, params: p.params
             });
          } else {
             this.musicManager.removeNotes(MusicManagerService.DRUM_TRACK_ID, [`drum-${p.id}-${i}`]);
          }
        }
        return { ...s, active };
      });
      return { ...p, steps };
    }));
  }

  generateGenre(genre: DrumGenre) {
    this.randomizeAll(); // Fallback for now
  }

  randomizeAll() {
    this.pads.update(pads => pads.map(p => {
      const steps = p.steps.map((s, i) => {
        const active = Math.random() > 0.85;
        if (active) {
          this.musicManager.addNoteToTrack(MusicManagerService.DRUM_TRACK_ID, {
            id: `drum-${p.id}-${i}`, midi: p.midi, step: i, length: 0.1, velocity: 0.8, params: p.params
          });
        } else {
          this.musicManager.removeNotes(MusicManagerService.DRUM_TRACK_ID, [`drum-${p.id}-${i}`]);
        }
        return { ...s, active };
      });
      return { ...p, steps };
    }));
  }

  addAutomation(param: string) {
    this.musicManager.addAutomationLane(MusicManagerService.DRUM_TRACK_ID, param);
  }
}
