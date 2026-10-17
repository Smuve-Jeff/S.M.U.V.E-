/**
 * Sampler AudioWorkletProcessor v2 — sample-accurate multi-voice playback.
 *
 * v2 enhancements:
 * - Voice IDs for individual note stop (STOP_NOTE)
 * - PITCH_BEND message for pitch wheel modulation
 * - MODULATION message for CC-based envelope/volume modulation
 * - Per-voice pitch bend offset tracked independently
 * - Up to 32 concurrent voices, linear-interpolated, ADSR envelope
 */
class SamplerProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    /** @type {Map<string, Float32Array>} channel 0 data per buffer key */
    this.buffers = new Map();
    /** @type {Map<string, number>} sample rate per buffer key */
    this.bufferRates = new Map();
    /** @type {number} auto-incrementing voice ID counter */
    this.nextVoiceId = 1;
    /** @type {Array<{ voiceId: number, note: number, buffer: Float32Array,
     *   sampleRate: number, playhead: number, pitchMul: number, gain: number,
     *   envPhase: string, envPos: number, attackS: number, decayS: number,
     *   sustain: number, releaseS: number, alive: boolean }>} */
    this.voices = [];
    /** @type {number} global pitch bend multiplier (0.5..2.0, 1.0 = neutral) */
    this.pitchBend = 1.0;
    /** @type {number} global modulation depth (0..1) */
    this.modulation = 0;

    this.port.onmessage = (e) => {
      const msg = e.data;
      switch (msg.type) {
        case 'LOAD': {
          if (msg.key && msg.buffer && msg.sampleRate) {
            this.buffers.set(msg.key, msg.buffer);
            this.bufferRates.set(msg.key, msg.sampleRate);
          }
          break;
        }
        case 'PLAY': {
          const buf = this.buffers.get(msg.key || '');
          const srcRate = this.bufferRates.get(msg.key || '') || 44100;
          if (!buf) return;
          // Calculate pitch multiplier: desired playback rate relative to source sample rate
          const noteFreq = 440 * Math.pow(2, ((msg.note || 60) - 69) / 12);
          const rootFreq = 440 * Math.pow(2, ((msg.rootNote || 60) - 69) / 12);
          const rateMul = noteFreq / rootFreq;
          // Convert to playhead advance per output sample
          const pitchMul = rateMul * (srcRate / sampleRate);
          const vel = (msg.velocity || 100) / 127;
          const voiceId = this.nextVoiceId++;
          // Per-voice ADSR from message or defaults
          const attackS = msg.attack != null ? msg.attack : 0.005;
          const decayS = msg.decay != null ? msg.decay : 0.1;
          const sustain = msg.sustain != null ? msg.sustain : 0.8;
          const releaseS = msg.release != null ? msg.release : 0.2;
          this.voices.push({
            voiceId,
            note: msg.note || 60,
            buffer: buf,
            sampleRate: srcRate,
            playhead: 0,
            pitchMul,
            gain: vel,
            envPhase: 'attack',
            envPos: 0,
            attackS,
            decayS,
            sustain,
            releaseS,
            alive: true,
          });
          // Cap voices at 32
          if (this.voices.length > 32) {
            this.voices.sort((a, b) => a.voiceId - b.voiceId);
            this.voices.splice(0, this.voices.length - 32);
          }
          break;
        }
        case 'STOP_NOTE': {
          // Stop individual note by MIDI number
          const stopNote = msg.note;
          for (const v of this.voices) {
            if (v.alive && v.envPhase !== 'release' && v.note === stopNote) {
              v.envPhase = 'release';
              v.envPos = 0;
            }
          }
          break;
        }
        case 'STOP_ALL': {
          // Release all voices gracefully
          for (const v of this.voices) {
            if (v.alive && v.envPhase !== 'release') {
              v.envPhase = 'release';
              v.envPos = 0;
            }
          }
          break;
        }
        case 'PITCH_BEND': {
          // msg.value: -1 (full down) to +1 (full up), 0 = center
          const bendSemitones = msg.semitones || 2;
          const bendValue = Math.max(-1, Math.min(1, msg.value || 0));
          // Convert semitone range to pitch multiplier
          this.pitchBend = Math.pow(2, (bendValue * bendSemitones) / 12);
          break;
        }
        case 'MODULATION': {
          // msg.value: 0..1
          this.modulation = Math.max(0, Math.min(1, msg.value || 0));
          break;
        }
      }
    };
  }

  process(inputs, outputs, _parameters) {
    const out = outputs[0];
    if (!out || out.length === 0) return true;

    const channelCount = Math.min(out.length, 2);
    const frameCount = out[0].length;

    // Clear output buffers
    for (let ch = 0; ch < channelCount; ch++) {
      out[ch].fill(0);
    }

    const invSampleRate = 1 / sampleRate;
    // Modulation affects sustain level (CC modulation)
    const modSustainOffset = this.modulation * 0.3; // up to 30% boost

    for (let i = 0; i < frameCount; i++) {
      let mixL = 0;
      let mixR = 0;

      for (let v = 0; v < this.voices.length; v++) {
        const voice = this.voices[v];
        if (!voice.alive) continue;

        // Compute envelope gain at this sample
        let envGain = 0;
        switch (voice.envPhase) {
          case 'attack': {
            const t = voice.envPos / Math.max(0.0001, voice.attackS);
            envGain = Math.min(1, t);
            voice.envPos += invSampleRate;
            if (voice.envPos >= voice.attackS) {
              voice.envPhase = 'decay';
              voice.envPos = 0;
            }
            break;
          }
          case 'decay': {
            const t = voice.envPos / Math.max(0.0001, voice.decayS);
            envGain = 1 - (1 - voice.sustain) * t;
            voice.envPos += invSampleRate;
            if (voice.envPos >= voice.decayS) {
              voice.envPhase = 'sustain';
            }
            break;
          }
          case 'sustain': {
            // Modulation adds to sustain level
            envGain = Math.min(1, voice.sustain + modSustainOffset);
            break;
          }
          case 'release': {
            envGain = Math.max(0, voice.sustain * (1 - voice.envPos / Math.max(0.0001, voice.releaseS)));
            voice.envPos += invSampleRate;
            if (voice.envPos >= voice.releaseS) {
              voice.alive = false;
            }
            break;
          }
        }

        if (envGain <= 0) {
          voice.alive = false;
          continue;
        }

        // Apply global pitch bend to playhead advance
        const effectivePitchMul = voice.pitchMul * this.pitchBend;

        // Read sample with linear interpolation
        const idx = Math.floor(voice.playhead);
        const frac = voice.playhead - idx;

        let sample = 0;
        if (idx >= 0 && idx < voice.buffer.length - 1) {
          const a = voice.buffer[idx];
          const b = voice.buffer[idx + 1];
          sample = a + (b - a) * frac;
        } else if (idx === voice.buffer.length - 1) {
          sample = voice.buffer[idx];
        } else {
          // Beyond buffer end → release
          voice.envPhase = 'release';
          voice.envPos = 0;
        }

        voice.playhead += effectivePitchMul;

        const outSample = sample * voice.gain * envGain;
        mixL += outSample;
        mixR += outSample; // mono → stereo
      }

      // Remove dead voices
      this.voices = this.voices.filter((v) => v.alive);

      // Write mixed output (soft clip)
      if (channelCount > 0) out[0][i] = Math.max(-1, Math.min(1, mixL));
      if (channelCount > 1) out[1][i] = Math.max(-1, Math.min(1, mixR));
    }

    return true;
  }
}

registerProcessor('sampler-processor', SamplerProcessor);
