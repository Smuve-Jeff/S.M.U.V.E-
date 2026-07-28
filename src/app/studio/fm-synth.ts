import { Instrument } from './instrument';
import { NodePool } from './performance-utils';

interface OperatorParams {
  ratio: number;
  modIndex: number;
  envelope: { attack: number; decay: number; sustain: number; release: number };
  waveform: OscillatorType;
}

export interface FMSynthParams {
  operators: OperatorParams[];
  algorithm: number[][]; // mod matrix: algorithm[target][source] = modulation depth
  masterVolume: number;
  pitchBend: number;
}

/**
 * 4-operator FM synthesizer with configurable modulation matrix.
 * Each operator is an independent sine oscillator whose frequency
 * is controlled by ratio × baseFreq + modulation from other operators.
 */
export class FMSynth extends Instrument {
  private operators: OperatorParams[] = [
    { ratio: 1, modIndex: 0, envelope: { attack: 0.01, decay: 0.3, sustain: 0.8, release: 0.4 }, waveform: 'sine' },
    { ratio: 2, modIndex: 3, envelope: { attack: 0.01, decay: 0.2, sustain: 0.6, release: 0.3 }, waveform: 'sine' },
    { ratio: 4, modIndex: 2, envelope: { attack: 0.01, decay: 0.15, sustain: 0.5, release: 0.2 }, waveform: 'sine' },
    { ratio: 0.5, modIndex: 1, envelope: { attack: 0.02, decay: 0.4, sustain: 0.7, release: 0.5 }, waveform: 'sine' },
  ];

  // Default algorithm: op4 → op3 → op2 → op1 → output (classic FM chain)
  private algorithm: number[][] = [
    [0, 0, 0, 0], // op1: no modulation (carrier)
    [1, 0, 0, 0], // op2: modulated by op3
    [0, 1, 0, 0], // op3: modulated by op4
    [0, 0, 1, 0], // op4: modulated by itself
  ];

  private masterVolume = 0.7;
  private voices = new Map<number, any>();

  private oscPool: NodePool<OscillatorNode>;
  private gainPool: NodePool<GainNode>;

  constructor(audioContext: AudioContext) {
    super(audioContext, 8);
    this.oscPool = new NodePool(this.audioContext, (ctx) => ctx.createOscillator());
    this.gainPool = new NodePool(this.audioContext, (ctx) => ctx.createGain());
  }

  setParams(params: Partial<FMSynthParams>): void {
    if (params.operators) this.operators = params.operators;
    if (params.algorithm) this.algorithm = params.algorithm;
    if (params.masterVolume !== undefined) this.masterVolume = params.masterVolume;
  }

  play(note: number, velocity: number): void {
    const now = this.audioContext.currentTime;
    const freq = 440 * Math.pow(2, (note - 69) / 12);
    const normVel = velocity / 127;

    const voiceNodes: any[] = [];

    // Create operator chain
    for (let opIdx = 0; opIdx < this.operators.length; opIdx++) {
      const op = this.operators[opIdx];
      const osc = this.oscPool.get();
      osc.type = op.waveform;
      osc.frequency.setValueAtTime(freq * op.ratio, now);

      const modGain = this.gainPool.get();
      modGain.gain.setValueAtTime(0, now);

      const ampEnv = this.gainPool.get();
      const env = op.envelope;
      ampEnv.gain.setValueAtTime(0, now);
      ampEnv.gain.linearRampToValueAtTime(normVel, now + env.attack);
      ampEnv.gain.linearRampToValueAtTime(normVel * env.sustain, now + env.attack + env.decay);

      voiceNodes.push({ osc, modGain, ampEnv, opIdx });
      osc.start(now);
    }

    // Wire modulation matrix
    const algo = this.algorithm;
    for (let src = 0; src < this.operators.length; src++) {
      for (let tgt = 0; tgt < this.operators.length; tgt++) {
        const depth = algo[tgt]?.[src];
        if (depth && depth > 0) {
          voiceNodes[src].osc.connect(voiceNodes[tgt].modGain);
          voiceNodes[tgt].modGain.gain.setValueAtTime(
            this.operators[tgt].modIndex * depth * freq,
            now
          );
          voiceNodes[tgt].modGain.connect(voiceNodes[tgt].osc.frequency);
        }
      }
    }

    // Final output: operator 1 (carrier) through envelope
    voiceNodes[0].osc.connect(voiceNodes[0].ampEnv);
    voiceNodes[0].ampEnv.connect(this.output);

    const voice = { nodes: voiceNodes, note };
    this.voiceManager.addVoice({
      note,
      startTime: now,
      stop: () => this.releaseVoice(voice),
    });
    this.voices.set(note, voice);
  }

  stop(note: number): void {
    const voice = this.voices.get(note);
    if (voice) {
      this.releaseVoice(voice);
      this.voices.delete(note);
      this.voiceManager.removeVoice(note);
    }
  }

  stopAll(): void {
    this.voices.forEach((voice, note) => {
      this.releaseVoice(voice);
      this.voiceManager.removeVoice(note);
    });
    this.voices.clear();
    this.voiceManager.clear();
  }

  private releaseVoice(voice: any): void {
    const now = this.audioContext.currentTime;
    for (let i = 0; i < voice.nodes.length; i++) {
      const node = voice.nodes[i];
      const env = this.operators[i]?.envelope;
      if (env) {
        node.ampEnv.gain.cancelScheduledValues(now);
        node.ampEnv.gain.setValueAtTime(node.ampEnv.gain.value, now);
        node.ampEnv.gain.exponentialRampToValueAtTime(0.001, now + env.release);
      }
      setTimeout(() => {
        try { node.osc.stop(); } catch (e) {}
        this.oscPool.release(node.osc);
        this.gainPool.release(node.modGain);
        this.gainPool.release(node.ampEnv);
      }, (env?.release ?? 0.3) * 1000 + 50);
    }
  }
}
