"""
S.M.U.V.E- Polyphonic Synth & Drum Machine Engine (v2.1)
Author: Smuve-Jeff Architectural Architecture
Description: Generates multi-waveform synthesizer voices with ADSR envelopes, 
             dynamic LFO-modulated biquad filters, and drum sampler pads.
"""

import numpy as np
from smuve_filter import BiquadFilter
from smuve_lfo import LFOEngine

# Filter cutoff coefficient update granularity (samples per block).
# Per-sample updates were ~200x slower with no audible benefit.
_LFO_FILTER_BLOCK = 256


class SynthesizerVoice:
    def __init__(self, sample_rate: int = 44100):
        self.sample_rate = sample_rate

    def midi_to_freq(self, midi_note: int) -> float:
        """Converts a MIDI note number to frequency in Hz."""
        return 440.0 * (2.0 ** ((midi_note - 69) / 12.0))

    def render_note(self, midi_note: int, duration_secs: float = 1.0, wave_type: str = "saw",
                    filter_cutoff_base: float = 800.0, resonance_q: float = 2.5,
                    lfo_rate: float = 2.0, use_lfo: bool = True,
                    attack_sec: float = 0.05, decay_sec: float = 0.1,
                    sustain_level: float = 0.7, release_sec: float = 0.2) -> np.ndarray:
        """Renders a synth note with oscillator waves, ADSR envelope, and dynamic LFO-swept biquad filtering.

        All sound-design parameters (cutoff, resonance, ADSR stages, LFO rate) are
        wireable from a synth patch / preset via the keyword arguments.
        """
        freq = self.midi_to_freq(midi_note)
        num_samples = int(self.sample_rate * duration_secs)
        if num_samples <= 0:
            return np.zeros(0)
        t = np.linspace(0, duration_secs, num_samples, endpoint=False)

        # 1. Oscillator Wave Generation
        if wave_type == "sine":
            osc = np.sin(2.0 * np.pi * freq * t)
        elif wave_type == "square":
            osc = np.sign(np.sin(2.0 * np.pi * freq * t))
        elif wave_type == "triangle":
            osc = 2.0 * np.abs(2.0 * (t * freq - np.floor(t * freq + 0.5))) - 1.0
        else:  # Default to Sawtooth
            osc = 2.0 * (t * freq - np.floor(0.5 + t * freq))

        shaped_audio = osc * self._build_envelope(num_samples, attack_sec, decay_sec,
                                                  sustain_level, release_sec)

        # 3. Dynamic LFO Filter Sweep or Static Filter
        if use_lfo:
            lfo = LFOEngine(frequency_hz=lfo_rate, waveform="triangle", sample_rate=self.sample_rate)
            cutoff_curve = lfo.generate_curve(duration_secs=duration_secs,
                                              min_val=filter_cutoff_base,
                                              max_val=min(filter_cutoff_base * 4.0, 8000.0))

            # Block-based filter sweep: recompute biquad coefficients once per
            # block (filter state carries across blocks, so the signal chain is
            # continuous). Audibly identical to per-sample sweeps, vastly faster.
            filtered_audio = np.empty_like(shaped_audio)
            filt = BiquadFilter(filter_type="lowpass", cutoff_freq=cutoff_curve[0],
                                q=resonance_q, sample_rate=self.sample_rate)
            for start in range(0, num_samples, _LFO_FILTER_BLOCK):
                end = min(start + _LFO_FILTER_BLOCK, num_samples)
                mid = (start + end) // 2
                filt.cutoff_freq = cutoff_curve[mid]
                filt.compute_coefficients()
                filtered_audio[start:end] = filt.process(shaped_audio[start:end])
        else:
            filt = BiquadFilter(filter_type="lowpass", cutoff_freq=filter_cutoff_base,
                                q=resonance_q, sample_rate=self.sample_rate)
            filtered_audio = filt.process(shaped_audio)

        return filtered_audio

    def _build_envelope(self, num_samples: int, attack_sec: float, decay_sec: float,
                        sustain_level: float, release_sec: float) -> np.ndarray:
        """Builds a click-free ADSR envelope that scales itself down to fit short notes.

        For long notes this is a textbook ADSR; for notes shorter than
        attack+decay+release the three stages are proportionally compressed so the
        release always lands on zero (no truncation discontinuities / clicks).
        """
        envelope = np.ones(num_samples)

        attack = max(1, int(attack_sec * self.sample_rate))
        decay = max(1, int(decay_sec * self.sample_rate))
        release = max(1, int(release_sec * self.sample_rate))

        total = attack + decay + release
        if total > num_samples:
            scale = num_samples / total
            attack = max(1, int(attack * scale))
            decay = max(1, int(decay * scale))
            release = max(1, int(release * scale))
            if attack + decay + release > num_samples:
                release = max(1, num_samples - attack - decay)

        # Attack: 0 -> 1
        end_a = min(attack, num_samples)
        envelope[:end_a] = np.linspace(0.0, 1.0, end_a)

        # Decay: 1 -> sustain
        end_d = min(attack + decay, num_samples)
        if end_d > end_a:
            envelope[end_a:end_d] = np.linspace(1.0, sustain_level, end_d - end_a)

        # Release: continue from wherever the envelope currently is -> 0
        rel_start = max(0, num_samples - release)
        if rel_start < num_samples:
            start_val = envelope[rel_start - 1] if rel_start > 0 else envelope[0]
            envelope[rel_start:] = np.linspace(start_val, 0.0, num_samples - rel_start)

        return envelope


class DrumMachineRack:
    def __init__(self, sample_rate: int = 44100):
        self.sample_rate = sample_rate

    def play_pad(self, pad_id: int) -> np.ndarray:
        """Generates synthetic electronic drum hits based on pad ID."""
        duration = 0.4
        num_samples = int(self.sample_rate * duration)
        t = np.linspace(0, duration, num_samples, endpoint=False)

        if pad_id == 1:  # Kick Drum
            freq_sweep = 120.0 * np.exp(-15.0 * t) + 40.0
            kick = np.sin(2.0 * np.pi * np.cumsum(freq_sweep) / self.sample_rate)
            envelope = np.exp(-8.0 * t)
            return kick * envelope
        elif pad_id == 2:  # Snare Drum
            tone = np.sin(2.0 * np.pi * 200.0 * t) * np.exp(-20.0 * t)
            noise = np.random.uniform(-1.0, 1.0, num_samples) * np.exp(-15.0 * t)
            return (tone * 0.5) + (noise * 0.5)
        elif pad_id == 3:  # Hi-Hat
            noise = np.random.uniform(-1.0, 1.0, num_samples)
            filt = BiquadFilter(filter_type="highpass", cutoff_freq=5000.0, q=1.0, sample_rate=self.sample_rate)
            hat = filt.process(noise)
            envelope = np.exp(-40.0 * t)
            return hat * envelope
        else:
            return np.zeros(num_samples)
