import {
  Component,
  computed,
  inject,
  OnDestroy,
  OnInit,
  signal,
  ViewChild,
  ElementRef,
  effect
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

interface DrumPad {
  id: string;
  name: string;
  midi: number;
  color: string;
  type: string;
  params: any;
  sampleBuffer?: AudioBuffer;
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

  @ViewChild('sampleInput') sampleInput!: ElementRef<HTMLInputElement>;

  public pads = signal<DrumPad[]>([]);
  public viewMode = signal<'sequencer' | 'knobs'>('sequencer');
  public currentBar = signal(0);
  public barRange = [0, 1, 2, 3];
  public barStepRange = Array.from({length: 16}, (_, i) => i);
  public fullStepRange = Array.from({length: 64}, (_, i) => i);
  public selectedPadId = signal<string>('pad-36');
  public selectedPad = computed(() => this.pads().find(p => p.id === this.selectedPadId()));
  public graphTarget = signal<'velocity' | 'probability'>('velocity');
  public inspectorCollapsed = signal(false);
  public padsCollapsed = signal(false);
  public highDensity = computed(() => this.padsCollapsed() && this.inspectorCollapsed());

  public selectedPadSteps = computed(() => {
    const pad = this.selectedPad();
    if (!pad) return [];
    return Array.from({length: 64}, (_, i) => this.getPadStep(pad.id, i));
  });

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
    const initialPads = this.blueprints.map(b => ({
      ...b,
      id: `pad-${b.midi}`,
      params: { semitone: 0, decay: 0.3, pan: 0, cutoff: 15000, resonance: 1, saturation: 0, compression: 0, attack: 0.005 }
    }));
    this.pads.set(initialPads);
  }

  private getDrumTrack() {
    return this.musicManager.tracks().find(t => t.id === MusicManagerService.DRUM_TRACK_ID);
  }

  private clearDrumPattern() {
    const track = this.getDrumTrack();
    if (track) this.musicManager.removeNotes(track.id, track.notes.map(n => n.id));
  }

  toggleStep(padId: string, stepIndex: number) {
    this.haptic.light();
    const pad = this.pads().find(p => p.id === padId);
    if (!pad) return;

    const drumTrack = this.getDrumTrack();
    if (!drumTrack) return;

    const existingNote = drumTrack.notes.find(n => n.midi === pad.midi && n.step === stepIndex);
    if (existingNote) {
       this.musicManager.removeNotes(drumTrack.id, [existingNote.id]);
    } else {
       this.musicManager.addNoteToTrack(drumTrack.id, {
          id: 'drum_' + Date.now() + Math.random(),
          midi: pad.midi,
          step: stepIndex,
          length: 1,
          velocity: 0.8,
          probability: 1.0,
          params: { ...pad.params, sampleBuffer: pad.sampleBuffer }
       });
    }
  }

  selectPad(id: string) { this.selectedPadId.set(id); }

  getPadStep(padId: string, stepIdx: number) {
    const pad = this.pads().find(p => p.id === padId);
    if (!pad) return { active: false, velocity: 0.8, probability: 1 };

    const note = this.getDrumTrack()?.notes.find(n => n.midi === pad.midi && n.step === stepIdx);
    return { active: !!note, velocity: note?.velocity || 0.8, probability: note?.probability || 1.0 };
  }

  isStepPlaying(pad: DrumPad) {
    const currentStep = this.audioEngine.visualStep() % 64;
    return this.audioSession.isPlaying() && !!this.getDrumTrack()?.notes.find(n => n.midi === pad.midi && n.step === currentStep);
  }

  isGlobalStep(step: number) { return this.audioEngine.visualStep() % 64 === step; }

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
       42: Array.from({length: 32}, (_, i) => i * 2),
       38: [4, 12, 20, 28],
     };
     Object.entries(patterns).forEach(([midi, steps]) => {
       steps.forEach(s => this.toggleStep(`pad-${midi}`, s));
     });
  }

  clearCurrentPad() {
    const pad = this.selectedPad();
    if (!pad) return;
    const track = this.getDrumTrack();
    if (track) {
      const notes = track.notes.filter(n => n.midi === pad.midi);
      this.musicManager.removeNotes(track.id, notes.map(n => n.id));
    }
  }

  }

  }

  }

  randomizeAll() {
     this.clearDrumPattern();
     this.pads().forEach(p => {
        for (let i = 0; i < 64; i++) {
           if (Math.random() > 0.9) this.toggleStep(p.id, i);
        }
     });
  }

  updatePadParam(padId: string, param: string, value: number) {
    this.pads.update(ps => ps.map(p => p.id === padId ? { ...p, params: { ...p.params, [param]: value } } : p));
    this.haptic.light();

    const drumTrack = this.getDrumTrack();
    if (drumTrack) {
       const pad = this.pads().find(p => p.id === padId);
       const notes = drumTrack.notes.filter(n => n.midi === pad?.midi);
       notes.forEach(n => this.musicManager.updateNote(drumTrack.id, n.id, { params: { ...pad?.params, sampleBuffer: pad?.sampleBuffer } }));
    }
  }

  triggerPad(pad: DrumPad) {
    this.haptic.impact('light');
    const freq = 440 * Math.pow(2, (pad.midi - 69) / 12);
    if (pad.sampleBuffer) {
       this.audioEngine.triggerSampler(MusicManagerService.DRUM_TRACK_ID, pad.sampleBuffer, this.audioEngine.ctx.currentTime, 1.0, pad.params.pan, pad.params.decay || 0.3);
    } else {
       this.audioEngine.triggerAttack(MusicManagerService.DRUM_TRACK_ID, freq, this.audioEngine.ctx.currentTime, 1.0, pad.params.decay || 0.3, 1, pad.params.pan, 0, 0, pad.params);
    }
  }

  openSamplePicker() { this.sampleInput.nativeElement.click(); }

  async onSampleSelected(event: any) {
    const file = event.target.files?.[0];
    if (file && this.selectedPad()) {
       const arrayBuffer = await file.arrayBuffer();
       const audioBuffer = await this.audioEngine.ctx.decodeAudioData(arrayBuffer);
       this.pads.update(ps => ps.map(p => p.id === this.selectedPadId() ? { ...p, sampleBuffer: audioBuffer, name: file.name.split('.')[0].toUpperCase().substring(0, 8) } : p));

  }
       this.haptic.medium();
    }
  }
}
