import { Component, inject, signal, computed, AfterViewInit, OnDestroy, EffectRef, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AudioSessionService } from '../audio-session.service';
import { KnobComponent } from '../shared/knob/knob.component';
import { MusicManagerService, TrackNote } from '../../services/music-manager.service';
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
  isTriggered?: boolean;
  params: {
    semitone: number;
    decay: number;
    pan: number;
    cutoff: number;
    resonance: number;
    attack: number;
  };
}

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

  isLocalPlayback = signal(false);
  isLocalPlaying = signal(false);
  isLocalRecording = signal(false);

  selectedTrackId = this.musicManager.selectedTrackId;
  selectedTrack = computed(() =>
    this.musicManager.tracks().find((t) => t.id === this.selectedTrackId())
  );

  currentStep = this.musicManager.currentStep;
  isSequencerRunning = computed(() => this.engine.isPlaying());
  swing = 0.12;
  viewMode = signal<'knobs' | 'graph'>('knobs');

  pads = signal<DrumPad[]>([
    { id: '1', name: 'KICK', midi: 36, color: '#ff4d4d', type: 'kick', steps: this.initSteps(), params: { semitone: 0, decay: 0.5, pan: 0, cutoff: 800, resonance: 1.0, attack: 0.002 } },
    { id: '2', name: 'SNARE', midi: 38, color: '#ff944d', type: 'snare', steps: this.initSteps(), params: { semitone: 0, decay: 0.4, pan: 0, cutoff: 2500, resonance: 1.2, attack: 0.002 } },
    { id: '3', name: 'CLAP', midi: 39, color: '#ffdb4d', type: 'clap', steps: this.initSteps(), params: { semitone: 0, decay: 0.4, pan: 0.1, cutoff: 3000, resonance: 0.8, attack: 0.005 } },
    { id: '4', name: 'CH', midi: 42, color: '#4dff88', type: 'closed-hat', steps: this.initSteps(), params: { semitone: 0, decay: 0.1, pan: -0.2, cutoff: 8000, resonance: 1.5, attack: 0.001 } },
    { id: '5', name: 'OH', midi: 46, color: '#4dffff', type: 'open-hat', steps: this.initSteps(), params: { semitone: 0, decay: 0.8, pan: 0.2, cutoff: 7500, resonance: 1.0, attack: 0.001 } },
    { id: '6', name: 'TOM L', midi: 40, color: '#4d88ff', type: 'tom', steps: this.initSteps(), params: { semitone: 0, decay: 0.6, pan: -0.4, cutoff: 600, resonance: 0.9, attack: 0.003 } },
    { id: '7', name: 'TOM M', midi: 43, color: '#944dff', type: 'tom', steps: this.initSteps(), params: { semitone: 0, decay: 0.6, pan: 0, cutoff: 800, resonance: 0.9, attack: 0.003 } },
    { id: '8', name: 'TOM H', midi: 47, color: '#ff4dff', type: 'tom', steps: this.initSteps(), params: { semitone: 0, decay: 0.6, pan: 0.4, cutoff: 1200, resonance: 0.9, attack: 0.003 } },
  ]);

  selectedPad = signal<DrumPad | null>(null);
  selectedPadId = computed(() => this.selectedPad()?.id);

  private evolutionEffect?: EffectRef;

  constructor() {
    this.evolutionEffect = effect(() => {
      const step = this.currentStep();
      this.pads().forEach(pad => {
         if (pad.steps[step % 64].active) {
            pad.isTriggered = true;
            setTimeout(() => pad.isTriggered = false, 100);
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

  private initSteps(): DrumStep[] {
    return Array.from({ length: 64 }, () => ({ active: false, velocity: 0.8 }));
  }

  ngAfterViewInit() {
    this.selectedPad.set(this.pads()[0]);
  }

  ngOnDestroy() {
    this.evolutionEffect?.destroy();
  }

  toggleStep(pad: DrumPad, stepIndex: number) {
    pad.steps[stepIndex].active = !pad.steps[stepIndex].active;
    this.syncToMusicManager();
    if (pad.steps[stepIndex].active) {
      this.playPadSound(pad);
      this.haptic.impact('light');
    }
  }

  selectPad(pad: DrumPad) {
    this.selectedPad.set(pad);
  }

  updatePadParam(pad: DrumPad, param: keyof DrumPad['params'], value: number) {
    (pad.params as any)[param] = value;
    this.syncToMusicManager();
  }

  clearPad(pad: DrumPad) {
    pad.steps = this.initSteps();
    this.syncToMusicManager();
  }

  playPadSound(pad: DrumPad) {
    const trackId = this.selectedTrackId() || 0;
    this.engine.triggerAttack(
      trackId,
      this.musicManager.midiToFreq(pad.midi + pad.params.semitone),
      this.engine.getContext().currentTime,
      0.8,
      pad.params.decay,
      1,
      pad.params.pan,
      0,
      0,
      {
        type: 'sine',
        attack: pad.params.attack,
        cutoff: pad.params.cutoff,
        q: pad.params.resonance
      },
      1
    );
  }

  async aiDrumGen() {
    this.generateAiPattern('house');
    this.haptic.impact('medium');
  }

  randomizePattern() {
    this.pads.update(ps => ps.map(p => ({
      ...p,
      steps: p.steps.map(s => ({ ...s, active: Math.random() > 0.85, velocity: 0.5 + Math.random() * 0.5 }))
    })));
    this.syncToMusicManager();
  }

  startGraphEdit(event: MouseEvent, pad: DrumPad, stepIdx: number) {
    const initialY = event.clientY;
    const initialVel = pad.steps[stepIdx].velocity;

    const onMove = (moveEvent: MouseEvent) => {
       const delta = (initialY - moveEvent.clientY) / 100;
       pad.steps[stepIdx].velocity = Math.max(0.1, Math.min(1.5, initialVel + delta));
       this.syncToMusicManager();
    };

    const onUp = () => {
       window.removeEventListener('mousemove', onMove);
       window.removeEventListener('mouseup', onUp);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  async generateAiPattern(genre: string = 'house') {
    this.pads.update((ps) =>
      ps.map((p) => {
        const newSteps = this.initSteps();
        if (p.name === 'KICK') {
          for (let i = 0; i < 64; i += 4) newSteps[i].active = true;
        }
        if (p.name === 'SNARE' || p.name === 'CLAP') {
          for (let i = 8; i < 64; i += 16) newSteps[i].active = true;
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
      ts.map((t) => (t.id === trackId ? { ...t, notes: allNotes } : t))
    );
  }

  private syncFromMusicManager(notes: TrackNote[]) {
    const nextPads = this.pads().map((p) => {
      const newSteps = this.initSteps();
      notes.forEach((n) => {
        if (n.midi === p.midi && n.step < 64) {
          newSteps[n.step] = { active: true, velocity: n.velocity };
        }
      });
      return { ...p, steps: newSteps, isTriggered: p.isTriggered };
    });
    this.pads.set(nextPads);
  }

  toggleLocalPlay() { this.isLocalPlaying.update(v => !v); }
  toggleLocalRecord() { this.isLocalRecording.update(v => !v); }
}
