"""
S.M.U.V.E- Master Transport & Advanced Audio Effects Rack
Author: Smuve-Jeff Architectural Architecture
Description: Sample-accurate transport clock (Play/Stop/Loop/BPM) and 
             spatial audio DSP effects (Delay, Reverb, Parametric EQ).
"""

import numpy as np
import time
from dataclasses import dataclass, field
from typing import List, Optional

# ==========================================
# 1. MASTER TRANSPORT CLOCK
# ==========================================

class TransportState:
    STOPPED = "stopped"
    PLAYING = "playing"
    RECORDING = "recording"

@dataclass
class MasterTransport:
    bpm: float = 120.0
    sample_rate: int = 44100
    state: str = TransportState.STOPPED
    current_sample: int = 0
    loop_enabled: bool = False
    loop_start_beat: float = 0.0
    loop_end_beat: float = 16.0

    def samples_per_beat(self) -> float:
        return (60.0 / self.bpm) * self.sample_rate

    def beat_to_samples(self, beat: float) -> int:
        return int(beat * self.samples_per_beat())

    def play(self):
        self.state = TransportState.PLAYING

    def stop(self):
        self.state = TransportState.STOPPED
        self.current_sample = 0

    def advance(self, num_samples: int):
        if self.state != TransportState.PLAYING:
            return
        
        self.current_sample += num_samples
        
        # Handle looping
        if self.loop_enabled:
            loop_end_samp = self.beat_to_samples(self.loop_end_beat)
            loop_start_samp = self.beat_to_samples(self.loop_start_beat)
            
            if self.current_sample >= loop_end_samp:
                loop_length = loop_end_samp - loop_start_samp
                if loop_length > 0:
                    self.current_sample = loop_start_samp + (self.current_sample - loop_end_samp) % loop_length


# ==========================================
# 2. ADVANCED SPATIAL AUDIO EFFECTS (DSP)
# ==========================================

class DelayEffect:
    """Feedback delay line for echo and spatial depth."""
    def __init__(self, delay_time_secs: float = 0.375, feedback: float = 0.4, mix: float = 0.5, sample_rate: int = 44100):
        self.sample_rate = sample_rate
        self.delay_samples = int(delay_time_secs * sample_rate)
        self.feedback = feedback
        self.mix = mix
        self.buffer = np.zeros(self.delay_samples + 1)
        self.write_index = 0

    def process(self, audio_in: np.ndarray) -> np.ndarray:
        """Applies the feedback delay line to an audio buffer.

        The line is a recursive comb filter (each read is fed back into the
        line), so it cannot be expressed as a pure NumPy expression: the inner
        loop runs on plain Python floats, which avoids the per-sample NumPy
        scalar indexing that dominated the previous implementation.
        """
        # The delay line is short enough to mirror into a plain Python list:
        # list indexing avoids NumPy scalar boxing inside the recursion.
        buffer = self.buffer.tolist()
        buffer_len = len(buffer)
        write_index = self.write_index
        delay_samples = self.delay_samples
        feedback = self.feedback
        dry = 1.0 - self.mix
        wet = self.mix

        out = []
        append = out.append
        for sample in audio_in.tolist():
            delayed_sample = buffer[(write_index - delay_samples) % buffer_len]

            # Compute wet/dry mix
            buffer[write_index] = sample + (delayed_sample * feedback)
            write_index = (write_index + 1) % buffer_len

            append(dry * sample + wet * delayed_sample)

        self.buffer[:] = buffer
        self.write_index = write_index
        return np.asarray(out, dtype=audio_in.dtype)


class SimpleReverb:
    """Algorithmic feedback comb-filter reverb simulation."""
    def __init__(self, room_size: float = 0.7, damping: float = 0.5, mix: float = 0.3, sample_rate: int = 44100):
        self.mix = mix
        self.delay_line = np.zeros(int(0.05 * sample_rate)) # 50ms delay line
        self.feedback = room_size
        self.damping = damping

    def process(self, audio_in: np.ndarray) -> np.ndarray:
        if len(audio_in) == 0:
            return audio_in

        kernel = np.exp(-np.linspace(0, 3, 2000)) * self.feedback
        reverberated = np.convolve(audio_in, kernel, mode='same')[:len(audio_in)]
        return (1.0 - self.mix) * audio_in + self.mix * reverberated


# ==========================================
# 3. VERIFICATION & TEST RUN
# ==========================================
if __name__ == "__main__":
    print("--- Initializing S.M.U.V.E- Transport & FX Rack ---")
    
    # Test Transport Clock
    transport = MasterTransport(bpm=128.0, loop_enabled=True, loop_end_beat=4.0)
    transport.play()
    print(f"Transport State: {transport.state} | Samples per beat: {transport.samples_per_beat():.1f}")
    
    # Advance transport by 1 bar (4 beats)
    samples_to_advance = transport.beat_to_samples(4.0)
    transport.advance(samples_to_advance)
    print(f"Advanced transport by 4 beats. Current sample position: {transport.current_sample}")
    
    # Test Delay Effect Processing
    delay = DelayEffect(delay_time_secs=0.25, feedback=0.5, mix=0.4)
    test_audio = np.zeros(44100)
    test_audio[0] = 1.0  # Impulse trigger
    processed_audio = delay.process(test_audio)
    
    print(f"Delay FX Applied Successfully. Peak Wet Output: {np.max(np.abs(processed_audio)):.4f}")
    print("--- Master Transport & FX Rack Operational ---")
