import { LoggingService } from '../services/logging.service';
import { Injectable, signal, computed, inject } from '@angular/core';
import {
  InstrumentsService,
  InstrumentPreset,
} from '../services/instruments.service';
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
  sceneId?: string;
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
  private logger = inject(LoggingService);
  private readonly instrumentsService = inject(InstrumentsService);
  private readonly engine = inject(AudioEngineService);
  private idCounter = 0;

  patterns = signal<SequencerPattern[]>([]);
  variations = signal<PatternVariation[]>([]);
  scenes = signal<PatternScene[]>([]);
  activePatternIndex = signal(0);
  selectedTrackId = signal<string | null>(null);

  activePattern = computed(() => {
    const ps = this.patterns();
    return ps.length > 0 ? ps[this.activePatternIndex()] : null;
  });

  selectedTrack = computed(() => {
    const pattern = this.activePattern();
    const id = this.selectedTrackId();
    if (!pattern || !id) return null;
    return pattern.tracks.find((t) => t.id === id) || null;
  });

  constructor() {
    this.initDefaultPattern();
    this.engine.onScheduleStep = (stepIndex, when, stepDur) => {
      this.scheduleTick(stepIndex, when, stepDur);
    };
  }

  private nextId(prefix: string): string {
    this.idCounter += 1;
    return `${prefix}-${Date.now().toString(36)}-${this.idCounter.toString(36)}`;
  }

  private clonePattern(pattern: SequencerPattern): SequencerPattern {
    return {
      ...pattern,
      tracks: pattern.tracks.map((track) => ({
        ...track,
        notes: track.notes.map((note) => ({ ...note })),
        steps: [...track.steps],
        stepProbability: [...track.stepProbability],
        ratchets: [...track.ratchets],
      })),
    };
  }

  private initDefaultPattern() {
    const defaultTracks: SequencerTrack[] = [
      this.createTrack('Kick', 'kit-808', 36, [
        true,
        false,
        false,
        false,
        true,
        false,
        false,
        false,
        true,
        false,
        false,
        false,
        true,
        false,
        false,
        false,
      ]),
      this.createTrack('Snare', 'kit-808', 38, [
        false,
        false,
        false,
        false,
        true,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        true,
        false,
        false,
        false,
      ]),
      this.createTrack('Hi-Hat', 'kit-808', 42, [
        true,
        true,
        true,
        true,
        true,
        true,
        true,
        true,
        true,
        true,
        true,
        true,
        true,
        true,
        true,
        true,
      ]),
      this.createTrack('Bass', 'synth-lead', 36, [
        true,
        false,
        true,
        false,
        false,
        false,
        false,
        false,
        true,
        false,
        true,
        false,
        false,
        false,
        false,
        false,
      ]),
    ];

    const pattern: SequencerPattern = {
      id: 'p1',
      name: 'Pattern 1',
      length: 64,
      tracks: defaultTracks,
      swing: 0,
    };

    this.patterns.set([pattern]);
    this.createScene('Scene 1', pattern.id);
  }

  private createTrack(
    name: string,
    instrumentId: string,
    defaultPitch: number,
    steps: boolean[]
  ): SequencerTrack {
    const notes: SequencerNote[] = [];
    steps.forEach((active, i) => {
      if (active) {
        notes.push({
          id: this.nextId('seq-note'),
          pitch: defaultPitch,
          startTime: i,
          duration: 1,
          velocity: 0.8,
        });
      }
    });

    const fullSteps = new Array(64).fill(false);
    steps.forEach((v, i) => {
      if (i < 64) fullSteps[i] = v;
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
      steps: fullSteps,
      stepProbability: new Array(64).fill(1),
      ratchets: new Array(64).fill(1),
      trackLength: 64,
      velocityCurve: 'flat',
      humanize: 0,
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
}
