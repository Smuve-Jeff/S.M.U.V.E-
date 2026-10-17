/**
 * PitchCorrector — real-time monophonic pitch correction AudioWorklet.
 *
 * DSP chain (per render quantum):
 *   1. Write the input into a detection ring + a grain ring.
 *   2. Every N quanta, run a YIN-lite autocorrelation on a decimated window
 *      to estimate the fundamental frequency and a voiced confidence.
 *   3. Map f0 to the nearest note in the selected scale, compute the
 *      correction ratio, smooth it with the retune-speed coefficient and
 *      scale it by the correction amount.
 *   4. Shift the pitch in real time with a dual-grain resampler (crossfaded
 *      windows) driven by the smoothed ratio.
 *   5. Bypass straight to the output when disabled / amount ≈ 0 / unvoiced.
 *
 * Port messages: { type: 'config', enabled, amount, retuneSpeed, root,
 *                  scaleNotes } — scaleNotes are semitone intervals from the
 * root (e.g. C Major → [0, 2, 4, 5, 7, 9, 11]).
 */
class PitchCorrector extends AudioWorkletProcessor {
  constructor() {
    super();
    this.sr = sampleRate;

    // ── User-facing configuration ─────────────────────────────
    // Default to bypass until the main thread posts real config, so the
    // stage never applies correction before the UI state arrives.
    this.enabled = false;
    this.amount = 0;
    this.retuneSpeed = 0.1;
    this.root = 0;
    this.scaleNotes = [0, 2, 4, 5, 7, 9, 11];

    // ── Pitch-detection state ─────────────────────────────────
    this.detRing = new Float32Array(2048);
    this.detPos = 0;
    this.block = 0;
    this.detectEvery = 8; // run detection every 8 quanta (~1024 samples)
    this.f0 = 0;
    this.voiced = false;
    this.ratio = 1.0; // smoothed correction ratio

    // ── Granular pitch-shift state ────────────────────────────
    this.grainSize = 1024;
    this.hop = 256;
    this.fade = 128;
    this.ring = new Float32Array(this.grainSize + this.fade);
    this.writePos = 0;
    this.grains = [
      new Float32Array(this.grainSize),
      new Float32Array(this.grainSize),
    ];
    this.playPos = [0, 0];
    this.audible = 0; // grain currently on top of the mix
    this.nextGrain = 1;
    this.sinceHop = 0;
    this.fadePos = this.fade; // past the fade → full switch

    this.port.onmessage = (e) => this.configure(e.data);
  }

  configure(data) {
    if (!data || typeof data !== 'object') return;
    if (typeof data.enabled === 'boolean') this.enabled = data.enabled;
    if (typeof data.amount === 'number') {
      this.amount = Math.max(0, Math.min(1, data.amount));
    }
    if (typeof data.retuneSpeed === 'number') {
      this.retuneSpeed = Math.max(0, Math.min(1, data.retuneSpeed));
    }
    if (typeof data.root === 'number') {
      this.root = ((data.root % 12) + 12) % 12;
    }
    if (Array.isArray(data.scaleNotes) && data.scaleNotes.length > 0) {
      const set = data.scaleNotes
        .map((n) => ((Number(n) % 12) + 12) % 12)
        .sort((a, b) => a - b);
      if (set.length > 0) this.scaleNotes = set;
    }
  }

  process(inputs, outputs) {
    const input = inputs[0];
    const output = outputs[0];
    if (!input || !input[0] || !output || !output[0]) return true;
    const inCh = input[0];
    const outCh = output[0];
    const len = Math.min(inCh.length, outCh.length);
    const bypass = !this.enabled || this.amount <= 0.001;

    for (let i = 0; i < len; i++) {
      const x = inCh[i];
      this.detRing[this.detPos] = x;
      this.detPos = (this.detPos + 1) % this.detRing.length;
      this.ring[this.writePos] = x;
      this.writePos = (this.writePos + 1) % this.ring.length;
      this.sinceHop++;

      if (!bypass && this.sinceHop >= this.hop) {
        this.sinceHop = 0;
        this.captureGrain();
      }
      // Advance the crossfade envelope once per sample.
      if (this.fadePos < this.fade) this.fadePos++;

      if (bypass) {
        outCh[i] = x;
        continue;
      }

      // Dual-grain resampled pitch shift (read faster ⇒ higher pitch).
      const rate = 1 + (this.ratio - 1) * this.amount;
      let out = 0;
      for (let g = 0; g < 2; g++) {
        const pos = this.playPos[g];
        const i0 = Math.floor(pos);
        const frac = pos - i0;
        const i1 = (i0 + 1) % this.grainSize;
        const sample =
          this.grains[g][i0] +
          (this.grains[g][i1] - this.grains[g][i0]) * frac;
        out += sample * this.gainFor(g);
        this.playPos[g] = (pos + rate) % this.grainSize;
      }
      outCh[i] = out;
    }

    this.block++;
    if (!bypass && this.block % this.detectEvery === 0) {
      this.detectPitch();
    }
    return true;
  }

  /** Snapshot the latest grainSize samples into the standby grain. */
  captureGrain() {
    const g = this.nextGrain;
    const start =
      (this.writePos - this.grainSize + this.ring.length) % this.ring.length;
    for (let j = 0; j < this.grainSize; j++) {
      this.grains[g][j] = this.ring[(start + j) % this.ring.length];
    }
    this.playPos[g] = 0;
    this.audible = g;
    this.nextGrain = 1 - g;
    this.fadePos = 0;
  }

  /** Crossfade envelope: new grain ramps in over `fade` samples. */
  gainFor(g) {
    if (this.fadePos >= this.fade) {
      return g === this.audible ? 1 : 0;
    }
    const t = this.fadePos / this.fade;
    return g === this.audible ? t : 1 - t;
  }

  /** YIN-lite autocorrelation on a 2× decimated 2048-sample window. */
  detectPitch() {
    const LEN = 2048;
    const W = 512; // decimated window length
    const start = (this.detPos - LEN + LEN) % LEN;
    const buf = this._buf || (this._buf = new Float32Array(W));
    for (let k = 0; k < W; k++) {
      buf[k] = this.detRing[(start + 2 * k) % LEN];
    }

    let energy = 0;
    for (let k = 0; k < W; k++) energy += buf[k] * buf[k];
    if (energy < 1e-6) {
      this.voiced = false;
      this.driftToUnity();
      return;
    }

    let bestTau = -1;
    let bestD = Infinity;
    for (let tau = 22; tau < W; tau++) {
      let d = 0;
      for (let k = 0; k < W - tau; k++) {
        const diff = buf[k] - buf[k + tau];
        d += diff * diff;
      }
      if (d < bestD) {
        bestD = d;
        bestTau = tau;
      }
    }

    if (bestTau < 0) {
      this.voiced = false;
      this.driftToUnity();
      return;
    }

    const clarity = 1 - bestD / energy;
    if (clarity < 0.5) {
      this.voiced = false;
      this.driftToUnity();
      return;
    }

    this.voiced = true;
    const realLag = bestTau * 2;
    this.f0 = this.sr / realLag;
    if (!Number.isFinite(this.f0) || this.f0 <= 0) {
      this.voiced = false;
      this.driftToUnity();
      return;
    }

    // Nearest note in the selected scale → correction ratio.
    const f0Midi = 69 + 12 * Math.log2(this.f0 / 440);
    const note = this.nearestScaleNote(f0Midi);
    const targetF0 = 440 * Math.pow(2, (note - 69) / 12);
    const targetRatio = targetF0 / this.f0;
    const k = Math.min(1, 0.004 + this.retuneSpeed * 0.35);
    this.ratio += (targetRatio - this.ratio) * k;
  }

  /** Nearest absolute MIDI note inside the root-shifted scale set. */
  nearestScaleNote(f0Midi) {
    const base = Math.floor(f0Midi / 12) * 12;
    let best = f0Midi;
    let bestDist = Infinity;
    for (const s of this.scaleNotes) {
      const cand = base + this.root + s;
      for (const c of [cand - 12, cand, cand + 12]) {
        const d = Math.abs(c - f0Midi);
        if (d < bestDist) {
          bestDist = d;
          best = c;
        }
      }
    }
    return best;
  }

  /** Unvoiced passages drift back toward 1:1 so silence stays neutral. */
  driftToUnity() {
    this.ratio += (1 - this.ratio) * 0.004;
  }
}

registerProcessor('pitch-corrector', PitchCorrector);
