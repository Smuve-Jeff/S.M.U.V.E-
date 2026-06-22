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
  name: string;
  midi: number;
  color: string;
  type: string;
}

@Component({
  selector: 'app-drum-machine',
  standalone: true,
  imports: [CommonModule, FormsModule, KnobComponent],
  templateUrl: './drum-machine.component.html',
  styleUrls: ['./drum-machine.component.css'],
})
export class DrumMachineComponent implements OnInit, OnDestroy {
  private musicManager = inject(MusicManagerService);
  private audioEngine = inject(AudioEngineService);
  private haptic = inject(HapticService);

  public pads = signal<DrumPad[]>([]);
  public activePadIndex = signal(0);
  public currentGenre = signal<DrumGenre>('trap');
  public swingAmount = signal(0);
  public isRollActive = signal(false);
  public rollRate = signal(16); // 1/16 notes

  private blueprints: DrumPadBlueprint[] = [
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
    const initialPads = this.blueprints.map(b => ({
      ...b,
      id: `pad-${b.midi}`,
      steps: Array(16).fill(null).map(() => ({ active: false, velocity: 100, probability: 1, nudge: 0 })),
      params: {
        semitone: 0,
        decay: 0.5,
        pan: 0,
        cutoff: 20000,
        resonance: 1,
        saturation: 0,
        compression: 0,
        attack: 0.01
      }
    }));
    this.pads.set(initialPads);
  }

  toggleStep(padIndex: number, stepIndex: number) {
    this.haptic.lightClick();
    const currentPads = this.pads();
    currentPads[padIndex].steps[stepIndex].active = !currentPads[padIndex].steps[stepIndex].active;
    this.pads.set([...currentPads]);
    this.syncToMusicManager();
  }

  private syncToMusicManager() {
    const notes: TrackNote[] = [];
    this.pads().forEach(pad => {
      pad.steps.forEach((step, i) => {
        if (step.active) {
          notes.push({
            id: `note-${pad.midi}-${i}`,
            midi: pad.midi,
            step: i + (step.nudge / 100),
            length: 0.1,
            velocity: step.velocity,
            probability: step.probability,
            params: pad.params
          });
        }
      });
    });

    // In a real app, we'd update the dedicated drum track
    this.musicManager.updateTrackNotes(MusicManagerService.DRUM_TRACK_ID, notes);
  }

  updatePadParams(padIndex: number, params: any) {
    const currentPads = this.pads();
    currentPads[padIndex].params = { ...currentPads[padIndex].params, ...params };
    this.pads.set([...currentPads]);
    this.syncToMusicManager();
  }

  setSwing(val: number) {
    this.swingAmount.set(val);
    // Logic to apply swing in sequencer tick would go in SequencerService
  }

  triggerPad(padIndex: number) {
    this.haptic.impact();
    const pad = this.pads()[padIndex];
    const freq = 440 * Math.pow(2, (pad.midi - 69) / 12);
    this.audioEngine.triggerAttack(
      MusicManagerService.DRUM_TRACK_ID,
      freq,
      this.audioEngine.ctx.currentTime,
      127,
      0.1,
      1,
      pad.params
    );
  }
}
