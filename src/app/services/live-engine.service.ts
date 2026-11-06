import { Injectable, signal, inject } from '@angular/core';
import * as Tone from 'tone';
import { LoggingService } from './logging.service';
import { InstrumentsService, InstrumentPreset, sampleZoneRoot } from './instruments.service';
import { AudioEngineService } from './audio-engine.service';
import { HardwareService } from './hardware.service';

export type LiveInstrumentType = string;

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

  // AI Assisted Performance State
  scaleLock = signal(true);
  currentScale = signal<number[]>([0, 2, 4, 5, 7, 9, 11]); // C Major
  scaleMode = signal<'major' | 'minor' | 'blues' | 'pentatonic'>('major');
  smartChords = signal(false);
  /** Last channel/polyphonic pressure, normalized 0..1. */
  aftertouch = signal(0);

  // Arpeggiator State
  arpeggiatorEnabled = signal(false);
  arpeggiatorRate = signal('8n');
  arpeggiatorPattern = signal<'up' | 'down' | 'upDown' | 'random'>('up');
  private arpLoop: Tone.Loop | null = null;
  private arpNotes: number[] = [];

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

  generateSmartChord(rootNote: string): string[] {
    const _scale = this.currentScale();
    const root = Tone.Frequency(rootNote).toMidi();
    const chord = [root, root + 4, root + 7].map((midi) =>
      this.midiToNote(midi)
    );
    return chord;
  }

  private connectToFilter(
    node: Tone.PolySynth | Tone.Sampler | Tone.Synth,
    cutoff: number,
  ) {
    this.filterNode = new Tone.Filter(cutoff, 'lowpass');
    this.filterNode.connect(this.ensureOutputNode());
    node.connect(this.filterNode);
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
    this.sampleMap = null;

    if (this.currentInstrumentNode) this.currentInstrumentNode.dispose();
    if (this.filterNode) this.filterNode.dispose();

    if (preset.type === 'synth' && preset.synth) {
      const config = preset.synth;
      this.currentInstrumentNode = new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: config.type as any },
        envelope: {
          attack: config.attack,
          decay: config.decay,
          sustain: config.sustain,
          release: config.release,
        },
      });
      this.connectToFilter(this.currentInstrumentNode, config.cutoff || 2000);
    } else if ((preset.type === 'sample' || preset.type === 'hybrid') && preset.zones?.length) {
      const sampleMap: Record<string, string> = {};
      preset.zones.forEach(
        (z) => (sampleMap[this.midiToNote(sampleZoneRoot(z))] = z.url)
      );
      this.sampleMap = sampleMap;
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
      return;
    }

    if (!this.currentInstrumentNode) return;
    const note = this.midiToNote(midi);
    const time = Tone.now();
    this.currentInstrumentNode.triggerAttack(note, time, velocity);
  }

  triggerNoteEnd(midi: number, channel = 0) {
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
      return;
    }
    if (!this.currentInstrumentNode) return;
    this.currentInstrumentNode.triggerRelease(this.midiToNote(midi), Tone.now());
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

  updateParameter(param: string, value: number) {
    if (!this.currentInstrumentNode) return;
    if (param === 'cutoff' && this.filterNode)
      this.filterNode.frequency.value = value;
    if (param === 'resonance' && this.filterNode)
      this.filterNode.Q.value = value;

    if (
      param === 'attack' ||
      param === 'release' ||
      param === 'decay' ||
      param === 'sustain'
    ) {
      if (this.currentInstrumentNode instanceof Tone.PolySynth) {
        this.currentInstrumentNode.set({
          envelope: { [param]: value },
        });
      }
    }
  }

  setScale(mode: any) {
    this.scaleMode.set(mode);
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
