import { AiService } from '../services/ai.service';
import { LoggingService } from '../services/logging.service';
import { Injectable, signal, computed, inject } from '@angular/core';
import { InstrumentsService } from '../services/instruments.service';
import { AudioEngineService } from '../services/audio-engine.service';

export interface SequencerNote {
  id: string;
  pitch: number;
  startTime: number;
  duration: number;
  velocity: number;
}

export interface SequencerTrack {
  id: string;
  name: string;
  instrumentId: string;
  volume: number;
  pan: number;
  mute: boolean;
  solo: boolean;
  notes: SequencerNote[];
  steps: boolean[];
  stepProbability: number[];
  ratchets: number[];
  trackLength: number;
  velocityCurve: 'flat' | 'ascending' | 'descending' | 'accented';
  humanize: number;
}

export interface SequencerPattern {
  id: string;
  name: string;
  length: number;
  tracks: SequencerTrack[];
  swing: number;
}

export interface PatternVariation {
  id: string;
  patternId: string;
  name: string;
  patternSnapshot: SequencerPattern;
}

export interface PatternScene {
  id: string;
  name: string;
  patternId: string;
  variationId?: string;
}

@Injectable({
  providedIn: 'root',
})
export class SequencerService {
  private aiService = inject(AiService);
  private logger = inject(LoggingService);
  private instrumentsService = inject(InstrumentsService);
  private engine = inject(AudioEngineService);

  patterns = signal<SequencerPattern[]>([]);
  activePatternIndex = signal(0);
  activePattern = computed(() => this.patterns()[this.activePatternIndex()]);

  selectedTrackId = signal<string | null>(null);

  variations = signal<PatternVariation[]>([]);
  scenes = signal<PatternScene[]>([]);

  constructor() {
    this.initializeDefaultProject();

    this.engine.onScheduleStep = (stepIndex, when, stepDur) => {
      this.scheduleTick(stepIndex, when, stepDur);
    };
  }

  private initializeDefaultProject() {
    const defaultPattern: SequencerPattern = {
      id: 'p-1',
      name: 'Initial Groove',
      length: 64,
      tracks: [
        this.createTrack(
          'Kick',
          'drum-kit-1',
          36,
          [0, 8, 16, 24, 32, 40, 48, 56]
        ),
        this.createTrack(
          'Snare',
          'drum-kit-1',
          38,
          [4, 12, 20, 28, 36, 44, 52, 60]
        ),
        this.createTrack(
          'Hi-Hat',
          'drum-kit-1',
          42,
          Array.from({ length: 32 }, (_, i) => i * 2)
        ),
      ],
      swing: 0,
    };
    this.patterns.set([defaultPattern]);
  }

  private createTrack(
    name: string,
    instrumentId: string,
    basePitch: number,
    initialSteps: number[]
  ): SequencerTrack {
    const steps = new Array(64).fill(false);
    const notes: SequencerNote[] = [];

    initialSteps.forEach((s) => {
      if (s >= 0 && s < 64) {
        steps[s] = true;
        notes.push({
          id: this.nextId('seq-note'),
          pitch: basePitch,
          startTime: s,
          duration: 1,
          velocity: 0.8,
        });
      }
    });

    return {
      id: this.nextId('seq-track'),
      name,
      instrumentId,
      volume: 80,
      pan: 0,
      mute: false,
      solo: false,
      notes,
      steps,
      stepProbability: new Array(64).fill(1.0),
      ratchets: new Array(64).fill(1),
      trackLength: 64,
      velocityCurve: 'flat',
      humanize: 0,
    };
  }

  private nextId(prefix: string): string {
    return `${prefix}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private clonePattern(p: SequencerPattern): SequencerPattern {
    return {
      ...p,
      id: this.nextId('p'),
      tracks: p.tracks.map((t) => ({
        ...t,
        id: this.nextId('seq-track'),
        notes: t.notes.map((n) => ({ ...n, id: this.nextId('seq-note') })),
        steps: [...t.steps],
        stepProbability: [...t.stepProbability],
        ratchets: [...t.ratchets],
      })),
    };
  }

  toggleStep(trackId: string, stepIndex: number) {
    this.patterns.update((ps) => {
      const newPs = [...ps];
      const pattern = newPs[this.activePatternIndex()];
      const track = pattern.tracks.find((t) => t.id === trackId);
      if (track) {
        track.steps[stepIndex] = !track.steps[stepIndex];
        if (track.steps[stepIndex]) {
          track.notes.push({
            id: this.nextId('seq-note'),
            pitch: this.getDefaultPitchForTrack(track),
            startTime: stepIndex,
            duration: 1,
            velocity: 0.8,
          });
        } else {
          track.notes = track.notes.filter((n) => n.startTime !== stepIndex);
        }
      }
      return newPs;
    });
  }

  private getDefaultPitchForTrack(track: SequencerTrack): number {
    if (track.instrumentId.includes('kit')) {
      if (track.name.toLowerCase() === 'kick') return 36;
      if (track.name.toLowerCase() === 'snare') return 38;
      if (track.name.toLowerCase() === 'hi-hat') return 42;
    }
    return 60;
  }

  addTrack(name: string, instrumentId: string) {
    this.patterns.update((ps) => {
      const newPs = [...ps];
      const pattern = newPs[this.activePatternIndex()];
      pattern.tracks.push(this.createTrack(name, instrumentId, 60, []));
      return newPs;
    });
  }

  setSwing(value: number) {
    const swing = Math.max(0, Math.min(0.5, value));
    this.patterns.update((ps) => {
      const next = [...ps];
      const pattern = next[this.activePatternIndex()];
      if (pattern) {
        pattern.swing = swing;
      }
      return next;
    });
  }

  setTrackHumanize(trackId: string, amount: number) {
    this.patchTrack(trackId, { humanize: Math.max(0, Math.min(1, amount)) });
  }

  setTrackLength(trackId: string, trackLength: number) {
    this.patchTrack(trackId, {
      trackLength: Math.max(1, Math.min(64, Math.floor(trackLength))),
    });
  }

  setVelocityCurve(trackId: string, curve: SequencerTrack['velocityCurve']) {
    this.patchTrack(trackId, { velocityCurve: curve });
  }

  setStepProbability(trackId: string, stepIndex: number, probability: number) {
    this.patterns.update((ps) => {
      const next = [...ps];
      const pattern = next[this.activePatternIndex()];
      const track = pattern?.tracks.find((t) => t.id === trackId);
      if (track && stepIndex >= 0 && stepIndex < track.stepProbability.length) {
        track.stepProbability[stepIndex] = Math.max(
          0,
          Math.min(1, probability)
        );
      }
      return next;
    });
  }

  setRatchet(trackId: string, stepIndex: number, repeats: number) {
    this.patterns.update((ps) => {
      const next = [...ps];
      const pattern = next[this.activePatternIndex()];
      const track = pattern?.tracks.find((t) => t.id === trackId);
      if (track && stepIndex >= 0 && stepIndex < track.ratchets.length) {
        track.ratchets[stepIndex] = Math.max(
          1,
          Math.min(8, Math.floor(repeats))
        );
      }
      return next;
    });
  }

  removeTrack(trackId: string) {
    this.patterns.update((ps) => {
      const newPs = [...ps];
      const pattern = newPs[this.activePatternIndex()];
      pattern.tracks = pattern.tracks.filter((t) => t.id !== trackId);
      if (this.selectedTrackId() === trackId) this.selectedTrackId.set(null);
      return newPs;
    });
  }

  updateNote(trackId: string, noteId: string, patch: Partial<SequencerNote>) {
    this.patterns.update((ps) => {
      const newPs = [...ps];
      const pattern = newPs[this.activePatternIndex()];
      const track = pattern.tracks.find((t) => t.id === trackId);
      if (track) {
        const noteIndex = track.notes.findIndex((n) => n.id === noteId);
        if (noteIndex !== -1) {
          track.notes[noteIndex] = { ...track.notes[noteIndex], ...patch };
          this.refreshSteps(track);
        }
      }
      return newPs;
    });
  }

  addNote(trackId: string, note: Omit<SequencerNote, 'id'>) {
    this.patterns.update((ps) => {
      const newPs = [...ps];
      const pattern = newPs[this.activePatternIndex()];
      const track = pattern.tracks.find((t) => t.id === trackId);
      if (track) {
        track.notes.push({
          ...note,
          id: this.nextId('seq-note'),
        });
        this.refreshSteps(track);
      }
      return newPs;
    });
  }

  deleteNote(trackId: string, noteId: string) {
    this.patterns.update((ps) => {
      const newPs = [...ps];
      const pattern = newPs[this.activePatternIndex()];
      const track = pattern.tracks.find((t) => t.id === trackId);
      if (track) {
        track.notes = track.notes.filter((n) => n.id !== noteId);
        this.refreshSteps(track);
      }
      return newPs;
    });
  }

  private refreshSteps(track: SequencerTrack) {
    const newSteps = new Array(64).fill(false);
    track.notes.forEach((n) => {
      if (n.startTime >= 0 && n.startTime < 64) {
        newSteps[n.startTime] = true;
      }
    });
    track.steps = newSteps;
  }

  selectTrack(trackId: string) {
    this.logger.info('SequencerService: selectTrack', trackId);
    this.selectedTrackId.set(trackId);
  }

  scheduleTick(stepIndex: number, when: number, stepDur: number) {
    const pattern = this.activePattern();
    if (!pattern) return;
    const activeStep =
      ((stepIndex % pattern.length) + pattern.length) % pattern.length;

    this.handleAiMusicians(activeStep, when, stepDur);

    pattern.tracks.forEach((track) => {
      if (track.mute) return;
      const localStep =
        ((activeStep % track.trackLength) + track.trackLength) %
        track.trackLength;
      const notesToPlay = track.notes.filter((n) => n.startTime === localStep);
      notesToPlay.forEach((note) => {
        const probability = track.stepProbability[localStep] ?? 1;
        if (Math.random() > probability) return;
        const ratchetCount = Math.max(1, track.ratchets[localStep] ?? 1);
        const ratchetDur = stepDur / ratchetCount;
        for (let r = 0; r < ratchetCount; r++) {
          const swingOffset =
            pattern.swing > 0 && localStep % 2 === 1
              ? ratchetDur * pattern.swing
              : 0;
          const jitter =
            (Math.random() - 0.5) * track.humanize * ratchetDur * 0.5;
          const timeOffset = r * ratchetDur + swingOffset + jitter;
          this.playNote(track, note, when + timeOffset, ratchetDur, localStep);
        }
      });
    });
  }

  private playNote(
    track: SequencerTrack,
    note: SequencerNote,
    when: number,
    stepDur: number,
    stepIndex = note.startTime
  ) {
    const freq = 440 * Math.pow(2, (note.pitch - 69) / 12);
    const duration = note.duration * stepDur;
    const velocity =
      note.velocity *
      (track.volume / 100) *
      this.getVelocityCurveScale(track, stepIndex);
    const pan = track.pan / 100;

    const preset = this.instrumentsService
      .getPresets()
      .find((p) => p.id === track.instrumentId);

    if (preset?.type === 'synth') {
      this.engine.playSynth(
        when,
        freq,
        duration,
        velocity,
        pan,
        0.6,
        0.1,
        0.05,
        preset.synth
      );
    } else {
      this.engine.playSynth(when, freq, duration, velocity, pan);
    }
  }

  private getVelocityCurveScale(track: SequencerTrack, stepIndex: number) {
    const ratio =
      track.trackLength > 1 ? stepIndex / (track.trackLength - 1) : 0;
    if (track.velocityCurve === 'ascending') return 0.7 + ratio * 0.5;
    if (track.velocityCurve === 'descending') return 1.2 - ratio * 0.5;
    if (track.velocityCurve === 'accented')
      return stepIndex % 4 === 0 ? 1.2 : 0.85;
    return 1;
  }

  private patchTrack(trackId: string, patch: Partial<SequencerTrack>) {
    this.patterns.update((ps) => {
      const next = [...ps];
      const pattern = next[this.activePatternIndex()];
      const idx = pattern?.tracks.findIndex((t) => t.id === trackId) ?? -1;
      if (pattern && idx >= 0) {
        pattern.tracks[idx] = { ...pattern.tracks[idx], ...patch };
      }
      return next;
    });
  }

  createVariation(name: string) {
    const pattern = this.activePattern();
    if (!pattern) return null;
    const variation: PatternVariation = {
      id: this.nextId('seq-variation'),
      patternId: pattern.id,
      name,
      patternSnapshot: this.clonePattern(pattern),
    };
    this.variations.update((vars) => [...vars, variation]);
    return variation;
  }

  applyVariation(variationId: string) {
    const variation = this.variations().find((v) => v.id === variationId);
    if (!variation) return;
    this.patterns.update((ps) =>
      ps.map((pattern, idx) =>
        idx === this.activePatternIndex()
          ? this.clonePattern(variation.patternSnapshot)
          : pattern
      )
    );
  }

  randomizeVariation(variationId: string, intensity = 0.3) {
    this.variations.update((vars) =>
      vars.map((variation) => {
        if (variation.id !== variationId) return variation;
        const next = this.clonePattern(variation.patternSnapshot);
        next.tracks.forEach((track) => {
          track.notes = track.notes.map((note) => ({
            ...note,
            velocity: Math.max(
              0.1,
              Math.min(1, note.velocity + (Math.random() - 0.5) * intensity)
            ),
          }));
          track.stepProbability = track.stepProbability.map((p) =>
            Math.max(0.2, Math.min(1, p + (Math.random() - 0.5) * intensity))
          );
        });
        return { ...variation, patternSnapshot: next };
      })
    );
  }

  createScene(name: string, patternId: string, variationId?: string) {
    const scene: PatternScene = {
      id: this.nextId('seq-scene'),
      name,
      patternId,
      variationId,
    };
    this.scenes.update((items) => [...items, scene]);
    return scene;
  }

  triggerScene(sceneId: string) {
    const scene = this.scenes().find((item) => item.id === sceneId);
    if (!scene) return;
    const patternIdx = this.patterns().findIndex(
      (p) => p.id === scene.patternId
    );
    if (patternIdx >= 0) this.activePatternIndex.set(patternIdx);
    if (scene.variationId) this.applyVariation(scene.variationId);
  }

  private handleAiMusicians(stepIndex: number, when: number, stepDur: number) {
    if (this.aiService.isAIDrummerActive() && stepIndex % 4 === 0) {
      const midi = stepIndex % 8 === 0 ? 36 : 38;
      this.engine.playSynth(
        when,
        440 * Math.pow(2, (midi - 69) / 12),
        stepDur * 0.5,
        0.8,
        0
      );
    }

    if (this.aiService.isAIBassistActive() && stepIndex % 2 === 0) {
      const notes = [36, 39, 41, 43];
      const midi = notes[Math.floor(stepIndex / 2) % notes.length];
      this.engine.playSynth(
        when,
        440 * Math.pow(2, (midi - 69) / 12),
        stepDur * 1.5,
        0.7,
        -0.1
      );
    }

    if (this.aiService.isAIKeyboardistActive() && Math.random() > 0.7) {
      const midi = 60 + Math.floor(Math.random() * 12);
      this.engine.playSynth(
        when,
        440 * Math.pow(2, (midi - 69) / 12),
        stepDur * 2,
        0.5,
        0.2
      );
    }
  }
}
