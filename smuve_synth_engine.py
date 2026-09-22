"""
S.M.U.V.E- Virtual Synthesizer & Drum Sampler Subsystem
Author: Smuve-Jeff Architectural Architecture
Description: Real-time polyphonic synthesizer voice allocation, multi-waveform 
             oscillation, ADSR envelope shaping, and drum pad sampler engine.
"""

import numpy as np
import uuid
from dataclasses import dataclass, field
from typing import List, Dict, Optional

# ==========================================
# 1. SYNTHESIZER OSCILLATOR & ADSR ENVELOPE
# ==========================================

class ADSR:
    def __init__(self, attack: float = 0.01, decay: float = 0.1, sustain: float = 0.7, release: float = 0.3, sample_rate: int = 44100):
        self.sample_rate = sample_rate
        self.a_samples = int(attack * sample_rate)
        self.d_samples = int(decay * sample_rate)
        self.s_level = sustain
        self.r_samples = int(release * sample_rate)

    def generate(self, total_samples: int) -> np.ndarray:
        envelope = np.zeros(total_samples)
        
        # Attack phase
        if self.a_samples > 0:
            a_end = min(self.a_samples, total_samples)
            envelope[:a_end] = np.linspace(0.0, 1.0, a_end)
            
        # Decay phase
        d_start = self.a_samples
        d_end = min(d_start + self.d_samples, total_samples)
        if d_end > d_start:
            envelope[d_start:d_end] = np.linspace(1.0, self.s_level, d_end - d_start)
            
        # Sustain phase
        s_start = d_end
        s_end = max(0, total_samples - self.r_samples)
        if s_end > s_start:
            envelope[s_start:s_end] = self.s_level
            
        # Release phase
        r_start = s_end
        if r_start < total_samples:
            envelope[r_start:] = np.linspace(self.s_level, 0.0, total_samples - r_start)
            
        return envelope


class SynthesizerVoice:
    def __init__(self, sample_rate: int = 44100):
        self.sample_rate = sample_rate
        self.adsr = ADSR(sample_rate=sample_rate)

    def midi_to_freq(self, midi_note: int) -> float:
        return 440.0 * (2.0 ** ((midi_note - 69) / 12.0))

    def render_note(self, midi_note: int, duration_secs: float, wave_type: str = "saw") -> np.ndarray:
        total_samples = int(self.sample_rate * duration_secs)
        freq = self.midi_to_freq(midi_note)
        t = np.linspace(0, duration_secs, total_samples, endpoint=False)
        
        # Generate Waveform
        if wave_type == "sine":
            wave = np.sin(2 * np.pi * freq * t)
        elif wave_type == "square":
            wave = np.sign(np.sin(2 * np.pi * freq * t))
        elif wave_type == "triangle":
            wave = 2.0 * np.abs(2.0 * (t * freq - np.floor(t * freq + 0.5))) - 1.0
        else:  # Sawtooth default
            wave = 2.0 * (t * freq - np.floor(0.5 + t * freq))
            
        # Apply ADSR Envelope shaping
        envelope = self.adsr.generate(total_samples)
        return wave * envelope


# ==========================================
# 2. DRUM MACHINE & SAMPLER MODULE
# ==========================================

@dataclass
class DrumPad:
    pad_id: int
    name: str
    sample_buffer: np.ndarray = field(default_factory=lambda: np.zeros(44100))
    volume: float = 1.0
    pan: float = 0.0
    pitch_shift_semitones: float = 0.0

    def trigger(self) -> np.ndarray:
        """Triggers the sample audio buffer with volume scaling."""
        return self.sample_buffer * self.volume


class DrumMachineRack:
    def __init__(self, sample_rate: int = 44100):
        self.sample_rate = sample_rate
        self.pads: Dict[int, DrumPad] = {}
        self._initialize_default_pads()

    def _initialize_default_pads(self):
        # Create 3 default synthesized percussion pads (Kick, Snare, Hi-Hat)
        t_kick = np.linspace(0, 0.2, int(self.sample_rate * 0.2), endpoint=False)
        kick_buf = np.sin(2 * np.pi * 120 * np.exp(-15 * t_kick) * t_kick) * np.exp(-10 * t_kick)
        
        t_snare = np.linspace(0, 0.2, int(self.sample_rate * 0.2), endpoint=False)
        snare_buf = np.random.uniform(-1, 1, len(t_snare)) * np.exp(-20 * t_snare)
        
        t_hh = np.linspace(0, 0.1, int(self.sample_rate * 0.1), endpoint=False)
        hh_buf = np.random.uniform(-0.5, 0.5, len(t_hh)) * np.exp(-40 * t_hh)
        
        self.pads[1] = DrumPad(pad_id=1, name="Kick 808", sample_buffer=kick_buf)
        self.pads[2] = DrumPad(pad_id=2, name="Snare 909", sample_buffer=snare_buf)
        self.pads[3] = DrumPad(pad_id=3, name="Closed Hi-Hat", sample_buffer=hh_buf)

    def play_pad(self, pad_id: int) -> Optional[np.ndarray]:
        if pad_id in self.pads:
            return self.pads[pad_id].trigger()
        return None


# ==========================================
# 3. VERIFICATION & TEST RUN
# ==========================================
if __name__ == "__main__":
    print("--- Initializing S.M.U.V.E- Synth & Sampler Engine ---")
    
    # Test Synth Voice generation (C4 note, saw wave)
    synth = SynthesizerVoice()
    note_buffer = synth.render_note(midi_note=60, duration_secs=1.0, wave_type="saw")
    print(f"Generated Synth Note Buffer Shape: {note_buffer.shape} | Peak Amplitude: {np.max(np.abs(note_buffer)):.2f}")
    
    # Test Drum Machine Sampler
    drums = DrumMachineRack()
    kick_output = drums.play_pad(1)
    print(f"Triggered Drum Pad 'Kick 808' | Buffer Length: {len(kick_output)} samples")
    print("--- Synthesizer & Sampler Subsystem Operational ---")
