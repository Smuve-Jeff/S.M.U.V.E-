/**
 * S.M.U.V.E. 2.0 — Sidechain Ducking Processor (AudioWorklet)
 *
 * Phase 2 Latency Revolution: Professional sidechain compression
 * that reacts sample-accurately to a trigger input without main-thread
 * involvement.
 *
 * Architecture:
 *   Input 0 (channels 0-1): Main signal — the track being ducked
 *   Input 1 (channels 0-1): Sidechain trigger — the kick/drum signal
 *
 * Processing:
 *   1. Extract RMS envelope from sidechain input
 *   2. Apply soft-knee gain reduction curve to main signal
 *   3. Independent attack/release envelope smoothing
 *   4. Stereo-linked gain reduction (identical gain applied to L/R)
 *
 * The processor stays alive as long as the parent AudioWorkletNode exists.
 * Send CONFIGURE messages to adjust threshold, ratio, attack, release, knee.
 */

/* ── Clamp ─────────────────────────────────────────────── */
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

/* ── dB ↔ linear ───────────────────────────────────────── */
function dbToLin(db) { return Math.pow(10, db / 20); }
function linToDb(lin) { return 20 * Math.log10(Math.max(lin, 1e-10)); }

/* ══════════════════════════════════════════════════════════
   Sidechain Processor
   ══════════════════════════════════════════════════════════ */
class SidechainProcessor extends AudioWorkletProcessor {
  constructor() {
    super();

    const sr = sampleRate;

    // ── Default parameters (aggressive pump) ──
    this.thresholdDb = -30;    // dB — signals above this trigger ducking
    this.ratio = 8;            // :1 — gain reduction ratio
    this.attack = 0.002;       // seconds — how fast ducking kicks in
    this.release = 0.08;       // seconds — how fast signal recovers
    this.kneeDb = 4;           // dB — soft knee width
    this.makeupDb = 3;         // dB — post-reduction gain compensation
    this.rangeDb = -24;        // dB — maximum gain reduction (floor)

    // ── Envelope state ──
    this._envDb = -120;        // current envelope in dB
    this._attackCoeff = Math.exp(-1 / (sr * this.attack));
    this._releaseCoeff = Math.exp(-1 / (sr * this.release));

    // ── Smoothing for RMS extraction ──
    this._rmsWindow = Math.floor(sr * 0.005); // 5ms RMS window
    this._rmsBuf = new Float32Array(this._rmsWindow);
    this._rmsIdx = 0;
    this._rmsSum = 0;

    this.port.onmessage = (event) => {
      /** @type {{ type: string, payload?: any }} */
      const msg = event.data;

      switch (msg.type) {
        case 'CONFIGURE': {
          const cfg = msg.payload || {};
          if (cfg.thresholdDb !== undefined) this.thresholdDb = cfg.thresholdDb;
          if (cfg.ratio !== undefined) this.ratio = cfg.ratio;
          if (cfg.rangeDb !== undefined) this.rangeDb = cfg.rangeDb;
          if (cfg.makeupDb !== undefined) this.makeupDb = cfg.makeupDb;
          if (cfg.kneeDb !== undefined) this.kneeDb = cfg.kneeDb;
          if (cfg.attack !== undefined) {
            this.attack = cfg.attack;
            this._attackCoeff = Math.exp(-1 / (sampleRate * this.attack));
          }
          if (cfg.release !== undefined) {
            this.release = cfg.release;
            this._releaseCoeff = Math.exp(-1 / (sampleRate * this.release));
          }
          break;
        }
        case 'RESET': {
          this._envDb = -120;
          this._rmsSum = 0;
          this._rmsBuf.fill(0);
          this._rmsIdx = 0;
          break;
        }
      }
    };
  }

  process(inputs, outputs) {
    const mainIn = inputs[0];
    const sideIn = inputs[1];
    const out = outputs[0];

    if (!out || out.length === 0) return true;

    const outL = out[0];
    const outR = out.length > 1 ? out[1] : out[0];

    if (!mainIn || mainIn.length === 0) {
      // No main input → passthrough silence
      for (let i = 0; i < outL.length; i++) {
        outL[i] = 0;
        outR[i] = 0;
      }
      return true;
    }

    const mainL = mainIn[0] || new Float32Array(outL.length);
    const mainR = mainIn.length > 1 ? mainIn[1] : mainL;

    const hasSidechain = sideIn && sideIn.length > 0;
    const sideL = hasSidechain ? (sideIn[0] || new Float32Array(outL.length)) : mainL;
    // Use sideL for envelope detection even if mainL is different size

    const frameCount = outL.length;

    for (let i = 0; i < frameCount; i++) {
      // ── Extract sidechain envelope (RMS) ──
      const scSample = i < sideL.length ? sideL[i] : 0;
      const scSq = scSample * scSample;

      // Rolling RMS
      this._rmsSum -= this._rmsBuf[this._rmsIdx];
      this._rmsSum += scSq;
      this._rmsBuf[this._rmsIdx] = scSq;
      this._rmsIdx = (this._rmsIdx + 1) % this._rmsWindow;

      const rms = Math.sqrt(Math.max(0, this._rmsSum / this._rmsWindow));
      const dbIn = rms > 1e-10 ? linToDb(rms) : -120;

      // ── Compute target gain reduction ──
      let over = 0;
      const kh = this.kneeDb / 2;
      if (dbIn > this.thresholdDb + kh) {
        over = dbIn - this.thresholdDb;
      } else if (dbIn > this.thresholdDb - kh) {
        const base = dbIn - this.thresholdDb + kh;
        over = (base * base) / (2 * this.kneeDb);
      }

      let targetGr = over * (1 - 1 / this.ratio);
      targetGr = Math.min(targetGr, -this.rangeDb); // floor at max reduction

      // ── Envelope follower (attack/release) ──
      const coeff = targetGr < this._envDb ? this._attackCoeff : this._releaseCoeff;
      this._envDb = coeff * this._envDb + (1 - coeff) * targetGr;

      // ── Apply gain reduction to main signal ──
      const gainDb = this._envDb + this.makeupDb;
      const gainLin = dbToLin(clamp(gainDb, -60, 12));

      const ml = i < mainL.length ? mainL[i] : 0;
      const mr = i < mainR.length ? mainR[i] : 0;

      outL[i] = clamp(ml * gainLin, -1, 1);
      outR[i] = clamp(mr * gainLin, -1, 1);
    }

    return true;
  }
}

registerProcessor('sidechain-processor', SidechainProcessor);
