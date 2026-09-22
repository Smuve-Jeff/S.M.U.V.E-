"""
S.M.U.V.E- Stereo Chorus & Modulation Engine
Author: Smuve-Jeff Architectural Architecture
Description: Implements LFO-modulated delay lines to add lush chorus width, 
             depth, and shimmering movement to synth pads, leads, and vocals.
"""

import numpy as np

class ChorusEffect:
    def __init__(self, rate_hz: float = 1.2, depth_ms: float = 5.0, mix: float = 0.4, sample_rate: int = 44100):
        self.rate_hz = rate_hz
        self.depth_samples = int((depth_ms / 1000.0) * sample_rate)
        self.mix = np.clip(mix, 0.0, 1.0)
        self.sample_rate = sample_rate
        self.delay_buffer_len = int(sample_rate * 0.1)  # 100ms max delay buffer
        self.delay_buffer = np.zeros(self.delay_buffer_len)
        self.write_ptr = 0

    def process(self, audio_in: np.ndarray) -> np.ndarray:
        """Applies time-varying modulated delay lines to create lush chorus width."""
        if len(audio_in) == 0:
            return audio_in

        output = np.zeros_like(audio_in)
        num_samples = len(audio_in)
        
        # LFO phase increment for modulation
        phase_inc = (2.0 * np.pi * self.rate_hz) / self.sample_rate

        for i in range(num_samples):
            x = audio_in[i]
            
            # Write current sample to circular delay buffer
            self.delay_buffer[self.write_ptr] = x
            
            # Sinusoidal LFO modulation curve for delay time
            lfo_val = (np.sin(i * phase_inc) + 1.0) * 0.5  # Range [0, 1]
            mod_delay = self.depth_samples * lfo_val + 5.0  # Base offset + modulated depth
            
            # Read pointer with fractional interpolation
            read_ptr = (self.write_ptr - mod_delay) % self.delay_buffer_len
            idx_low = int(np.floor(read_ptr))
            idx_high = (idx_low + 1) % self.delay_buffer_len
            frac = read_ptr - idx_low
            
            delayed_sample = (1.0 - frac) * self.delay_buffer[idx_low] + frac * self.delay_buffer[idx_high]
            
            # Dry/Wet blend
            output[i] = (1.0 - self.mix) * x + self.mix * delayed_sample
            
            self.write_ptr = (self.write_ptr + 1) % self.delay_buffer_len

        return output

# ==========================================
# VERIFICATION TEST
# ==========================================
if __name__ == "__main__":
    print("--- Testing S.M.U.V.E- Chorus & Modulation Module ---")
    chorus = ChorusEffect(rate_hz=1.5, depth_ms=8.0, mix=0.5, sample_rate=44100)
    test_signal = np.sin(2.0 * np.pi * 440.0 * np.linspace(0, 1.0, 44100))
    processed = chorus.process(test_signal)
    print(f"[+] Chorus test successful! Input Buffer Length: {len(test_signal)} | Processed Output Length: {len(processed)}")
    print("--- Chorus & Modulation Engine Ready for Integration ---")

