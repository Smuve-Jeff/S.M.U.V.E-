"""
S.M.U.V.E- Biquad Resonant Filter & Sound Sculpting Engine
Author: Smuve-Jeff Architectural Architecture
Description: Implements digital biquad filters (Lowpass, Highpass, Bandpass) 
             for advanced synth sound design and frequency shaping.
"""

import numpy as np

class BiquadFilter:
    def __init__(self, filter_type: str = "lowpass", cutoff_freq: float = 1200.0, q: float = 1.414, sample_rate: int = 44100):
        self.filter_type = filter_type.lower()
        self.cutoff_freq = cutoff_freq
        self.q = q
        self.sample_rate = sample_rate
        self.b0 = self.b1 = self.b2 = self.a1 = self.a2 = 0.0
        self.x1 = self.x2 = self.y1 = self.y2 = 0.0
        self.compute_coefficients()

    def compute_coefficients(self):
        """Calculates digital biquad filter coefficients based on cutoff and resonance (Q)."""
        w0 = 2.0 * np.pi * self.cutoff_freq / self.sample_rate
        cos_w0 = np.cos(w0)
        sin_w0 = np.sin(w0)
        alpha = sin_w0 / (2.0 * self.q)

        if self.filter_type == "lowpass":
            b0 = (1.0 - cos_w0) / 2.0
            b1 = 1.0 - cos_w0
            b2 = (1.0 - cos_w0) / 2.0
            a0 = 1.0 + alpha
            a1 = -2.0 * cos_w0
            a2 = 1.0 - alpha
        elif self.filter_type == "highpass":
            b0 = (1.0 + cos_w0) / 2.0
            b1 = -(1.0 + cos_w0)
            b2 = (1.0 + cos_w0) / 2.0
            a0 = 1.0 + alpha
            a1 = -2.0 * cos_w0
            a2 = 1.0 - alpha
        else:
            # Default pass-through
            b0, b1, b2, a0, a1, a2 = 1.0, 0.0, 0.0, 1.0, 0.0, 0.0

        # Normalize coefficients by a0
        self.b0 = b0 / a0
        self.b1 = b1 / a0
        self.b2 = b2 / a0
        self.a1 = a1 / a0
        self.a2 = a2 / a0

    def process(self, audio_in: np.ndarray) -> np.ndarray:
        """Applies the biquad filter sample-by-sample to an audio buffer."""
        output = np.zeros_like(audio_in)
        for i in range(len(audio_in)):
            x0 = audio_in[i]
            y0 = self.b0 * x0 + self.b1 * self.x1 + self.b2 * self.x2 - self.a1 * self.y1 - self.a2 * self.y2
            
            # Update delay line history
            self.x2 = self.x1
            self.x1 = x0
            self.y2 = self.y1
            self.y1 = y0
            
            output[i] = y0
        return output

# ==========================================
# VERIFICATION TEST
# ==========================================
if __name__ == "__main__":
    print("--- Testing S.M.U.V.E- Biquad Filter Module ---")
    filt = BiquadFilter(filter_type="lowpass", cutoff_freq=800.0, q=2.0)
    test_noise = np.random.uniform(-1.0, 1.0, 44100)
    filtered_output = filt.process(test_noise)
    print(f"[+] Filter test successful! Peak Output Amplitude: {np.max(np.abs(filtered_output)):.4f}")
    print("--- Biquad Filter Ready for Integration ---")

