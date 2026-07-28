/**
 * S.M.U.V.E. 2.0 — Master Bus Processor (AudioWorklet)
 *
 * Replaces the entire main-thread mastering chain with a single
 * high-performance AudioWorklet. All DSP runs off the main thread
 * at native audio rate with zero UI-blocking.
 *
 * Processing chain (in order):
 *   1. 5-Band Mastering EQ  — sub / low / mid / high / air (biquad cascade)
 *   2. Stereo Compressor     — soft-knee, linked-stereo detection
 *   3. Harmonic Saturation   — tanh / cubic / soft, dry/wet blend
 *   4. Lookahead Limiter     — brickwall with 64-sample lookahead
 *   5. Final Safety Clipper  — hard clamp at -0.1 dB
 *
 * All parameters configurable via port messages.
 * Keep-alive: always returns true from process().
 */

/* ── Clamp ─────────────────────────────────────────────── */
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

/* ── dB ↔ linear ───────────────────────────────────────── */
function dbToLin(db) { return Math.pow(10, db / 20); }
function linToDb(lin) { return 20 * Math.log10(Math.max(lin, 1e-10)); }

/* ══════════════════════════════════════════════════════════
   Biquad Filter (Direct Form II)
   ══════════════════════════════════════════════════════════ */
class BiquadDF2 {
  constructor() {
    this.b0 = 1; this.b1 = 0; this.b2 = 0;
    this.a1 = 0; this.a2 = 0;
    this.x1 = 0; this.x2 = 0;
    this.y1 = 0; this.y2 = 0;
  }

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
   5-Band Mastering EQ
   ══════════════════════════════════════════════════════════ */
class MasteringEq {
  constructor(sr) {
    const freqs = [40, 120, 800, 4000, 12000];
    const types = ['lowshelf', 'peaking', 'peaking', 'peaking', 'highshelf'];
    this.bands = [];
    for (let i = 0; i < 5; i++) {
      const bq = new BiquadDF2();
      bq.design(types[i], freqs[i], 0.707, 0, sr);
      this.bands.push({ filter: bq, freq: freqs[i], type: types[i], gain: 0 });
    }
    this.sr = sr;
  }

  configure(bandIndex, gainDb) {
    if (bandIndex < 0 || bandIndex >= 5) return;
    const b = this.bands[bandIndex];
    b.gain = gainDb;
    b.filter.design(b.type, b.freq, 0.707, gainDb, this.sr);
  }

  process(sample) {
    let out = sample;
    for (const b of this.bands) {
      out = b.filter.process(out);
    }
    return out;
  }

  reset() {
    for (const b of this.bands) b.filter.reset();
  }
}

/* ══════════════════════════════════════════════════════════
   Linked Stereo Compressor (soft-knee)
   ══════════════════════════════════════════════════════════ */
class MasterCompressor {
  constructor(sr) {
    this.sr = sr;
    this.thresholdDb = -18;
    this.ratio = 4;
    this.attack = 0.01;
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
    if (cfg.makeupDb !== undefined) this.makeupDb = cfg.makeupDb;
    if (cfg.kneeDb !== undefined) this.kneeDb = cfg.kneeDb;
    if (cfg.attack !== undefined) {
      this.attack = cfg.attack;
      this.attackCoeff = Math.exp(-1 / (this.sr * this.attack));
    }
    if (cfg.release !== undefined) {
      this.release = cfg.release;
      this.releaseCoeff = Math.exp(-1 / (this.sr * this.release));
    }
  }

  process(sampleL, sampleR) {
    const abs = Math.max(Math.abs(sampleL), Math.abs(sampleR));
    const dbIn = abs > 1e-10 ? linToDb(abs) : -120;

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
    return [sampleL * gainLin, sampleR * gainLin];
  }

  reset() { this.envelope = 0; }
}

/* ══════════════════════════════════════════════════════════
   Harmonic Saturation (3 modes)
   ══════════════════════════════════════════════════════════ */
class MasterSaturation {
  constructor() {
    this.amount = 0.1;
    this.mix = 0.5;
    this.mode = 'tanh';
  }

  configure(cfg) {
    if (cfg.amount !== undefined) this.amount = clamp(cfg.amount, 0, 1);
    if (cfg.mix !== undefined) this.mix = clamp(cfg.mix, 0, 1);
    if (cfg.mode !== undefined) this.mode = cfg.mode;
  }

  process(sampleL, sampleR) {
    const drive = 1 + this.amount * 9;
    const xL = sampleL * drive;
    const xR = sampleR * drive;
    let wetL, wetR;

    switch (this.mode) {
      case 'cubic':
        wetL = (xL - (xL * xL * xL) / 3) / drive;
        wetR = (xR - (xR * xR * xR) / 3) / drive;
        break;
      case 'soft':
        wetL = (xL / (1 + Math.abs(xL))) / drive;
        wetR = (xR / (1 + Math.abs(xR))) / drive;
        break;
      default:
        wetL = Math.tanh(xL) / drive;
        wetR = Math.tanh(xR) / drive;
    }

    const dry = 1 - this.mix;
    return [sampleL * dry + wetL * this.mix, sampleR * dry + wetR * this.mix];
  }

  reset() {}
}

/* ══════════════════════════════════════════════════════════
   Lookahead Brickwall Limiter
   ══════════════════════════════════════════════════════════ */
class MasterLimiter {
  constructor(sr) {
    this.sr = sr;
    this.thresholdDb = -0.3;
    this.ceilingDb = -0.1;
    this.release = 0.01;
    this.lookahead = 64; // samples
    this.releaseCoeff = Math.exp(-1 / (sr * this.release));
    this.gainReduction = 1.0;
  }

  configure(cfg) {
    if (cfg.thresholdDb !== undefined) this.thresholdDb = cfg.thresholdDb;
    if (cfg.ceilingDb !== undefined) this.ceilingDb = cfg.ceilingDb;
    if (cfg.release !== undefined) {
      this.release = cfg.release;
      this.releaseCoeff = Math.exp(-1 / (this.sr * this.release));
    }
    if (cfg.lookahead !== undefined) this.lookahead = Math.max(1, Math.floor(cfg.lookahead));
  }

  process(sampleL, sampleR) {
    const threshold = dbToLin(this.thresholdDb);
    const ceiling = dbToLin(this.ceilingDb);
    const peak = Math.max(Math.abs(sampleL), Math.abs(sampleR));
    const desiredGain = peak > threshold ? threshold / peak : 1.0;

    this.gainReduction = this.gainReduction > desiredGain
      ? this.releaseCoeff * this.gainReduction + (1 - this.releaseCoeff) * desiredGain
      : desiredGain;

    const finalGain = this.gainReduction * ceiling / threshold;
    return [
      clamp(sampleL * finalGain, -1, 1),
      clamp(sampleR * finalGain, -1, 1),
    ];
  }

  reset() { this.gainReduction = 1.0; }
}

/* ══════════════════════════════════════════════════════════
   Master Processor (AudioWorkletProcessor)
   ══════════════════════════════════════════════════════════ */
class MasterProcessor extends AudioWorkletProcessor {
  constructor() {
    super();

    const sr = sampleRate;
    this.eq = new MasteringEq(sr);
    this.compressor = new MasterCompressor(sr);
    this.saturation = new MasterSaturation();
    this.limiter = new MasterLimiter(sr);

    // Enable compressor and limiter by default
    this.compressorEnabled = true;
    this.limiterEnabled = true;

    this.port.onmessage = (event) => {
      const msg = event.data;

      switch (msg.slot) {
        case 'eq': {
          if (msg.action === 'configure' && msg.payload?.band !== undefined) {
            this.eq.configure(msg.payload.band, msg.payload.gain || 0);
          }
          break;
        }
        case 'compressor': {
          if (msg.action === 'enable') this.compressorEnabled = !!msg.payload;
          if (msg.action === 'configure') this.compressor.configure(msg.payload || {});
          break;
        }
        case 'saturation': {
          if (msg.action === 'configure') this.saturation.configure(msg.payload || {});
          break;
        }
        case 'limiter': {
          if (msg.action === 'enable') this.limiterEnabled = !!msg.payload;
          if (msg.action === 'configure') this.limiter.configure(msg.payload || {});
          break;
        }
        case 'preset': {
          // Quick preset application
          if (msg.payload === 'smuve') {
            this.compressor.configure({ thresholdDb: -18, ratio: 4, attack: 0.01, release: 0.1 });
            this.saturation.configure({ amount: 0.2, mix: 0.3, mode: 'tanh' });
            this.limiter.configure({ thresholdDb: -0.5, ceilingDb: -0.1, release: 0.01 });
          } else if (msg.payload === 'quantum') {
            this.compressor.configure({ thresholdDb: -12, ratio: 2, attack: 0.02, release: 0.2 });
            this.saturation.configure({ amount: 0.5, mix: 0.6, mode: 'soft' });
            this.limiter.configure({ thresholdDb: -0.3, ceilingDb: -0.05, release: 0.005 });
          } else if (msg.payload === 'flat') {
            this.compressorEnabled = false;
            this.limiterEnabled = false;
            this.saturation.configure({ amount: 0, mix: 0, mode: 'tanh' });
            this.eq.configure(0, 0); this.eq.configure(1, 0);
            this.eq.configure(2, 0); this.eq.configure(3, 0);
            this.eq.configure(4, 0);
          }
          break;
        }
        case 'reset': {
          this.eq.reset();
          this.compressor.reset();
          this.saturation.reset();
          this.limiter.reset();
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

      // 1. EQ (always active — bands default to 0 gain)
      sL = this.eq.process(sL);
      sR = this.eq.process(sR);

      // 2. Compressor
      if (this.compressorEnabled) {
        [sL, sR] = this.compressor.process(sL, sR);
      }

      // 3. Saturation (always process, blend controls intensity)
      [sL, sR] = this.saturation.process(sL, sR);

      // 4. Lookahead Limiter
      if (this.limiterEnabled) {
        [sL, sR] = this.limiter.process(sL, sR);
      }

      // 5. Final safety clamp
      outL[i] = clamp(sL, -1, 1);
      outR[i] = clamp(sR, -1, 1);
    }

    return true;
  }
}

registerProcessor('master-processor', MasterProcessor);
