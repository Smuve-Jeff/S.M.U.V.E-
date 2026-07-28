import { Instrument } from './instrument';

interface ModalResonator {
  freq: number;
  gain: number;
  decay: number;
}

export interface PluckParams {
  brightness: number; // 0..1, low-pass on exciter
  damping: number; // 0..1, string damping
  bodyMix: number; // 0..1, modal body resonance
  attack: number;
  release: number;
}

/**
 * Physical modeling synthesis combining:
 * - Karplus-Strong plucked string (excitation → delay line → low-pass → feedback)
 * - Modal bank for body resonance
 */
export class PhysicalModelingSynth extends Instrument {
  private params: PluckParams = {
    brightness: 0.7,
    damping: 0.5,
    bodyMix: 0.3,
    attack: 0.005,
    release: 1.5,
  };

  // Modal body resonators (guitar-body-like)
  private modalResonators: ModalResonator[] = [
    { freq: 120, gain: 0.15, decay: 2.0 },
    { freq: 240, gain: 0.10, decay: 1.5 },
    { freq: 360, gain: 0.06, decay: 1.0 },
    { freq: 520, gain: 0.04, decay: 0.8 },
    { freq: 800, gain: 0.02, decay: 0.5 },
  ];

  private voices = new Map<number, any>();

  constructor(audioContext: AudioContext) {
    super(audioContext, 6);
  }

  setParams(params: Partial<PluckParams>): void {
    this.params = { ...this.params, ...params };
  }

  play(note: number, velocity: number): void {
    const now = this.audioContext.currentTime;
    const freq = 440 * Math.pow(2, (note - 69) / 12);
    const normVel = velocity / 127;

    // ── Karplus-Strong string ──
    const delayLen = Math.round(this.audioContext.sampleRate / freq);
    const delay = this.audioContext.createDelay(2);
    delay.delayTime.setValueAtTime(delayLen / this.audioContext.sampleRate, now);

    const stringLp = this.audioContext.createBiquadFilter();
    stringLp.type = 'lowpass';
    stringLp.frequency.setValueAtTime(
      freq * 4 * (1 - this.params.damping * 0.9),
      now
    );

    const feedback = this.audioContext.createGain();
    feedback.gain.setValueAtTime(0.95 * (1 - this.params.damping * 0.3), now);

    // Excitation: short noise burst
    const burstLen = Math.ceil(this.audioContext.sampleRate * 0.003);
    const noiseBuffer = this.audioContext.createBuffer(1, burstLen, this.audioContext.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < burstLen; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / burstLen, 3);
    }

    const exciter = this.audioContext.createBufferSource();
    exciter.buffer = noiseBuffer;

    const exciterGain = this.audioContext.createGain();
    exciterGain.gain.setValueAtTime(normVel, now);

    // String output gain
    const stringGain = this.audioContext.createGain();
    stringGain.gain.setValueAtTime(0, now);
    stringGain.gain.linearRampToValueAtTime(1, now + this.params.attack);

    // ── Modal body resonators ──
    const bodyGain = this.audioContext.createGain();
    bodyGain.gain.setValueAtTime(this.params.bodyMix, now);

    const bodyNodes: { filter: BiquadFilterNode; gain: GainNode }[] = [];
    for (const res of this.modalResonators) {
      const bp = this.audioContext.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(res.freq, now);
      bp.Q.setValueAtTime(5, now);

      const g = this.audioContext.createGain();
      g.gain.setValueAtTime(res.gain * normVel, now);
      g.gain.setTargetAtTime(0.001, now + 0.005, res.decay);

      bp.connect(g);
      g.connect(bodyGain);
      bodyNodes.push({ filter: bp, gain: g });
    }

    // Wire Karplus-Strong loop
    exciter.connect(exciterGain);
    exciterGain.connect(delay);
    delay.connect(stringLp);
    stringLp.connect(feedback);
    feedback.connect(delay); // feedback loop
    stringLp.connect(stringGain);

    // Connect physical model body resonators to the string output
    stringGain.connect(this.output);
    for (const bn of bodyNodes) {
      stringGain.connect(bn.filter);
    }
    bodyGain.connect(this.output);

    exciter.start(now);
    exciter.stop(now + 0.005);

    const voice = { exciter, delay, stringLp, feedback, stringGain, bodyGain, bodyNodes };
    this.voiceManager.addVoice({
      note,
      startTime: now,
      stop: () => this.releaseVoice(voice, note),
    });
    this.voices.set(note, voice);
  }

  stop(note: number): void {
    const voice = this.voices.get(note);
    if (voice) {
      this.releaseVoice(voice, note);
      this.voices.delete(note);
      this.voiceManager.removeVoice(note);
    }
  }

  stopAll(): void {
    this.voices.forEach((voice, note) => {
      this.releaseVoice(voice, note);
      this.voiceManager.removeVoice(note);
    });
    this.voices.clear();
    this.voiceManager.clear();
  }

  private releaseVoice(voice: any, _note: number): void {
    const now = this.audioContext.currentTime;
    voice.feedback.gain.setTargetAtTime(0.001, now, 0.1);
    voice.stringGain.gain.cancelScheduledValues(now);
    voice.stringGain.gain.setValueAtTime(voice.stringGain.gain.value, now);
    voice.stringGain.gain.exponentialRampToValueAtTime(0.001, now + this.params.release);
    voice.bodyGain.gain.exponentialRampToValueAtTime(0.001, now + this.params.release);

    setTimeout(() => {
      try { voice.exciter.stop(); } catch (e) {}
      voice.delay.disconnect();
      voice.stringLp.disconnect();
      voice.feedback.disconnect();
      voice.stringGain.disconnect();
      voice.bodyGain.disconnect();
      for (const bn of voice.bodyNodes) {
        bn.filter.disconnect();
        bn.gain.disconnect();
      }
    }, this.params.release * 1000 + 100);
  }
}
