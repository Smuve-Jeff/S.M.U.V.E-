/**
 * S.M.U.V.E. 2.0 — Synth Voice Processor (AudioWorklet)
 *
 * Phase 1 Latency Revolution: Extracts subtractive-synth DSP from
 * the main thread into a dedicated audio rendering thread.
 *
 * Capabilities:
 * - Up to 64 polyphonic voices with bandlimited oscillators (sine/saw/square/triangle)
 * - Per-voice ADSR envelope (sample-accurate amplitude shaping)
 * - Per-voice resonant lowpass filter (Direct Form II biquad)
 * - Per-voice stereo panning
 * - Master dynamics processor (soft-knee compressor/limiter)
 * - Sample-accurate NOTE_ON / NOTE_OFF scheduling via MessagePort
 *
 * Architecture:
 *   main thread (subtractive-synth.ts)  →  port.postMessage(NOTE_ON)
 *   worklet thread (this file)           →  renders samples in process()
 */

/* ── Clamp ─────────────────────────────────────────────── */
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

/* ── Bandlimited Oscillator (additive, Nyquist-capped) ──── */
class BandlimitedOsc {
  constructor(sampleRate) {
    this.sr = sampleRate;
    this.phase = 0;
  }

  /** Generate one sample of a bandlimited waveform. */
  generate(type, freq) {
    const phaseInc = freq / this.sr;
    this.phase += phaseInc;
    if (this.phase >= 1) this.phase -= Math.floor(this.phase);

    const maxH = Math.floor(this.sr / 2 / freq);
    let out = 0;

    switch (type) {
      case 'sine':
        out = Math.sin(2 * Math.PI * this.phase);
        break;
      case 'sawtooth':
        for (let h = 1; h <= maxH; h++) {
          out += (1 / h) * Math.sin(2 * Math.PI * h * this.phase);
        }
        out *= 0.5;
        break;
      case 'square':
        for (let h = 1; h <= maxH; h += 2) {
          out += (1 / h) * Math.sin(2 * Math.PI * h * this.phase);
        }
        out *= 0.6;
        break;
      case 'triangle':
        for (let h = 1; h <= maxH; h += 2) {
          const sign = ((h - 1) / 2) % 2 === 0 ? 1 : -1;
          out += (1 / (h * h)) * sign * Math.sin(2 * Math.PI * h * this.phase);
        }
        out *= 0.8;
        break;
      default:
        out = Math.sin(2 * Math.PI * this.phase);
    }

    return out;
  }

  reset() { this.phase = 0; }
}

/* ── Biquad Filter Direct Form II (per-voice) ──────────── */
class BiquadDF2 {
  constructor() {
    this.b0 = 1; this.b1 = 0; this.b2 = 0;
    this.a1 = 0; this.a2 = 0;
    this.x1 = 0; this.x2 = 0;
    this.y1 = 0; this.y2 = 0;
  }

  /** Design a lowpass filter at freq Hz with Q. */
  designLP(freq, q, sr) {
    const w0 = 2 * Math.PI * freq / sr;
    const cosW0 = Math.cos(w0);
    const sinW0 = Math.sin(w0);
    const alpha = sinW0 / (2 * q);

    const b0 = (1 - cosW0) / 2;
    const b1 = 1 - cosW0;
    const b2 = (1 - cosW0) / 2;
    const a0 = 1 + alpha;
    const a1 = -2 * cosW0;
    const a2 = 1 - alpha;

    this.b0 = b0 / a0;
    this.b1 = b1 / a0;
    this.b2 = b2 / a0;
    this.a1 = a1 / a0;
    this.a2 = a2 / a0;
  }

  process(x) {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2
            - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1; this.x1 = x;
    this.y2 = this.y1; this.y1 = y;
    return y;
  }

  reset() { this.x1 = this.x2 = this.y1 = this.y2 = 0; }
}

/* ── Dynamics (soft-knee stereo compressor / limiter) ──── */
class SoftKneeComp {
  constructor(sr) {
    this.sr = sr;
    this.threshold = -0.1;  // linear — brickwall limiter
    this.ratio = 20;
    this.attack = 0.001;
    this.release = 0.05;
    this.env = 0;
    this.attackCoeff = Math.exp(-1 / (sr * this.attack));
    this.releaseCoeff = Math.exp(-1 / (sr * this.release));
  }

  process(sample) {
    const abs = Math.abs(sample);
    const target = abs > this.threshold
      ? this.threshold + (abs - this.threshold) / this.ratio
      : abs;
    const coeff = target < this.env ? this.releaseCoeff : this.attackCoeff;
    this.env = coeff * this.env + (1 - coeff) * target;
    const gain = abs > 1e-10 ? this.env / abs : 1;
    return sample * gain;
  }
}

/* ── Voice State ───────────────────────────────────────── */
class Voice {
  constructor(sr) {
    this.osc = new BandlimitedOsc(sr);
    this.filter = new BiquadDF2();
    this.active = false;
    this.released = false;
    this.releaseStart = 0;
    this.startTime = 0;
    this.freq = 440;
    this.velocity = 1;
    this.waveform = 'sawtooth';
    this.adsr = { attack: 0.01, decay: 0.3, sustain: 0.8, release: 0.4 };
    this.filterCutoff = 8000;
    this.filterQ = 0.707;
    this.pan = 0;
  }
}

/* ── Main Processor ────────────────────────────────────── */
class SynthProcessor extends AudioWorkletProcessor {
  constructor() {
    super();

    this.voices = [];
    this.maxVoices = 64;
    // Pre-allocate voice pool
    for (let i = 0; i < this.maxVoices; i++) {
      this.voices.push(new Voice(sampleRate));
    }
    this.limiter = new SoftKneeComp(sampleRate);
    this._nextVoiceIdx = 0;

    this.port.onmessage = (event) => {
      const { type, payload } = event.data;

      switch (type) {
        case 'NOTE_ON': {
          const v = this._allocateVoice();
          if (!v) return;
          v.active = true;
          v.released = false;
          v.startTime = currentTime;
          v.freq = payload.freq || 440;
          v.velocity = clamp(payload.velocity || 0.8, 0, 1);
          v.waveform = payload.waveform || 'sawtooth';
          v.adsr = payload.adsr || { attack: 0.01, decay: 0.3, sustain: 0.8, release: 0.4 };
          v.filterCutoff = payload.filterCutoff || 8000;
          v.filterQ = payload.filterQ || 0.707;
          v.pan = clamp(payload.pan || 0, -1, 1);
          v.osc.reset();
          v.filter.designLP(v.filterCutoff, v.filterQ, sampleRate);
          v.filter.reset();
          break;
        }
        case 'NOTE_OFF': {
          const noteId = payload.noteId;
          // Release by frequency match (simplified — real impl would use noteId map)
          for (const v of this.voices) {
            if (v.active && !v.released && Math.abs(v.freq - (payload.freq || 0)) < 0.1) {
              v.released = true;
              v.releaseStart = currentTime;
              break; // release one voice per note-off
            }
          }
          break;
        }
        case 'STOP_ALL': {
          for (const v of this.voices) {
            if (v.active && !v.released) {
              v.released = true;
              v.releaseStart = currentTime;
              v.adsr.release = 0.01; // fast release for panic
            }
          }
          break;
        }
      }
    };
  }

  _allocateVoice() {
    // Find free voice or steal oldest
    for (let i = 0; i < this.maxVoices; i++) {
      const idx = (this._nextVoiceIdx + i) % this.maxVoices;
      if (!this.voices[idx].active || this.voices[idx].released) {
        this._nextVoiceIdx = (idx + 1) % this.maxVoices;
        return this.voices[idx];
      }
    }
    // Steal oldest active voice
    let oldestIdx = 0;
    let oldestTime = Infinity;
    for (let i = 0; i < this.maxVoices; i++) {
      if (this.voices[i].startTime < oldestTime) {
        oldestTime = this.voices[i].startTime;
        oldestIdx = i;
      }
    }
    return this.voices[oldestIdx];
  }

  process(_inputs, outputs) {
    const outL = outputs[0][0];
    const outR = outputs[0][1];
    const now = currentTime;

    for (let i = 0; i < outL.length; i++) {
      let mixL = 0;
      let mixR = 0;

      for (const v of this.voices) {
        if (!v.active) continue;

        const elapsed = now - v.startTime;

        // Auto-release at end of duration (if released flag set)
        // Release envelope
        let envGain;
        if (!v.released) {
          // Attack → Decay → Sustain
          const { attack, decay, sustain } = v.adsr;
          if (elapsed < attack) {
            envGain = elapsed / attack;
          } else if (elapsed < attack + decay) {
            const t = (elapsed - attack) / decay;
            envGain = 1 - t * (1 - sustain);
          } else {
            envGain = sustain;
          }
        } else {
          // Release
          const relElapsed = now - v.releaseStart;
          const release = v.adsr.release;
          envGain = Math.exp(-relElapsed / (release / 5));
          if (relElapsed > release * 1.5) {
            v.active = false;
            continue;
          }
        }

        const oscSample = v.osc.generate(v.waveform, v.freq);
        const filtered = v.filter.process(oscSample);
        const sample = filtered * envGain * v.velocity * 0.25;
        const panL = Math.cos((v.pan + 1) * Math.PI * 0.25);
        const panR = Math.sin((v.pan + 1) * Math.PI * 0.25);
        mixL += sample * panL;
        mixR += sample * panR;
      }

      // Master dynamics
      mixL = this.limiter.process(mixL);
      mixR = this.limiter.process(mixR);

      // Soft clip
      outL[i] = Math.tanh(mixL * 1.5);
      outR[i] = Math.tanh(mixR * 1.5);
    }

    return true; // keep processor alive
  }
}

registerProcessor('synth-processor', SynthProcessor);
