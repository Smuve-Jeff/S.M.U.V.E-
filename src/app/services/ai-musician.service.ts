import { Injectable, signal, inject, OnDestroy } from '@angular/core';
import { AudioEngineService } from './audio-engine.service';

@Injectable({ providedIn: 'root' })
export class AiMusicianService implements OnDestroy {
  private audioEngine = inject(AudioEngineService);

  bassistEnabled = signal(false);
  drummerEnabled = signal(false);
  keyboardistEnabled = signal(false);

  private boundTick: (stepIndex: number, when: number, stepDur: number) => void;

  constructor() {
    this.boundTick = this.tick.bind(this);
    this.audioEngine.addScheduleListener(this.boundTick);
  }

  ngOnDestroy() {
    this.audioEngine.removeScheduleListener(this.boundTick);
  }

  setBassistEnabled(enabled: boolean) {
    this.bassistEnabled.set(enabled);
  }

  setDrummerEnabled(enabled: boolean) {
    this.drummerEnabled.set(enabled);
  }

  setKeyboardistEnabled(enabled: boolean) {
    this.keyboardistEnabled.set(enabled);
  }

  private tick(stepIndex: number, when: number, stepDur: number) {
    if (this.bassistEnabled()) this.playBassist(stepIndex, when, stepDur);
    if (this.drummerEnabled()) this.playDrummer(stepIndex, when, stepDur);
    if (this.keyboardistEnabled()) this.playKeyboardist(stepIndex, when, stepDur);
  }

  private playBassist(stepIndex: number, when: number, stepDur: number) {
    // Bass plays on 1, 3, 4.5, 7, 9, 11, 12.5, 15 (syncopated)
    const pattern = [0, 2, 4, 7, 8, 10, 12, 14];
    if (pattern.includes(stepIndex % 16)) {
      const root = 36; // C1
      const notes = [0, 3, 5, 7, 10]; // minor pentatonic
      const note = root + notes[Math.floor(Math.random() * notes.length)];
      this.audioEngine.playSynth(
        when,
        this.audioEngine.midiToFreq(note),
        stepDur * 0.8,
        0.8,
        -0.2,
        0.7,
        0.1,
        0,
        {
          type: 'sine',
          attack: 0.01,
          decay: 0.1,
          sustain: 0.6,
          release: 0.2,
          cutoff: 400,
        }
      );
    }
  }

  private playDrummer(stepIndex: number, when: number, stepDur: number) {
    // Basic Boom-Bap patterns
    const kickSteps = [0, 8, 10];
    const snareSteps = [4, 12];
    const hatSteps = [0, 2, 4, 6, 8, 10, 12, 14];

    const idx = stepIndex % 16;
    if (kickSteps.includes(idx)) {
      this.audioEngine.playSynth(when, 60, 0.1, 1.0, 0, 0.8, 0, 0, {
        type: 'sine',
        attack: 0.001,
        decay: 0.1,
        release: 0.1,
        cutoff: 100,
      });
    }
    if (snareSteps.includes(idx)) {
      this.audioEngine.playSynth(when, 200, 0.1, 0.8, 0, 0.6, 0.1, 0, {
        type: 'square',
        attack: 0.001,
        decay: 0.05,
        release: 0.05,
        cutoff: 1000,
      });
    }
    if (hatSteps.includes(idx)) {
      this.audioEngine.playSynth(when, 8000, 0.02, 0.5, 0.3, 0.3, 0.2, 0, {
        type: 'triangle',
        attack: 0.001,
        decay: 0.01,
        release: 0.01,
        cutoff: 12000,
      });
    }
  }

  private playKeyboardist(stepIndex: number, when: number, stepDur: number) {
    // Chords on 0, 8
    if (stepIndex % 8 === 0) {
      const root = 60; // C3
      [0, 3, 7, 10].forEach((interval) => {
        this.audioEngine.playSynth(
          when,
          this.audioEngine.midiToFreq(root + interval),
          stepDur * 4,
          0.5,
          0.4,
          0.4,
          0.3,
          0.2,
          {
            type: 'sawtooth',
            attack: 0.1,
            decay: 0.3,
            sustain: 0.5,
            release: 1.0,
            cutoff: 2000,
          }
        );
      });
    }
  }
}
