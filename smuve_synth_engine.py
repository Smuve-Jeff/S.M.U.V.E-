"""
S.M.U.V.E- Polyphonic Synth & Drum Machine Engine (v2.1)
Author: Smuve-Jeff Architectural Architecture
Description: Generates multi-waveform synthesizer voices with ADSR envelopes, 
             dynamic LFO-modulated biquad filters, and drum sampler pads.
"""

import numpy as np
from smuve_filter import BiquadFilter
from smuve_lfo import LFOEngine

class SynthesizerVoice:
    def __init__(self, sample_rate: int = 44100):
        self.sample_rate = sample_rate

    def midi_to_freq(self, midi_note: int) -> float:
        """Converts a MIDI note number to frequency in Hz."""
        return 440.0 * (2.0 ** ((midi_note - 69) / 12.0))

    def render_note(self, midi_note: int, duration_secs: float = 1.0, wave_type: str = "saw", 
                    filter_cutoff_base: float = 800.0, lfo_rate: float = 2.0, use_lfo: bool = True) -> np.ndarray:
        """Renders a synth note with oscillator waves, ADSR envelope, and dynamic LFO-swept biquad filtering."""
        freq = self.midi_to_freq(midi_note)
        num_samples = int(self.sample_rate * duration_secs)
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

        # 2. ADSR Envelope Shaping
        attack = int(0.05 * self.sample_rate)
        decay = int(0.1 * self.sample_rate)
        release = int(0.2 * self.sample_rate)
        sustain_level = 0.7

        envelope = np.ones(num_samples)
        if attack > 0:
            envelope[:attack] = np.linspace(0.0, 1.0, attack)
        if attack + decay < num_samples:
            envelope[attack:attack + decay] = np.linspace(1.0, sustain_level, decay)
        if num_samples > release:
            envelope[-release:] = np.linspace(sustain_level, 0.0, release)

        shaped_audio = osc * envelope

        # 3. Dynamic LFO Filter Sweep or Static Filter
        if use_lfo:
            lfo = LFOEngine(frequency_hz=lfo_rate, waveform="triangle", sample_rate=self.sample_rate)
            cutoff_curve = lfo.generate_curve(duration_secs=duration_secs, min_val=filter_cutoff_base, max_val=min(filter_cutoff_base * 4.0, 8000.0))
            
            # Sample-by-sample filter sweep processing
            filtered_audio = np.zeros_like(shaped_audio)
            # Initialize a single biquad filter instance
            filt = BiquadFilter(filter_type="lowpass", cutoff_freq=cutoff_curve[0], q=3.0, sample_rate=self.sample_rate)
            
            for i in range(num_samples):
                # Update cutoff dynamically per sample based on LFO curve
                filt.cutoff_freq = cutoff_curve[i]
                filt.compute_coefficients()
                filtered_audio[i] = filt.process(np.array([shaped_audio[i]]))[0]
        else:
            filt = BiquadFilter(filter_type="lowpass", cutoff_freq=filter_cutoff_base, q=2.5, sample_rate=self.sample_rate)
            filtered_audio = filt.process(shaped_audio)

        return filtered_audio


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

