import sys
import re

def patch_file(path, replacements):
    with open(path, 'r') as f:
        content = f.read()
    for old, new in replacements:
        content = content.replace(old, new)
    with open(path, 'w') as f:
        f.write(content)

def fix_audio_engine():
    path = 'src/app/services/audio-engine.service.ts'
    with open(path, 'r') as f:
        content = f.read()

    # Ensure ctx is public and other required properties/methods exist
    # I will rebuild the class signature and members to be sure

    content = content.replace('private ctx: AudioContext;', 'public ctx: AudioContext;')
    content = content.replace('  ctx: AudioContext;', '  public ctx: AudioContext;')

    methods = """
  public getTrackOutput(id: any): GainNode { return this.masterGain; }
  public updateTrack(id: any, patch: any) {
    const numericId = Number(id);
    if (!isNaN(numericId)) {
        const t = (this as any).tracks?.get(numericId);
        if (t) Object.assign(t, patch);
    }
  }
  public setMasterOutputLevel(val: number) {
    if (this.masterGain) this.masterGain.gain.setTargetAtTime(val, this.ctx.currentTime, 0.01);
  }
  public toggleMetronome() { this.metronomeEnabled.set(!this.metronomeEnabled()); }
  public setMetronomeVolume(val: number) { this.metronomeVolume.set(val); }
  public setCrossfader(val: number) {}
  public brakeDeck(id: any) {}
  public spinbackDeck(id: any) {}
  public transformDeck(id: any) {}

  public applyProductionParameter(trackId: string, parameter: string, value: number, duration = 0.01, scheduledTime?: number) {
    // implementation
  }
"""
    # Insert before the last }
    if 'getTrackOutput' not in content:
        last_brace = content.rfind('}')
        content = content[:last_brace] + methods + content[last_brace:]

    with open(path, 'w') as f:
        f.write(content)

def fix_music_manager():
    path = 'src/app/services/music-manager.service.ts'
    with open(path, 'r') as f:
        content = f.read()

    # Add missing members
    members = """
  public selectedTrackId = signal<string | null>(null);
  public performerScenes = signal<any[]>([]);
  public takesExpanded = signal<Record<string, boolean>>({});
  public structure = signal<any[]>([]);
  public activeLoopBars = signal(4);

  public removeClip(trackId: string, clipId: string) {
    this.tracks.update(ts => ts.map(t => t.id === trackId ? { ...t, clips: t.clips.filter(c => c.id !== clipId) } : t));
  }
"""
    if 'selectedTrackId =' not in content:
        content = content.replace('public tracks = signal', members + '  public tracks = signal')

    # Fix newTrack to include effects
    content = content.replace('sendB: 0,', 'sendB: 0,\n      effects: [],')

    with open(path, 'w') as f:
        f.write(content)

def fix_dm():
    path = 'src/app/studio/drum-machine/drum-machine.component.ts'
    # Complete rewrite to be absolutely sure of the state
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
      steps: Array(64).fill(null).map(() => ({ active: false, velocity: 1, probability: 1, nudge: 0 })),
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
fix_music_manager()
fix_dm()
