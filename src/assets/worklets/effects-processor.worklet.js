/**
 * S.M.U.V.E. 2.0 — Effects Chain Processor (AudioWorklet)
 *
 * Phase 1 Latency Revolution: Moves the entire effects rack DSP
 * off the main thread into a dedicated audio rendering thread.
 *
 * Supported effect slots (process in order):
 *   1. 7-Band EQ       — biquad cascade (lowshelf × peaking × highshelf)
 *   2. Compressor      — soft-knee envelope follower with make-up gain
 *   3. Saturation      — polynomial soft-clip (tanh or cubic)
 *   4. Delay           — stereo ping-pong with feedback
 *   5. Reverb          — Freeverb-style feedback delay network
 *
 * Each slot can be independently enabled/disabled and configured
 * via port messages. Input/output is stereo.
 */

/* ── Clamp ─────────────────────────────────────────────── */
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

/* ── dB ↔ linear ───────────────────────────────────────── */
function dbToLin(db) { return Math.pow(10, db / 20); }
function linToDb(lin) { return 20 * Math.log10(Math.max(lin, 1e-10)); }

/* ══════════════════════════════════════════════════════════
   Biquad Filter (Direct Form II) — used by EQ bands
   ══════════════════════════════════════════════════════════ */
class BiquadDF2 {
  constructor() {
    this.b0 = 1; this.b1 = 0; this.b2 = 0;
    this.a1 = 0; this.a2 = 0;
    this.x1 = 0; this.x2 = 0;
    this.y1 = 0; this.y2 = 0;
  }

  /** Design filter coeffs: type = lowshelf | peaking | highshelf */
  design(type, freq, q, gainDb, sr) {
    const w0 = 2 * Math.PI * freq / sr;
    const cosW0 = Math.cos(w0);
    const sinW0 = Math.sin(w0);
    const alpha = sinW0 / (2 * q);
    const A = dbToLin(gainDb);

    let b0, b1, b2, a0, a1, a2;

    switch (type) {
      case 'lowshelf':
        b0 = A * ((A + 1) - (A - 1) * cosW0 + 2 * Math.sqrt(A) * alpha);
        b1 = 2 * A * ((A - 1) - (A + 1) * cosW0);
        b2 = A * ((A + 1) - (A - 1) * cosW0 - 2 * Math.sqrt(A) * alpha);
        a0 = (A + 1) + (A - 1) * cosW0 + 2 * Math.sqrt(A) * alpha;
        a1 = -2 * ((A - 1) + (A + 1) * cosW0);
        a2 = (A + 1) + (A - 1) * cosW0 - 2 * Math.sqrt(A) * alpha;
        break;
      case 'highshelf':
        b0 = A * ((A + 1) + (A - 1) * cosW0 + 2 * Math.sqrt(A) * alpha);
        b1 = -2 * A * ((A - 1) + (A + 1) * cosW0);
        b2 = A * ((A + 1) + (A - 1) * cosW0 - 2 * Math.sqrt(A) * alpha);
        a0 = (A + 1) - (A - 1) * cosW0 + 2 * Math.sqrt(A) * alpha;
        a1 = 2 * ((A - 1) - (A + 1) * cosW0);
        a2 = (A + 1) - (A - 1) * cosW0 - 2 * Math.sqrt(A) * alpha;
        break;
      case 'peaking':
      default:
        b0 = 1 + alpha * A;
        b1 = -2 * cosW0;
        b2 = 1 - alpha * A;
        a0 = 1 + alpha / A;
        a1 = -2 * cosW0;
        a2 = 1 - alpha / A;
    }

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

/* ══════════════════════════════════════════════════════════
   7-Band Equalizer
   ══════════════════════════════════════════════════════════ */
class EqSlot {
  constructor(sr) {
    this.enabled = false;
    this.bands = [];
    const freqs = [60, 170, 350, 1000, 3500, 10000, 16000];
    const types = ['lowshelf', 'peaking', 'peaking', 'peaking', 'peaking', 'peaking', 'highshelf'];
    for (let i = 0; i < 7; i++) {
      const bq = new BiquadDF2();
      bq.design(types[i], freqs[i], 1.0, 0, sr);
      this.bands.push({ filter: bq, gain: 0 });
    }
  }

  configure(bandIndex, gainDb, sr) {
    if (bandIndex < 0 || bandIndex >= 7) return;
    this.bands[bandIndex].gain = gainDb;
    const freqs = [60, 170, 350, 1000, 3500, 10000, 16000];
    const types = ['lowshelf', 'peaking', 'peaking', 'peaking', 'peaking', 'peaking', 'highshelf'];
    this.bands[bandIndex].filter.design(types[bandIndex], freqs[bandIndex], 1.0, gainDb, sr);
  }

  process(sample) {
    let out = sample;
    for (const band of this.bands) {
      out = band.filter.process(out);
    }
    return out;
  }

  reset() {
    for (const b of this.bands) b.filter.reset();
  }
}

/* ══════════════════════════════════════════════════════════
   Soft-Knee Compressor
   ══════════════════════════════════════════════════════════ */
class CompressorSlot {
  constructor(sr) {
    this.enabled = false;
    this.sr = sr;
    this.thresholdDb = -24;
    this.ratio = 4;
    this.attack = 0.003;
    this.release = 0.1;
    this.kneeDb = 6;
    this.makeupDb = 0;
    this.envelope = 0;
    this.attackCoeff = Math.exp(-1 / (sr * this.attack));
    this.releaseCoeff = Math.exp(-1 / (sr * this.release));
  }

  configure(cfg) {
    if (cfg.thresholdDb !== undefined) this.thresholdDb = cfg.thresholdDb;
    if (cfg.ratio !== undefined) this.ratio = cfg.ratio;
    if (cfg.attack !== undefined) {
      this.attack = cfg.attack;
      this.attackCoeff = Math.exp(-1 / (this.sr * this.attack));
    }
    if (cfg.release !== undefined) {
      this.release = cfg.release;
      this.releaseCoeff = Math.exp(-1 / (this.sr * this.release));
    }
    if (cfg.kneeDb !== undefined) this.kneeDb = cfg.kneeDb;
    if (cfg.makeupDb !== undefined) this.makeupDb = cfg.makeupDb;
  }

  process(sample) {
    const abs = Math.abs(sample);
    const dbIn = abs > 1e-10 ? linToDb(abs) : -120;

    // Soft knee
    let over = 0;
    const kh = this.kneeDb / 2;
    if (dbIn > this.thresholdDb + kh) {
      over = dbIn - this.thresholdDb;
    } else if (dbIn > this.thresholdDb - kh) {
      const base = dbIn - this.thresholdDb + kh;
      over = (base * base) / (2 * this.kneeDb);
    }

    const targetGr = over * (1 - 1 / this.ratio);
    const coeff = targetGr > this.envelope ? this.attackCoeff : this.releaseCoeff;
    this.envelope = coeff * this.envelope + (1 - coeff) * targetGr;

    const gainLin = dbToLin(-this.envelope + this.makeupDb);
    return sample * gainLin;
  }

  reset() { this.envelope = 0; }
}

/* ══════════════════════════════════════════════════════════
   Saturation (polynomial soft-clip)
   ══════════════════════════════════════════════════════════ */
class SaturationSlot {
  constructor() {
    this.enabled = false;
    this.amount = 0.5;    // 0..1
    this.mode = 'tanh';   // 'tanh' | 'cubic' | 'soft'
  }

  configure(cfg) {
    if (cfg.amount !== undefined) this.amount = clamp(cfg.amount, 0, 1);
    if (cfg.mode !== undefined) this.mode = cfg.mode;
  }

  process(sample) {
    const drive = 1 + this.amount * 9; // 1x → 10x drive
    const x = sample * drive;

    switch (this.mode) {
      case 'cubic':
        return (x - (x * x * x) / 3) / drive;
      case 'soft':
        // Rational soft-clip
        return (x / (1 + Math.abs(x))) / drive;
      case 'tanh':
      default:
        return Math.tanh(x) / drive;
    }
  }

  reset() {}
}

/* ══════════════════════════════════════════════════════════
   Stereo Delay (ping-pong)
   ══════════════════════════════════════════════════════════ */
class DelaySlot {
  constructor(sr) {
    this.enabled = false;
    this.sr = sr;
    this.timeL = 0.3;
    this.timeR = 0.45;
    this.feedback = 0.5;
    this.mix = 0.4;
    this._bufL = new Float32Array(Math.ceil(sr * 2));
    this._bufR = new Float32Array(Math.ceil(sr * 2));
    this._len = this._bufL.length;
    this._writePtr = 0;
    this._bufL.fill(0);
    this._bufR.fill(0);
  }

  configure(cfg) {
    if (cfg.time !== undefined) {
      this.timeL = cfg.time;
      this.timeR = cfg.time * 1.5;
    }
    if (cfg.timeL !== undefined) this.timeL = cfg.timeL;
    if (cfg.timeR !== undefined) this.timeR = cfg.timeR;
    if (cfg.feedback !== undefined) this.feedback = clamp(cfg.feedback, 0, 0.95);
    if (cfg.mix !== undefined) this.mix = clamp(cfg.mix, 0, 1);
  }

  process(sampleL, sampleR) {
    const delaySampsL = Math.min(this._len - 1, Math.floor(this.timeL * this.sr));
    const delaySampsR = Math.min(this._len - 1, Math.floor(this.timeR * this.sr));

    const readPtrL = (this._writePtr - delaySampsL + this._len) % this._len;
    const readPtrR = (this._writePtr - delaySampsR + this._len) % this._len;

    // Ping-pong: L delay → R channel, R delay → L channel
    const dL = this._bufR[readPtrR]; // right delay feeds left
    const dR = this._bufL[readPtrL]; // left delay feeds right

    // Write new samples into ring buffer with feedback cross-mix
    this._bufL[this._writePtr] = sampleL + dR * this.feedback;
    this._bufR[this._writePtr] = sampleR + dL * this.feedback;

    this._writePtr = (this._writePtr + 1) % this._len;

    const wet = this.mix;
    const dry = 1 - wet;
    return [sampleL * dry + dR * wet, sampleR * dry + dL * wet];
  }

  reset() {
    this._bufL.fill(0);
    this._bufR.fill(0);
    this._writePtr = 0;
  }
}

/* ══════════════════════════════════════════════════════════
   Algorithmic Reverb (Freeverb-style FDN)
   ══════════════════════════════════════════════════════════ */
class ReverbSlot {
  constructor(sr) {
    this.enabled = false;
    this.sr = sr;
    this.mix = 0.3;
    this.decay = 0.5;

    // 8-comb + 4-allpass feedback delay network
    const combDelays = [1557, 1617, 1491, 1422, 1277, 1356, 1188, 1116];
    const allpassDelays = [225, 556, 441, 341];

    this.combs = [];
    for (const d of combDelays) {
      const len = Math.max(1, Math.floor(d * sr / 44100));
      this.combs.push({ buf: new Float32Array(len), ptr: 0, len, feedback: 0.84 });
    }

    this.allpasses = [];
    for (const d of allpassDelays) {
      const len = Math.max(1, Math.floor(d * sr / 44100));
      this.allpasses.push({ buf: new Float32Array(len), ptr: 0, len, feedback: 0.5 });
    }

    // Stereo spread
    this._prevL = 0;
    this._prevR = 0;
  }

  configure(cfg) {
    if (cfg.mix !== undefined) this.mix = clamp(cfg.mix, 0, 1);
    if (cfg.decay !== undefined) {
      this.decay = clamp(cfg.decay, 0.1, 0.99);
      for (const c of this.combs) {
        c.feedback = 0.7 + this.decay * 0.25;
      }
    }
  }

  process(sampleL, sampleR) {
    const monoIn = (sampleL + sampleR) * 0.5;

    // ── Comb filters (parallel) ──
    let combOut = 0;
    for (const c of this.combs) {
      const read = c.buf[c.ptr];
      c.buf[c.ptr] = monoIn + read * c.feedback;
      c.ptr = (c.ptr + 1) % c.len;
      combOut += read;
    }
    combOut *= 0.125; // normalize by comb count

    // ── Allpass filters (series) ──
    let apOut = combOut;
    for (const a of this.allpasses) {
      const read = a.buf[a.ptr];
      const feedforward = apOut + read * a.feedback;
      a.buf[a.ptr] = feedforward;
      a.ptr = (a.ptr + 1) % a.len;
      apOut = read - apOut * a.feedback;
    }

    // Stereo decorrelation
    const wetL = apOut * 0.6 + this._prevL * 0.4;
    const wetR = apOut * -0.6 + this._prevR * 0.4;
    this._prevL = wetL;
    this._prevR = wetR;

    const dry = 1 - this.mix;
    return [sampleL * dry + wetL * this.mix, sampleR * dry + wetR * this.mix];
  }

  reset() {
    for (const c of this.combs) { c.buf.fill(0); c.ptr = 0; }
    for (const a of this.allpasses) { a.buf.fill(0); a.ptr = 0; }
    this._prevL = 0;
    this._prevR = 0;
  }
}

/* ══════════════════════════════════════════════════════════
   Master Effects Processor
   ══════════════════════════════════════════════════════════ */
class EffectsProcessor extends AudioWorkletProcessor {
  constructor() {
    super();

    const sr = sampleRate;

    this.eq = new EqSlot(sr);
    this.compressor = new CompressorSlot(sr);
    this.saturation = new SaturationSlot();
    this.delay = new DelaySlot(sr);
    this.reverb = new ReverbSlot(sr);

    // Effect slots in processing order
    this.slots = [this.eq, this.compressor, this.saturation, this.delay, this.reverb];

    // Master output gain (safety limiter)
    this.masterGain = 1.0;
    this._envPeak = 0;
    this._limiterCoeff = Math.exp(-1 / (sr * 0.01)); // 10ms release

    this.port.onmessage = (event) => {
      /** @type {{ slot: string, action: string, payload?: any }} */
      const msg = event.data;

      switch (msg.slot) {
        case 'eq': {
          if (msg.action === 'enable') this.eq.enabled = !!msg.payload;
          if (msg.action === 'configure' && msg.payload?.band !== undefined) {
            this.eq.configure(msg.payload.band, msg.payload.gain || 0, sr);
          }
          break;
        }
        case 'compressor': {
          if (msg.action === 'enable') this.compressor.enabled = !!msg.payload;
          if (msg.action === 'configure') this.compressor.configure(msg.payload || {});
          break;
        }
        case 'saturation': {
          if (msg.action === 'enable') this.saturation.enabled = !!msg.payload;
          if (msg.action === 'configure') this.saturation.configure(msg.payload || {});
          break;
        }
        case 'delay': {
          if (msg.action === 'enable') this.delay.enabled = !!msg.payload;
          if (msg.action === 'configure') this.delay.configure(msg.payload || {});
          break;
        }
        case 'reverb': {
          if (msg.action === 'enable') this.reverb.enabled = !!msg.payload;
          if (msg.action === 'configure') this.reverb.configure(msg.payload || {});
          break;
        }
        case 'master': {
          if (msg.action === 'configure' && msg.payload?.gain !== undefined) {
            this.masterGain = clamp(msg.payload.gain, 0, 2);
          }
          break;
        }
        case 'reset': {
          for (const s of this.slots) { s.reset(); s.enabled = false; }
          this._envPeak = 0;
          break;
        }
      }
    };
  }

  process(inputs, outputs) {
    const input = inputs[0];
    const output = outputs[0];
    if (!input || !output || input.length === 0 || output.length === 0) return true;

    const inL = input[0] || new Float32Array(0);
    const inR = (input.length > 1 ? input[1] : inL) || new Float32Array(0);
    const outL = output[0];
    const outR = output.length > 1 ? output[1] : output[0];
    const frameCount = outL.length;

    for (let i = 0; i < frameCount; i++) {
      let sL = inL[i] || 0;
      let sR = inR[i] || 0;

      // ── Process each enabled slot ──
      // EQ (stereo — same processing on both channels)
      if (this.eq.enabled) {
        sL = this.eq.process(sL);
        sR = this.eq.process(sR);
      }

      // Compressor (linked stereo — gain reduction from mid signal)
      if (this.compressor.enabled) {
        const mid = (sL + sR) * 0.5;
        const grMid = this.compressor.process(mid);
        // Apply same gain reduction factor to both channels
        const grFactor = Math.abs(mid) > 1e-10 ? grMid / mid : 1;
        sL = sL * grFactor;
        sR = sR * grFactor;
      }

      // Saturation (independent per channel)
      if (this.saturation.enabled) {
        sL = this.saturation.process(sL);
        sR = this.saturation.process(sR);
      }

      // Delay + Reverb (intrinsically stereo)
      if (this.delay.enabled) {
        [sL, sR] = this.delay.process(sL, sR);
      }

      if (this.reverb.enabled) {
        [sL, sR] = this.reverb.process(sL, sR);
      }

      // ── Master limiter ──
      const peak = Math.max(Math.abs(sL), Math.abs(sR));
      this._envPeak = this._limiterCoeff * this._envPeak + (1 - this._limiterCoeff) * peak;
      const limGain = this._envPeak > 1.0 ? 1.0 / this._envPeak : 1.0;

      outL[i] = clamp(sL * this.masterGain * limGain, -1, 1);
      outR[i] = clamp(sR * this.masterGain * limGain, -1, 1);
    }

    return true;
  }
}

registerProcessor('effects-processor', EffectsProcessor);
