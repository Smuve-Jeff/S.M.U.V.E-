import {
  Component,
  inject,
  signal,
  computed,
  AfterViewInit,
  OnDestroy,
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
  params: { semitone: number };
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
  aiService = inject(AiService);

  selectedTrackId = this.musicManager.selectedTrackId;
  selectedTrack = computed(() =>
    this.musicManager.tracks().find((t) => t.id === this.selectedTrackId())
  );

  currentStep = this.musicManager.currentStep;
  isSequencerRunning = computed(() => this.engine.isPlaying());

  patternBars = 4;
  stepRange = Array.from({ length: 64 }, (_, i) => i);

  pads = signal<DrumPad[]>([
    {
      id: '1',
      name: 'KICK',
      midi: 36,
      color: '#ff4d4d',
      type: 'kick',
      steps: this.initSteps(),
      params: { semitone: 0 },
    },
    {
      id: '2',
      name: 'SNARE',
      midi: 38,
      color: '#ff944d',
      type: 'snare',
      steps: this.initSteps(),
      params: { semitone: 0 },
    },
    {
      id: '3',
      name: 'CLAP',
      midi: 39,
      color: '#ffdb4d',
      type: 'clap',
      steps: this.initSteps(),
      params: { semitone: 0 },
    },
    {
      id: '4',
      name: 'CH',
      midi: 42,
      color: '#4dff88',
      type: 'closed-hat',
      steps: this.initSteps(),
      params: { semitone: 0 },
    },
    {
      id: '5',
      name: 'OH',
      midi: 46,
      color: '#4dffff',
      type: 'open-hat',
      steps: this.initSteps(),
      params: { semitone: 0 },
    },
    {
      id: '6',
      name: 'TOM L',
      midi: 40,
      color: '#4d88ff',
      type: 'tom',
      steps: this.initSteps(),
      params: { semitone: 0 },
    },
    {
      id: '7',
      name: 'TOM M',
      midi: 43,
      color: '#944dff',
      type: 'tom',
      steps: this.initSteps(),
      params: { semitone: 0 },
    },
    {
      id: '8',
      name: 'TOM H',
      midi: 47,
      color: '#ff4dff',
      type: 'tom',
      steps: this.initSteps(),
      params: { semitone: 0 },
    },
    {
      id: '9',
      name: 'COWBELL',
      midi: 56,
      color: '#ffffff',
      type: 'cowbell',
      steps: this.initSteps(),
      params: { semitone: 0 },
    },
    {
      id: '10',
      name: 'SHAKER',
      midi: 70,
      color: '#aaaaaa',
      type: 'shaker',
      steps: this.initSteps(),
      params: { semitone: 0 },
    },
    {
      id: '11',
      name: 'RIDE',
      midi: 51,
      color: '#ffff00',
      type: 'ride',
      steps: this.initSteps(),
      params: { semitone: 0 },
    },
    {
      id: '12',
      name: 'RIM',
      midi: 37,
      color: '#888888',
      type: 'rim',
      steps: this.initSteps(),
      params: { semitone: 0 },
    },
  ]);

  selectedPad = signal<DrumPad | null>(null);
  isGeneratingPattern = signal(false);
  isGenerating = this.isGeneratingPattern;
  micStatus = signal('idle');

  private initSteps(): DrumStep[] {
    return Array.from({ length: 64 }, () => ({ active: false, velocity: 0.8 }));
  }

  ngAfterViewInit() {
    this.selectedPad.set(this.pads()[0]);
  }

  ngOnDestroy() {}

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
      0.1,
      1,
      0,
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

  async generateAiPattern() {
    this.isGeneratingPattern.set(true);
    const genre = await this.aiService.generateAiResponse('suggest drum genre');
    await new Promise((resolve) => setTimeout(resolve, 1000));

    if (genre.includes('house')) {
      this.pads.update((ps) =>
        ps.map((p) => {
          if (p.name === 'KICK') {
            const newSteps = [...p.steps];
            for (let i = 0; i < 64; i += 4) newSteps[i].active = true;
            return { ...p, steps: newSteps };
          }
          return p;
        })
      );
    }
    this.syncToMusicManager();
    this.isGeneratingPattern.set(false);
  }

  async generateQuantumGroove() {
    return this.generateAiPattern();
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
        if (t.id === trackId) return { ...t, notes: allNotes };
        return t;
      })
    );
  }

  hasQuantumDrumEngine() {
    return this.aiService.isUnlocked('upg-quantum-drum-engine');
  }

  isStepActive(midi: number, step: number) {
    const pad = this.pads().find((p) => p.midi === midi);
    return pad ? pad.steps[step].active : false;
  }
}
