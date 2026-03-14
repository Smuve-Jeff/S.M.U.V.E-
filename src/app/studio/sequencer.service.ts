import { LoggingService } from '../services/logging.service';
import { Injectable, signal, computed, inject } from '@angular/core';
import { InstrumentsService, InstrumentPreset } from '../services/instruments.service';
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
}

export interface SequencerPattern {
  id: string;
  name: string;
  length: number;
  tracks: SequencerTrack[];
}

@Injectable({
  providedIn: 'root'
})
export class SequencerService {
  private logger = inject(LoggingService);
  private readonly instrumentsService = inject(InstrumentsService);
  private readonly engine = inject(AudioEngineService);

  patterns = signal<SequencerPattern[]>([]);
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
    return pattern.tracks.find(t => t.id === id) || null;
  });

  constructor() {
    this.initDefaultPattern();
    this.engine.onScheduleStep = (stepIndex, when, stepDur) => {
      this.scheduleTick(stepIndex, when, stepDur);
    };
  }

  private initDefaultPattern() {
    const defaultTracks: SequencerTrack[] = [
      this.createTrack('Kick', 'kit-808', 36, [true, false, false, false, true, false, false, false, true, false, false, false, true, false, false, false]),
      this.createTrack('Snare', 'kit-808', 38, [false, false, false, false, true, false, false, false, false, false, false, false, true, false, false, false]),
      this.createTrack('Hi-Hat', 'kit-808', 42, [true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true]),
      this.createTrack('Bass', 'synth-lead', 36, [true, false, true, false, false, false, false, false, true, false, true, false, false, false, false, false]),
    ];

    const pattern: SequencerPattern = {
      id: 'p1',
      name: 'Pattern 1',
      length: 64,
      tracks: defaultTracks
    };

    this.patterns.set([pattern]);
  }

  private createTrack(name: string, instrumentId: string, defaultPitch: number, steps: boolean[]): SequencerTrack {
    const notes: SequencerNote[] = [];
    steps.forEach((active, i) => {
      if (active) {
        notes.push({
          id: Math.random().toString(36).substring(7),
          pitch: defaultPitch,
          startTime: i,
          duration: 1,
          velocity: 0.8
        });
      }
    });

    const fullSteps = new Array(64).fill(false);
    steps.forEach((v, i) => { if (i < 64) fullSteps[i] = v; });

    return {
      id: Math.random().toString(36).substring(7),
      name,
      instrumentId,
      volume: 80,
      pan: 0,
      mute: false,
      solo: false,
      notes,
      steps: fullSteps
    };
  }

  toggleStep(trackId: string, stepIndex: number) {
    this.patterns.update(ps => {
      const newPs = [...ps];
      const pattern = newPs[this.activePatternIndex()];
      const track = pattern.tracks.find(t => t.id === trackId);
      if (track) {
        track.steps[stepIndex] = !track.steps[stepIndex];
        if (track.steps[stepIndex]) {
          track.notes.push({
            id: Math.random().toString(36).substring(7),
            pitch: this.getDefaultPitchForTrack(track),
            startTime: stepIndex,
            duration: 1,
            velocity: 0.8
          });
        } else {
          track.notes = track.notes.filter(n => n.startTime !== stepIndex);
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
    this.patterns.update(ps => {
      const newPs = [...ps];
      const pattern = newPs[this.activePatternIndex()];
      pattern.tracks.push(this.createTrack(name, instrumentId, 60, []));
      return newPs;
    });
  }

  removeTrack(trackId: string) {
    this.patterns.update(ps => {
      const newPs = [...ps];
      const pattern = newPs[this.activePatternIndex()];
      pattern.tracks = pattern.tracks.filter(t => t.id !== trackId);
      if (this.selectedTrackId() === trackId) this.selectedTrackId.set(null);
      return newPs;
    });
  }

  updateNote(trackId: string, noteId: string, patch: Partial<SequencerNote>) {
     this.patterns.update(ps => {
      const newPs = [...ps];
      const pattern = newPs[this.activePatternIndex()];
      const track = pattern.tracks.find(t => t.id === trackId);
      if (track) {
        const noteIndex = track.notes.findIndex(n => n.id === noteId);
        if (noteIndex !== -1) {
          track.notes[noteIndex] = { ...track.notes[noteIndex], ...patch };
          this.refreshSteps(track);
        }
      }
      return newPs;
    });
  }

  addNote(trackId: string, note: Omit<SequencerNote, 'id'>) {
    this.patterns.update(ps => {
      const newPs = [...ps];
      const pattern = newPs[this.activePatternIndex()];
      const track = pattern.tracks.find(t => t.id === trackId);
      if (track) {
        track.notes.push({ ...note, id: Math.random().toString(36).substring(7) });
        this.refreshSteps(track);
      }
      return newPs;
    });
  }

  deleteNote(trackId: string, noteId: string) {
    this.patterns.update(ps => {
      const newPs = [...ps];
      const pattern = newPs[this.activePatternIndex()];
      const track = pattern.tracks.find(t => t.id === trackId);
      if (track) {
        track.notes = track.notes.filter(n => n.id !== noteId);
        this.refreshSteps(track);
      }
      return newPs;
    });
  }

  private refreshSteps(track: SequencerTrack) {
    const newSteps = new Array(64).fill(false);
    track.notes.forEach(n => {
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

    pattern.tracks.forEach(track => {
      if (track.mute) return;
      const notesToPlay = track.notes.filter(n => n.startTime === stepIndex);
      notesToPlay.forEach(note => {
        this.playNote(track, note, when, stepDur);
      });
    });
  }

  private playNote(track: SequencerTrack, note: SequencerNote, when: number, stepDur: number) {
    const freq = 440 * Math.pow(2, (note.pitch - 69) / 12);
    const duration = note.duration * stepDur;
    const velocity = note.velocity * (track.volume / 100);
    const pan = track.pan / 100;

    const preset = this.instrumentsService.getPresets().find(p => p.id === track.instrumentId);

    if (preset?.type === 'synth') {
      this.engine.playSynth(when, freq, duration, velocity, pan, 0.6, 0.1, 0.05, preset.synth);
    } else {
      this.engine.playSynth(when, freq, duration, velocity, pan);
    }
  }
}
