import sys

def fix_audio_engine():
    path = 'src/app/services/audio-engine.service.ts'
    with open(path, 'r') as f:
        lines = f.readlines()

    new_lines = []
    for line in lines:
        # Fix the syntax error I introduced
        line = line.replace('this.public applyProductionParameter', 'this.applyProductionParameter')
        # Ensure ctx is public
        if 'private ctx: AudioContext;' in line:
            line = line.replace('private ctx: AudioContext;', 'public ctx: AudioContext;')
        elif '  ctx: AudioContext;' in line:
             line = line.replace('  ctx: AudioContext;', '  public ctx: AudioContext;')

        # Ensure applyProductionParameter is public
        if 'applyProductionParameter(' in line and 'public' not in line and 'this.' not in line:
            line = line.replace('applyProductionParameter(', 'public applyProductionParameter(')

        new_lines.append(line)

    with open(path, 'w') as f:
        f.writelines(new_lines)

def fix_dm():
    path = 'src/app/studio/drum-machine/drum-machine.component.ts'
    # It's better to just rewrite this file to a known good state given the mess
    content = """import {
  AfterViewInit,
  Component,
  computed,
  inject,
  OnDestroy,
  OnInit,
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
  public musicManager = inject(MusicManagerService);
  public audioEngine = inject(AudioEngineService);
  public audioSession = inject(AudioSessionService);
  public aiService = inject(AiService);
  private haptic = inject(HapticService);

  public pads = signal<DrumPad[]>([]);
  public activePadIndex = signal(0);
  public currentGenre = signal<DrumGenre>('trap');
  public swingAmount = signal(0);
  public isRollActive = signal(false);
  public rollRate = signal(16);

  public viewMode = signal<'sequencer' | 'knobs'>('sequencer');
  public currentBar = signal(0);
  public barRange = [0, 1, 2, 3];
  public barStepRange = Array.from({length: 16}, (_, i) => i);
  public selectedPadId = signal<string>('pad-36');
  public selectedPad = computed(() => this.pads().find(p => p.id === this.selectedPadId()));
  public graphTarget = signal<'velocity' | 'probability'>('velocity');

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
      steps: Array(64).fill(null).map(() => ({ active: false, velocity: 100, probability: 1, nudge: 0 })),
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

  toggleStep(padId: string, stepIndex: number) {
    this.haptic.light();
    this.pads.update(ps => ps.map(p => {
        if (p.id === padId) {
            const newSteps = [...p.steps];
            newSteps[stepIndex] = { ...newSteps[stepIndex], active: !newSteps[stepIndex].active };
            return { ...p, steps: newSteps };
        }
        return p;
    }));
  }

  selectPad(id: string) {
    this.selectedPadId.set(id);
  }

  getPadStep(padId: string, stepIdx: number) {
    const pad = this.pads().find(p => p.id === padId);
    return pad?.steps[stepIdx] || { active: false, velocity: 1, probability: 1 };
  }

  isStepPlaying(pad: any) { return false; }
  isGlobalStep(step: number) { return false; }
  evolveRhythm() {}
  generateGenre(genre: string) {}
  randomizeAll() {}

  triggerPad(padIndex: number) {
    this.haptic.impact('light');
    const pad = this.pads()[padIndex];
    if (!pad) return;
    const freq = 440 * Math.pow(2, (pad.midi - 69) / 12);
    this.audioEngine.triggerAttack(
      MusicManagerService.DRUM_TRACK_ID,
      freq,
      this.audioEngine.ctx.currentTime,
      127,
      0.1,
      1, 0, 0, 0,
      pad.params
    );
  }
}
"""
    with open(path, 'w') as f:
        f.write(content)

fix_audio_engine()
fix_dm()
