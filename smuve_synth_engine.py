"""
S.M.U.V.E- Polyphonic Synth & Drum Machine Engine (v2.0)
Author: Smuve-Jeff Architectural Architecture
Description: Generates multi-waveform synthesizer voices with ADSR envelope shaping 
             and biquad resonant filter sculpting, alongside drum sampler pads.
"""

import numpy as np
from smuve_filter import BiquadFilter

class SynthesizerVoice:
    def __init__(self, sample_rate: int = 44100):
        self.sample_rate = sample_rate

    def midi_to_freq(self, midi_note: int) -> float:
        """Converts a MIDI note number to frequency in Hz."""
        return 440.0 * (2.0 ** ((midi_note - 69) / 12.0))

    def render_note(self, midi_note: int, duration_secs: float = 1.0, wave_type: str = "saw", filter_cutoff: float = 1500.0) -> np.ndarray:
        """Renders a synth note with oscillator waves, ADSR envelope, and biquad lowpass filtering."""
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

        # 2. ADSR Envelope (Attack, Decay, Sustain, Release)
        attack = int(0.05 * self.sample_rate)
        decay = int(0.1 * self.sample_rate)
        release = int(0.2 * self.sample_rate)
        sustain_level = 0.7

        envelope = np.ones(num_samples)
        # Attack ramp
        if attack > 0:
            envelope[:attack] = np.linspace(0.0, 1.0, attack)
        # Decay ramp
        if attack + decay < num_samples:
            envelope[attack:attack + decay] = np.linspace(1.0, sustain_level, decay)
        # Release fade out
        if num_samples > release:
            envelope[-release:] = np.linspace(sustain_level, 0.0, release)

        shaped_audio = osc * envelope

        # 3. Apply Biquad Resonant Filter
        filt = BiquadFilter(filter_type="lowpass", cutoff_freq=filter_cutoff, q=2.5, sample_rate=self.sample_rate)
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

        if pad_id == 1:  # Punchy Kick Drum (Pitch sweep + exponential decay)
            freq_sweep = 120.0 * np.exp(-15.0 * t) + 40.0
            kick = np.sin(2.0 * np.pi * np.cumsum(freq_sweep) / self.sample_rate)
            envelope = np.exp(-8.0 * t)
            return kick * envelope
        elif pad_id == 2:  # Crisp Snare Drum (Tone + White Noise)
            tone = np.sin(2.0 * np.pi * 200.0 * t) * np.exp(-20.0 * t)
            noise = np.random.uniform(-1.0, 1.0, num_samples) * np.exp(-15.0 * t)
            return (tone * 0.5) + (noise * 0.5)
        elif pad_id == 3:  # Closed Hi-Hat (Filtered high-frequency noise)
            noise = np.random.uniform(-1.0, 1.0, num_samples)
            filt = BiquadFilter(filter_type="highpass", cutoff_freq=5000.0, q=1.0, sample_rate=self.sample_rate)
            hat = filt.process(noise)
            envelope = np.exp(-40.0 * t)
            return hat * envelope
        else:
            return np.zeros(num_samples)

