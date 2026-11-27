import { Injectable, signal, inject } from '@angular/core';
import { Subject } from 'rxjs';
import * as Tone from 'tone';
import { LoggingService } from './logging.service';
import { InstrumentsService, InstrumentPreset, sampleZoneRoot } from './instruments.service';
import { AudioEngineService } from './audio-engine.service';
import { HardwareService } from './hardware.service';
import { isLiveArpRate } from './live-rig.util';

export type LiveInstrumentType = string;
export type LiveScaleMode =
  | 'major'
  | 'minor'
  | 'dorian'
  | 'phrygian'
  | 'lydian'
  | 'mixolydian'
  | 'locrian'
  | 'harmonicMinor'
  | 'blues'
  | 'pentatonic';

/** Semitone offsets for each scale the Performer's Scale Lock offers. */
export const LIVE_SCALE_INTERVALS: Record<LiveScaleMode, number[]> = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  locrian: [0, 1, 3, 5, 6, 8, 10],
  harmonicMinor: [0, 2, 3, 5, 7, 8, 11],
  blues: [0, 3, 5, 6, 7, 10],
  pentatonic: [0, 2, 4, 7, 9],
};

/** Root pitch classes Scale Lock can transpose to, in display order. */
export type LiveArpPattern = 'up' | 'down' | 'upDown' | 'random';

/**
 * The singer's live rig, stored with the set: chord mode, the scale lock and
 * its root, note repeat, octave and the chord-stamp type.
 */
export interface LivePerformanceState {
  smartChords: boolean;
  scaleLock: boolean;
  scaleMode: LiveScaleMode;
  scaleRoot: number;
  arpEnabled: boolean;
  arpRate: string;
  arpPattern: LiveArpPattern;
  arpLatch: boolean;
  arpSwing: number;
  octave: number;
  chordType: string;
}

export const SCALE_ROOTS: { pc: number; label: string }[] = [
  { pc: 0, label: 'C' },
  { pc: 1, label: 'C#' },
  { pc: 2, label: 'D' },
  { pc: 3, label: 'D#' },
  { pc: 4, label: 'E' },
  { pc: 5, label: 'F' },
  { pc: 6, label: 'F#' },
  { pc: 7, label: 'G' },
  { pc: 8, label: 'G#' },
  { pc: 9, label: 'A' },
  { pc: 10, label: 'A#' },
  { pc: 11, label: 'B' },
];

/** Where a sounded note came from: the key, its Smart Chord, or Note Repeat. */
export type LiveNoteSource = 'key' | 'chord' | 'repeat';

/**
 * A note the engine actually sounded. Smart Chords and Note Repeat generate
 * notes *inside* the engine, so a recorder that only watches key presses hears
 * one note where the artist heard a chord or a pattern. Everything that records
 * live playing subscribes to `noteEvents$` instead.
 */
export interface LiveNoteEvent {
  type: 'on' | 'off';
  /** MIDI number of the sounded pitch, after Scale Lock and chord generation. */
  midi: number;
  /** Tone note name of the sounded pitch (`C4`, `D#3`). */
  note: string;
  velocity: number;
  channel: number;
  /** Monotonic capture time, on the same clock as `performance.now()`. */
  atMs: number;
  source: LiveNoteSource;
  /** Set for one-shot repeats, whose duration is known when they start. */
  durationMs?: number;
}

interface MpeVoice {
  key: string;
  channel: number;
  midi: number;
  node: Tone.Synth | Tone.Sampler;
  gain: Tone.Gain;
  release: number;
  disposed: boolean;
}

@Injectable({
  providedIn: 'root',
})
export class LiveEngineService {
  private logger = inject(LoggingService);
  private instrumentsService = inject(InstrumentsService);
  private audioEngine = inject(AudioEngineService);
  private hardwareService = inject(HardwareService);

  private currentInstrumentNode:
    | Tone.PolySynth
    | Tone.Sampler
    | Tone.MonoSynth
    | Tone.FMSynth
    | null = null;
  private activePreset: InstrumentPreset | null = null;
  private filterNode: Tone.Filter | null = null;
  /**
   * The live instrument's own output stage. It feeds a project channel when the
   * host names one, so performer notes get that channel's fader, pan, inserts
   * and sends — not a private path from `Tone.getDestination()` that skipped
   * the master chain entirely.
   */
  private outputNode: Tone.Gain | null = null;
  /** Master pan for the live instrument, between the filter and the output. */
  private panNode: Tone.Panner | null = null;
  private outputTarget: AudioNode | null = null;

  activeInstrument = signal<LiveInstrumentType>('grand-piano');
  isInitialized = signal(false);
  midiEnabled = signal(false);
  availableMidiInputs = signal<string[]>([]);

  /** One independent instrument voice per MPE member channel + note. */
  private mpeVoices = new Map<string, MpeVoice>();
  /** Last normalized bend per MIDI channel (0 = master). */
  private channelBends = new Map<number, number>();
  /** Last normalized pressure per MIDI channel (0 = master). */
  private channelPressures = new Map<number, number>();
  /** MPE member-channel bend range in semitones (MPE default: 48). */
  private mpeBendRange = 48;
  /** Sample map used to build a fresh MPE sampler per note. */
  private sampleMap: Record<string, string> | null = null;

  /** Live glide between legato notes in seconds (0 = off). The 808 feel. */
  portamento = signal(0);

  /**
   * The live filter and envelope the Performer rack edits. These are the
   * instrument's *actual* patch values, not UI defaults: `setInstrument`
   * seeds them from the preset, so a knob never lies about the sound.
   */
  cutoff = signal(20000);
  resonance = signal(1);
  attack = signal(0.01);
  release = signal(0.5);
  /** Live output trim and pan (MIDI CC7 / CC10). */
  instrumentVolume = signal(1);
  instrumentPan = signal(0);

  // AI Assisted Performance State. Scale Lock ships off: it changes which
  // pitches a key produces, so it must be an opt-in the artist turns on.
  scaleLock = signal(false);
  currentScale = signal<number[]>([0, 2, 4, 5, 7, 9, 11]); // C Major
  scaleMode = signal<LiveScaleMode>('major');
  /** Root pitch class the scale is built on (0 = C). */
  scaleRoot = signal(0);
  smartChords = signal(false);
  /** Last channel/polyphonic pressure, normalized 0..1. */
  aftertouch = signal(0);

  // Arpeggiator State
  arpeggiatorEnabled = signal(false);
  arpeggiatorRate = signal('8n');
  arpeggiatorPattern = signal<LiveArpPattern>('up');
  /** Keep repeating after the key lifts until repeat is switched off. */
  arpeggiatorLatch = signal(false);
  /** 0 = straight, 0..0.75 delays every second repeat. */
  arpeggiatorSwing = signal(0);
  /** Recursive timeout so swing can vary each interval. */
  private arpTimer: ReturnType<typeof setTimeout> | null = null;
  private arpStep = 0;
  /** Notes currently arpeggiated, in press order. */
  private heldNotes: string[] = [];
  private heldVelocity = 0.8;
  /** Chord tones triggered for a held key, so its release ends every voice. */
  private chordNotes = new Map<number, string[]>();

  /**
   * Every note this engine sounds, including Smart Chord tones and each Note
   * Repeat retrigger. Recorders consume this stream so a take stores what the
   * artist heard rather than the one key they pressed.
   */
  readonly noteEvents$ = new Subject<LiveNoteEvent>();

  async initialize() {
    if (this.isInitialized()) return;

    // Crucial: Sync Tone with our core Audio Engine context. Tone constructs its
    // own native context on first use, so it must not be called when the host
    // has already reported that Web Audio is unavailable.
    if (
      this.audioEngine.audioAvailable === false ||
      !this.audioEngine.ctx ||
      this.audioEngine.ctx.state === 'closed'
    ) {
      this.logger.warn('LiveEngine: AudioEngine context unavailable');
      return;
    }
    if (Tone.getContext().rawContext !== this.audioEngine.ctx) {
      Tone.setContext(this.audioEngine.ctx);
    }

    await Tone.start();
    this.isInitialized.set(true);
    this.setupMidi();

    // ── Auto-load a default instrument so keyboard/pads play immediately ──
    // Without this, triggerNoteStart() returns early because
    // currentInstrumentNode is null — the most common reason for "no sound"
    // on the piano keyboard.
    if (!this.currentInstrumentNode) {
      await this.setInstrument('grand-piano').catch(() => {
        // Fallback: create a basic Tone.Synth if the preset can't be loaded
        this.applyPatchValues(2000, 1, 0.01, 0.5);
        this.currentInstrumentNode = new Tone.PolySynth(Tone.Synth, {
          oscillator: { type: 'sine' },
          envelope: { attack: 0.01, decay: 0.3, sustain: 0.6, release: 0.5 },
        });
        this.connectToFilter(
          this.currentInstrumentNode,
          2000
        );
        this.activeInstrument.set('grand-piano');
      });
    }
  }

  private setupMidi() {
    if (
      typeof navigator !== 'undefined' &&
      (navigator as any).requestMIDIAccess
    ) {
      (navigator as any).requestMIDIAccess().then(
        (access: any) => {
          this.midiEnabled.set(true);
          const inputs = Array.from(access.inputs.values()) as any[];
          this.availableMidiInputs.set(
            inputs.map((i) => i.name || 'Unknown Device')
          );
          this.hardwareService.updateMidiCount(inputs.length);
          inputs.forEach((input) => {
            const handler = (msg: any) => this.handleMidiMessage(msg);
            // HardwareService also listens on the same inputs. Using an
            // EventTarget listener avoids the two services overwriting each
            // other's `onmidimessage` slot and losing MPE channel data.
            if (typeof input.addEventListener === 'function') {
              input.addEventListener('midimessage', handler);
            } else {
              input.onmidimessage = handler;
            }
          });
        },
        () => this.logger.warn('MIDI Access Denied')
      );
    }
  }

  private handleMidiMessage(message: any) {
    const [status, data1, data2] = message.data;
    const cmd = status >> 4;
    const channel = status & 0xf;
    const velocity = data2;

    switch (cmd) {
      case 9: // Note On
        if (velocity > 0) this.triggerNoteStart(data1, velocity / 127, channel);
        else this.triggerNoteEnd(data1, channel);
        break;
      case 8: // Note Off
        this.triggerNoteEnd(data1, channel);
        break;
      case 11: // Control Change (CC)
        this.handleMidiCC(data1, data2);
        break;
      case 14: // Pitch Bend
        this.handlePitchBend(data1, data2, channel);
        break;
      case 13: // Channel pressure (mono aftertouch)
        this.setAftertouch(data1 / 127, undefined, channel);
        break;
      case 10: // Polyphonic aftertouch
        this.setAftertouch(data2 / 127, data1, channel);
        break;
      case 12: // Program Change (instrument select)
        break;
    }
  }

  private sustainActive = false;
  private sustainedNotes = new Map<string, { midi: number; channel: number }>();

  private handleMidiCC(cc: number, value: number) {
    const normalized = value / 127;
    switch (cc) {
      case 1: // Mod Wheel
        this.setModWheel(normalized);
        break;
      case 7: // Volume
        this.updateParameter('volume', normalized);
        break;
      case 10: // Pan
        this.updateParameter('pan', normalized * 2 - 1);
        break;
      case 11: // Expression
        if (this.currentInstrumentNode instanceof Tone.PolySynth) {
          this.currentInstrumentNode.set({ volume: (normalized - 1) * 40 });
        }
        break;
      case 64: // Sustain Pedal
        this.handleSustainPedal(value >= 64);
        break;
      case 71: // Resonance / Filter Q
        this.updateParameter('resonance', normalized * 20);
        break;
      case 74: // Filter Cutoff (brightness)
        this.updateParameter('cutoff', 100 + normalized * 19900);
        break;
      case 72: // Release
        this.updateParameter('release', 0.01 + normalized * 4);
        break;
      case 73: // Attack
        this.updateParameter('attack', 0.001 + normalized * 2);
        break;
      case 75: // Decay
        this.updateParameter('decay', 0.01 + normalized * 3);
        break;
      case 70: // Sound Controller (mapped to cutoff)
        this.updateParameter('cutoff', 100 + normalized * 19900);
        break;
    }
  }

  private handleSustainPedal(down: boolean) {
    this.sustainActive = down;
    if (!down && this.sustainedNotes.size > 0) {
      // Pedal-up releases the exact channel+note pairs that were deferred.
      this.sustainedNotes.forEach(({ midi, channel }) =>
        this.releaseNote(midi, channel),
      );
      this.sustainedNotes.clear();
    }
  }

  private handlePitchBend(lsb: number, msb: number, channel = 0) {
    const value = (msb << 7) | lsb;
    const normalized = (value - 8192) / 8192; // -1 to +1
    this.setPitchBend(normalized, channel);
  }

  /** Public helper to resume the underlying AudioContext if suspended by browser autoplay policy. */
  async resumeContext(): Promise<void> {
    try {
      if (this.audioEngine.ctx?.state === 'suspended') {
        await this.audioEngine.ctx.resume();
        this.logger.info('LiveEngine: AudioContext resumed');
      }
    } catch (e) {
      this.logger.warn('LiveEngine: Could not resume AudioContext', e);
    }
  }

  public midiToNote(midi: number): string {
    const names = [
      'C',
      'C#',
      'D',
      'D#',
      'E',
      'F',
      'F#',
      'G',
      'G#',
      'A',
      'A#',
      'B',
    ];
    const octave = Math.floor(midi / 12) - 1;
    return `${names[midi % 12]}${octave}`;
  }

  /**
   * The triad Smart Chords plays for a root. The quality follows the selected
   * scale, so a minor key does not get a major third; the old implementation
   * computed a major triad and never read the scale at all.
   */
  generateSmartChord(rootNote: string): string[] {
    const root = Tone.Frequency(rootNote).toMidi();
    const intervals = this.currentScale();
    const pc = ((root % 12) + 12) % 12;
    const rootPc = this.scaleRoot();
    const degree = intervals.findIndex(
      (interval) => (rootPc + interval) % 12 === pc,
    );

    // A chromatic root has no scale degree to stack thirds on; fall back to the
    // mode family so the chord still agrees with the key's flavour.
    if (!intervals.length || degree < 0) {
      const minorFamily: LiveScaleMode[] = [
        'minor',
        'dorian',
        'phrygian',
        'locrian',
        'harmonicMinor',
        'blues',
      ];
      const shape = minorFamily.includes(this.scaleMode())
        ? [0, 3, 7]
        : [0, 4, 7];
      return shape.map((interval) => this.midiToNote(root + interval));
    }

    // Stack scale thirds (degree +2 and +4) rather than always using major or
    // minor, so dorian, lydian and the rest produce the chord they imply. Each
    // tone is voiced just above the previous one, never an octave away.
    const chordPcs = [degree, degree + 2, degree + 4].map(
      (targetDegree) =>
        (rootPc + intervals[targetDegree % intervals.length]) % 12,
    );
    let previousPc = pc;
    let offset = 0;
    const chord = chordPcs.map((targetPc, index) => {
      if (index > 0) {
        const step = (targetPc - previousPc + 12) % 12;
        offset += step === 0 ? 12 : step;
      }
      previousPc = targetPc;
      return this.midiToNote(root + offset);
    });
    return chord;
  }

  /** Nearest pitch in the active scale. Ties resolve downward, so chromatically
   * bent notes settle on the lower degree instead of flickering between two. */
  snapToScale(midi: number): number {
    const intervals = this.currentScale();
    if (!intervals.length || !Number.isFinite(midi)) return midi;
    const pitchClass = ((midi % 12) + 12) % 12;
    const octaveRoot = midi - pitchClass;
    const rootPc = this.scaleRoot();
    let best = midi;
    let bestDistance = Infinity;
    for (let octave = -1; octave <= 1; octave += 1) {
      for (const interval of intervals) {
        const candidate = octaveRoot + octave * 12 + ((rootPc + interval) % 12);
        const distance = Math.abs(candidate - midi);
        // Ties resolve downward regardless of which degree was visited first,
        // which keeps the documented snap behavior stable across roots.
        if (distance < bestDistance || (distance === bestDistance && candidate < best)) {
          bestDistance = distance;
          best = candidate;
        }
      }
    }
    return best;
  }

  private connectToFilter(
    node: Tone.PolySynth | Tone.Sampler | Tone.Synth,
    cutoff: number,
  ) {
    this.filterNode = new Tone.Filter(cutoff, 'lowpass');
    this.filterNode.frequency.value = cutoff;
    this.filterNode.Q.value = this.resonance();
    if (!this.panNode) {
      this.panNode = new Tone.Panner(this.instrumentPan());
    }
    if (this.panNode) {
      this.filterNode.connect(this.panNode);
      this.panNode.connect(this.ensureOutputNode());
    }
    node.connect(this.filterNode);
  }

  /**
   * Seed the rack's read-out from a preset without building the audio graph.
   * Audio cannot start before a user gesture, but the rack still has to name
   * the patch the artist selected — otherwise it advertises a default cutoff
   * until the first key press.
   */
  previewPatchReadout(presetId: string): void {
    const preset = this.instrumentsService
      .getPresets()
      .find((p) => p.id === presetId);
    if (!preset) return;
    if (preset.type === 'synth' && preset.synth) {
      this.applyPatchValues(
        preset.synth.cutoff ?? 2000,
        preset.synth.q ?? 1,
        preset.synth.attack ?? 0.01,
        preset.synth.release ?? 0.5,
      );
      return;
    }
    this.applyPatchValues(2000, 1, 0.01, 1);
  }

  /** Seed the rack's parameter read-out from the patch being loaded. */
  private applyPatchValues(
    cutoff: number,
    resonance: number,
    attack: number,
    release: number,
  ): void {
    this.cutoff.set(Number.isFinite(cutoff) ? Math.max(20, Math.min(20000, cutoff)) : 20000);
    this.resonance.set(Number.isFinite(resonance) ? Math.max(0, Math.min(20, resonance)) : 1);
    this.attack.set(Number.isFinite(attack) ? Math.max(0.001, Math.min(2, attack)) : 0.01);
    this.release.set(Number.isFinite(release) ? Math.max(0.01, Math.min(5, release)) : 0.5);
    if (this.filterNode) {
      this.filterNode.frequency.value = this.cutoff();
      this.filterNode.Q.value = this.resonance();
    }
  }

  /** The bus the live instrument feeds: a project channel, else the master. */
  private playbackDestination(): AudioNode {
    return (
      this.outputTarget ??
      ((this.audioEngine.masterGain as unknown as AudioNode) ?? null)
    );
  }

  private ensureOutputNode(): Tone.Gain {
    if (!this.outputNode) {
      this.outputNode = new Tone.Gain(1);
      const destination = this.playbackDestination();
      if (destination) this.outputNode.connect(destination as any);
    }
    return this.outputNode;
  }

  /**
   * Route the live instrument into a project channel (usually the selected
   * one). `null` falls back to the engine's master bus, so the instrument never
   * lands on the raw device destination where nothing can meter or limit it.
   */
  setOutputTarget(target: AudioNode | null): boolean {
    this.outputTarget = target ?? null;
    if (!this.outputNode) return false;
    try {
      this.outputNode.disconnect();
    } catch {
      /* was not connected */
    }
    const destination = this.playbackDestination();
    if (destination) this.outputNode.connect(destination as any);
    return true;
  }

  /** Where the live instrument is currently routed (diagnostics + tests). */
  getOutputTarget(): AudioNode | null {
    return this.outputTarget;
  }

  async setInstrument(presetId: string) {
    if (!this.isInitialized()) await this.initialize();

    const preset = this.instrumentsService
      .getPresets()
      .find((p) => p.id === presetId);
    if (!preset) return;

    this.activeInstrument.set(presetId);
    this.activePreset = preset;
    this.disposeMpeVoices();
    this.stopArpeggiator();
    this.chordNotes.clear();
    this.sampleMap = null;

    if (this.currentInstrumentNode) this.currentInstrumentNode.dispose();
    if (this.filterNode) this.filterNode.dispose();
    this.filterNode = null;

    if (preset.type === 'synth' && preset.synth) {
      const config = preset.synth;
      this.applyPatchValues(
        config.cutoff ?? 2000,
        config.q ?? 1,
        config.attack ?? 0.01,
        config.release ?? 0.5,
      );
      this.currentInstrumentNode = new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: config.type as any },
        envelope: {
          attack: config.attack,
          decay: config.decay,
          sustain: config.sustain,
          release: config.release,
        },
      });
      this.applyPortamento(this.currentInstrumentNode);
      this.connectToFilter(this.currentInstrumentNode, config.cutoff || 2000);
    } else if ((preset.type === 'sample' || preset.type === 'hybrid') && preset.zones?.length) {
      const sampleMap: Record<string, string> = {};
      preset.zones.forEach(
        (z) => (sampleMap[this.midiToNote(sampleZoneRoot(z))] = z.url)
      );
      this.sampleMap = sampleMap;
      this.applyPatchValues(2000, 1, 0.01, 1);
      this.currentInstrumentNode = new Tone.Sampler({
        urls: sampleMap,
        release: 1,
      });
      this.connectToFilter(this.currentInstrumentNode, 2000);
    }
  }

  triggerNoteStart(midi: number, velocity: number = 0.8, channel = 0) {
    const key = this.noteKey(midi, channel);
    this.sustainedNotes.delete(key);

    // MPE member channels own their notes. Channel 0 is the normal instrument
    // (and the MPE master channel), so keyboard and non-MPE MIDI are unchanged.
    if (channel > 0) {
      this.startMpeVoice(midi, velocity, channel);
      this.publishNote('on', this.midiToNote(midi), velocity, 'key', channel);
      return;
    }

    if (!this.currentInstrumentNode) return;
    const noteMidi = this.scaleLock() ? this.snapToScale(midi) : midi;
    const root = this.midiToNote(noteMidi);
    const notes = this.smartChords() ? this.generateSmartChord(root) : [root];
    this.chordNotes.set(midi, notes);
    this.heldVelocity = velocity;

    // Note repeat owns the retriggering: starting a sustained note as well
    // would leave a drone underneath the pattern.
    if (this.arpeggiatorEnabled()) {
      notes.forEach((note) => {
        if (!this.heldNotes.includes(note)) this.heldNotes.push(note);
      });
      this.startArpeggiator();
      return;
    }

    const time = Tone.now();
    notes.forEach((note, index) => {
      this.currentInstrumentNode!.triggerAttack(note, time, velocity);
      this.publishNote(
        'on',
        note,
        velocity,
        index === 0 ? 'key' : 'chord',
      );
    });
  }

  triggerNoteEnd(midi: number, channel = 0) {
    // A repeated note stops when the key lifts, regardless of the pedal: the
    // held list is what the arpeggiator walks, and an absent key must leave it.
    if (channel === 0 && this.arpeggiatorEnabled()) {
      // Latch keeps the pattern running hands-free; the chord stays until the
      // player presses a new one or switches repeat off.
      if (this.arpeggiatorLatch()) return;
      const notes = this.chordNotes.get(midi) ?? [this.midiToNote(midi)];
      this.chordNotes.delete(midi);
      this.heldNotes = this.heldNotes.filter((note) => !notes.includes(note));
      if (this.heldNotes.length === 0) this.stopArpeggiator();
      return;
    }
    if (this.sustainActive) {
      this.sustainedNotes.set(this.noteKey(midi, channel), { midi, channel });
      return;
    }
    this.releaseNote(midi, channel);
  }

  private releaseNote(midi: number, channel: number): void {
    if (channel > 0) {
      const key = this.noteKey(midi, channel);
      const voice = this.mpeVoices.get(key);
      if (!voice) return;
      this.mpeVoices.delete(key);
      this.releaseMpeVoice(voice);
      this.publishNote('off', this.midiToNote(midi), 0, 'key', channel);
      return;
    }
    if (!this.currentInstrumentNode) return;
    const notes = this.chordNotes.get(midi) ?? [this.midiToNote(midi)];
    this.chordNotes.delete(midi);
    const time = Tone.now();
    notes.forEach((note) => {
      this.currentInstrumentNode!.triggerRelease(note, time);
      this.publishNote(
        'off',
        note,
        0,
        notes.length > 1 && note !== notes[0] ? 'chord' : 'key',
      );
    });
  }

  /**
   * Announce a sounded note to every recorder. Pitch is resolved here, once,
   * so consumers never have to re-run Scale Lock or chord generation.
   */
  private publishNote(
    type: 'on' | 'off',
    note: string,
    velocity: number,
    source: LiveNoteSource,
    channel = 0,
    durationMs?: number,
  ): void {
    this.noteEvents$.next({
      type,
      midi: this.noteToMidi(note),
      note,
      velocity,
      channel,
      atMs:
        typeof performance !== 'undefined' && typeof performance.now === 'function'
          ? performance.now()
          : Date.now(),
      source,
      durationMs,
    });
  }

  /** Tone note name to MIDI number (`C4` = 60), independent of Tone's clock. */
  private noteToMidi(note: string): number {
    const match = /^([A-Ga-g])([#b]?)(-?\d+)$/.exec(note.trim());
    if (!match) return 60;
    const base: Record<string, number> = {
      C: 0,
      D: 2,
      E: 4,
      F: 5,
      G: 7,
      A: 9,
      B: 11,
    };
    const accidental = match[2] === '#' ? 1 : match[2] === 'b' ? -1 : 0;
    return base[match[1].toUpperCase()] + accidental + (Number(match[3]) + 1) * 12;
  }

  private noteKey(midi: number, channel: number): string {
    return `${channel}:${midi}`;
  }

  private startMpeVoice(midi: number, velocity: number, channel: number): void {
    if (!this.filterNode) return;
    const key = this.noteKey(midi, channel);
    const existing = this.mpeVoices.get(key);
    if (existing) {
      this.mpeVoices.delete(key);
      this.releaseMpeVoice(existing);
    }

    const preset = this.activePreset;
    let node: Tone.Synth | Tone.Sampler;
    if (preset?.type === 'synth' && preset.synth) {
      const config = preset.synth;
      node = new Tone.Synth({
        portamento: this.portamento(),
        oscillator: { type: config.type as any },
        envelope: {
          attack: config.attack,
          decay: config.decay,
          sustain: config.sustain,
          release: config.release,
        },
      });
    } else if (this.sampleMap) {
      node = new Tone.Sampler({ urls: this.sampleMap, release: 1 });
    } else {
      node = new Tone.Synth({
        oscillator: { type: 'sine' },
        envelope: { attack: 0.01, decay: 0.3, sustain: 0.6, release: 0.5 },
      });
    }

    const gain = new Tone.Gain(1);
    node.connect(gain);
    gain.connect(this.filterNode);
    node.triggerAttack(this.midiToNote(midi), Tone.now(), velocity);

    const voice: MpeVoice = {
      key,
      channel,
      midi,
      node,
      gain,
      release: preset?.synth?.release ?? 1,
      disposed: false,
    };
    this.mpeVoices.set(key, voice);
    this.applyVoicePitch(voice);
    this.applyVoicePressure(
      voice,
      this.channelPressures.get(channel) ?? 0,
    );
  }

  private releaseMpeVoice(voice: MpeVoice): void {
    if (voice.disposed) return;
    try {
      voice.node.triggerRelease(Tone.now());
    } catch {
      /* already released or the host disposed the context */
    }
    const delay = Math.max(30, voice.release * 1000 + 50);
    const timer = setTimeout(() => this.disposeVoice(voice), delay);
    (timer as any)?.unref?.();
  }

  private disposeVoice(voice: MpeVoice): void {
    if (voice.disposed) return;
    voice.disposed = true;
    try {
      voice.node.dispose();
    } catch {
      /* already disposed */
    }
    try {
      voice.gain.dispose();
    } catch {
      /* already disposed */
    }
  }

  private disposeMpeVoices(): void {
    this.mpeVoices.forEach((voice) => this.disposeVoice(voice));
    this.mpeVoices.clear();
    this.sustainedNotes.clear();
    this.channelBends.clear();
    this.channelPressures.clear();
  }

  private applyVoicePitch(voice: MpeVoice): void {
    const master = this.channelBends.get(0) ?? 0;
    const member = this.channelBends.get(voice.channel) ?? 0;
    const cents = master * 200 + member * this.mpeBendRange * 100;
    const detune = (voice.node as any).detune;
    if (detune?.rampTo) detune.rampTo(cents, 0.01);
    else if (detune) detune.value = cents;
    else (voice.node as any).set?.({ detune: cents });
  }

  private applyVoicePressure(voice: MpeVoice, pressure: number): void {
    const normalized = Number.isFinite(pressure)
      ? Math.max(0, Math.min(1, pressure))
      : 0;
    voice.gain.gain.rampTo(0.5 + 0.5 * normalized, 0.03);
  }

  setMpePitchBendRange(semitones: number): void {
    if (!Number.isFinite(semitones)) return;
    this.mpeBendRange = Math.max(1, Math.min(96, semitones));
    this.mpeVoices.forEach((voice) => this.applyVoicePitch(voice));
  }

  /**
   * Push the live glide time onto a node. Tone accepts `portamento` through
   * `set` on both PolySynth and MonoSynth voices; the try/catch keeps older
   * or mocked nodes from throwing on an unknown property.
   */
  private applyPortamento(node: unknown): void {
    try {
      (node as any)?.set?.({ portamento: this.portamento() });
    } catch {
      /* node does not expose portamento */
    }
  }

  /**
   * Live 808-style glide for the current instrument (and every MPE voice
   * spawned after it). Seconds of glide between legato notes, 0 = off.
   */
  setPortamento(seconds: number): void {
    const clamped = Number.isFinite(seconds)
      ? Math.max(0, Math.min(0.5, seconds))
      : 0;
    this.portamento.set(clamped);
    if (this.currentInstrumentNode) this.applyPortamento(this.currentInstrumentNode);
    this.mpeVoices.forEach((voice) => this.applyPortamento(voice.node));
  }

  updateParameter(param: string, value: number) {
    if (!Number.isFinite(value)) return;
    switch (param) {
      case 'cutoff': {
        const cutoff = Math.max(20, Math.min(20000, value));
        this.cutoff.set(cutoff);
        this.filterNode?.frequency.rampTo(cutoff, 0.02);
        return;
      }
      case 'resonance': {
        const resonance = Math.max(0, Math.min(20, value));
        this.resonance.set(resonance);
        if (this.filterNode) this.filterNode.Q.value = resonance;
        return;
      }
      case 'volume': {
        // CC7 — the live instrument's own trim, not the project track fader.
        const volume = Math.max(0, Math.min(1, value));
        this.instrumentVolume.set(volume);
        this.ensureOutputNode().gain.rampTo(volume, 0.03);
        return;
      }
      case 'pan': {
        const pan = Math.max(-1, Math.min(1, value));
        this.instrumentPan.set(pan);
        this.panNode?.pan.rampTo(pan, 0.03);
        return;
      }
      case 'portamento':
        this.setPortamento(value);
        return;
      case 'attack':
        this.attack.set(Math.max(0.001, Math.min(2, value)));
        break;
      case 'release':
        this.release.set(Math.max(0.01, Math.min(5, value)));
        break;
      case 'decay':
      case 'sustain':
        break;
      default:
        return;
    }

    const node: any = this.currentInstrumentNode;
    if (!node) return;
    try {
      // Samplers expose attack/release directly (Tone.Sampler); synths take the
      // whole envelope. Routing the sampler's own parameters keeps ATK/REL
      // honest on sampled instruments instead of silently inert.
      const samplerPatch =
        this.activePreset?.type === 'sample' ||
        this.activePreset?.type === 'hybrid';
      if (samplerPatch) {
        if (param === 'attack' || param === 'release') {
          node.set({ [param]: value });
        }
      } else {
        node.set({ envelope: { [param]: value } });
      }
    } catch (err) {
      this.logger.warn('LiveEngine: envelope update rejected', err);
    }
  }

  setScale(mode: any) {
    const modes = Object.keys(LIVE_SCALE_INTERVALS) as LiveScaleMode[];
    const next: LiveScaleMode = modes.includes(mode) ? mode : 'major';
    this.scaleMode.set(next);
    // `currentScale` is the note set Scale Lock snaps to; it used to be a
    // constant, so changing the dropdown relabelled the control and nothing else.
    this.currentScale.set(LIVE_SCALE_INTERVALS[next]);
  }

  /** Transpose Scale Lock to a new root without changing the mode. */
  setScaleRoot(rootPc: number) {
    if (!Number.isFinite(rootPc)) return;
    this.scaleRoot.set(((Math.round(rootPc) % 12) + 12) % 12);
  }

  setArpeggiatorPattern(pattern: any): void {
    const patterns: LiveArpPattern[] = ['up', 'down', 'upDown', 'random'];
    this.arpeggiatorPattern.set(
      patterns.includes(pattern) ? pattern : 'up',
    );
  }

  /** Apply a set's stored live rig in one step (project restore). */
  restorePerformanceState(
    state: Partial<LivePerformanceState> | null | undefined,
  ): void {
    if (!state) return;
    if (typeof state.smartChords === 'boolean') {
      this.smartChords.set(state.smartChords);
    }
    if (state.scaleMode) this.setScale(state.scaleMode);
    if (typeof state.scaleRoot === 'number') {
      this.setScaleRoot(state.scaleRoot);
    }
    if (typeof state.scaleLock === 'boolean') {
      this.setScaleLock(state.scaleLock);
    }
    if (typeof state.arpRate === 'string') {
      this.setArpeggiatorRate(state.arpRate);
    }
    if (state.arpPattern) this.setArpeggiatorPattern(state.arpPattern);
    if (typeof state.arpLatch === 'boolean') {
      this.setArpeggiatorLatch(state.arpLatch);
    }
    if (typeof state.arpSwing === 'number') {
      this.setArpeggiatorSwing(state.arpSwing);
    }
    if (typeof state.arpEnabled === 'boolean') {
      this.setArpeggiatorEnabled(state.arpEnabled);
    }
  }

  /** Scale Lock snaps incoming notes to the selected scale when enabled. */
  setScaleLock(enabled: boolean): void {
    this.scaleLock.set(!!enabled);
  }

  /**
   * Note repeat / arpeggiator. While on, a held key retriggers at the chosen
   * rate and the pattern walks the held chord tones; turning it off releases
   * whatever it was repeating.
   */
  setArpeggiatorEnabled(enabled: boolean): void {
    this.arpeggiatorEnabled.set(!!enabled);
    if (!enabled) this.stopArpeggiator();
  }

  setArpeggiatorRate(rate: string): void {
    // Only rates `arpIntervalMs` has an interval for are schedulable; anything
    // else would leave the clock with no delay to time the next repeat.
    this.arpeggiatorRate.set(isLiveArpRate(rate) ? rate : '8n');
    if (this.arpTimer !== null) {
      clearTimeout(this.arpTimer);
      this.arpTimer = null;
      this.arpStep = 0;
      this.queueArpTick();
    }
  }

  setArpeggiatorLatch(enabled: boolean): void {
    this.arpeggiatorLatch.set(!!enabled);
  }

  /** 0 = straight; up to 0.75 keeps the next interval above 20 ms. */
  setArpeggiatorSwing(amount: number): void {
    if (!Number.isFinite(amount)) return;
    this.arpeggiatorSwing.set(Math.max(0, Math.min(0.75, amount)));
  }

  private tempoBpm(): number {
    const source: any = this.audioEngine.tempo;
    const raw = typeof source === 'function' ? source() : source?.value;
    const bpm = Number(raw);
    return Number.isFinite(bpm) && bpm > 0 ? bpm : 124;
  }

  private arpIntervalMs(): number {
    const beat = 60000 / Math.max(20, Math.min(300, this.tempoBpm()));
    switch (this.arpeggiatorRate()) {
      case '4n':
        return beat;
      case '8t':
        return beat / 3;
      case '16n':
        return beat / 4;
      default:
        return beat / 2;
    }
  }

  private startArpeggiator(): void {
    if (this.arpTimer !== null) return;
    this.arpStep = 0;
    this.arpTick();
    if (this.heldNotes.length) this.queueArpTick();
  }

  /**
   * Schedule one tick at a time: the next delay depends on the step, so a
   * swung pair is long-short instead of a fixed interval that cannot groove.
   */
  private queueArpTick(): void {
    if (this.arpTimer !== null || !this.heldNotes.length) return;
    const swing = this.arpeggiatorSwing();
    const factor =
      this.arpStep % 2 === 0 ? 1 - swing / 2 : 1 + swing / 2;
    const delay = Math.max(20, this.arpIntervalMs() * factor);
    this.arpTimer = setTimeout(() => {
      this.arpTimer = null;
      this.arpTick();
      if (this.arpTimer === null) this.queueArpTick();
    }, delay);
  }

  private stopArpeggiator(): void {
    if (this.arpTimer !== null) {
      clearTimeout(this.arpTimer);
      this.arpTimer = null;
    }
    const node = this.currentInstrumentNode;
    if (node) {
      const time = Tone.now();
      this.heldNotes.forEach((note) => {
        try {
          node.triggerRelease(note, time);
        } catch {
          /* the note was already released */
        }
      });
    }
    this.heldNotes = [];
    this.arpStep = 0;
  }

  private arpTick(): void {
    if (!this.heldNotes.length || !this.currentInstrumentNode) {
      this.stopArpeggiator();
      return;
    }
    const count = this.heldNotes.length;
    const step = this.arpStep;
    let index: number;
    switch (this.arpeggiatorPattern()) {
      case 'down':
        index = count - 1 - (step % count);
        break;
      case 'upDown': {
        if (count <= 1) {
          index = 0;
        } else {
          const cycle = count * 2 - 2;
          const position = step % cycle;
          index = position < count ? position : cycle - position;
        }
        break;
      }
      case 'random':
        index = Math.floor(Math.random() * count);
        break;
      default:
        index = step % count;
    }
    this.playOneShot(this.heldNotes[index], this.heldVelocity);
    this.arpStep = (step + 1) % 100000;
  }

  /** One repeated note, short enough that consecutive ticks do not overlap. */
  private playOneShot(note: string, velocity: number): void {
    const node: any = this.currentInstrumentNode;
    if (!node) return;
    const duration = Math.max(0.05, (this.arpIntervalMs() / 1000) * 0.9);
    try {
      if (typeof node.triggerAttackRelease === 'function') {
        node.triggerAttackRelease(note, duration, Tone.now(), velocity);
        this.publishNote('on', note, velocity, 'repeat', 0, duration * 1000);
        return;
      }
      node.triggerAttack(note, Tone.now(), velocity);
      setTimeout(() => {
        try {
          node.triggerRelease(note, Tone.now());
        } catch {
          /* the note was already released */
        }
      }, duration * 1000);
    } catch (err) {
      this.logger.warn('LiveEngine: note repeat could not trigger', err);
    }
  }
  setPitchBend(val: number, channel = 0) {
    const normalized = Number.isFinite(val)
      ? Math.max(-1, Math.min(1, val))
      : 0;
    this.channelBends.set(channel, normalized);

    if (channel === 0) {
      if (this.currentInstrumentNode)
        (this.currentInstrumentNode as any).set({ detune: normalized * 200 });
    }
    this.mpeVoices.forEach((voice) => {
      if (channel === 0 || voice.channel === channel) {
        this.applyVoicePitch(voice);
      }
    });
  }

  /**
   * Aftertouch expression. Channel 0 is the master/global path: it opens the
   * shared filter and follows the normal instrument. Member-channel pressure
   * is per voice, so an MPE controller can swell one note without moving the
   * whole chord.
   */
  setAftertouch(value: number, note?: number, channel = 0) {
    const normalized = Number.isFinite(value)
      ? Math.max(0, Math.min(1, value))
      : 0;
    this.aftertouch.set(normalized);

    if (channel > 0) {
      this.channelPressures.set(channel, normalized);
      this.mpeVoices.forEach((voice) => {
        if (
          voice.channel === channel &&
          (note === undefined || voice.midi === note)
        ) {
          this.applyVoicePressure(voice, normalized);
        }
      });
      return;
    }

    if (this.filterNode) {
      const baseCutoff = this.activePreset?.synth?.cutoff || 2000;
      const cutoff = baseCutoff + normalized * (20000 - baseCutoff);
      this.filterNode.frequency.rampTo(Math.min(20000, cutoff), 0.03);
    }
  }
  setModWheel(val: number) {
    if (!this.currentInstrumentNode || !this.filterNode) return;
    // Mod wheel sweeps filter cutoff from preset cutoff to max
    const baseCutoff = this.activePreset?.synth?.cutoff || 2000;
    const maxCutoff = 20000;
    const cutoff = baseCutoff + val * (maxCutoff - baseCutoff);
    this.filterNode.frequency.rampTo(cutoff, 0.05);
  }
}
