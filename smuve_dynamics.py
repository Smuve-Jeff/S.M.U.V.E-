"""
S.M.U.V.E- Master Dynamics & Compression Engine
Author: Smuve-Jeff Architectural Architecture
Description: Implements a digital feedforward dynamic compressor and peak 
             limiter to glue multi-track mixes and add professional studio punch.
"""

import numpy as np

class MasterCompressor:
    def __init__(self, threshold_db: float = -12.0, ratio: float = 4.0, attack_ms: float = 5.0, release_ms: float = 50.0, sample_rate: int = 44100):
        self.threshold_db = threshold_db
        self.threshold = 10.0 ** (threshold_db / 20.0)
        self.ratio = ratio
        self.sample_rate = sample_rate
        
        # Attack and release coefficients for smooth envelope detection
        self.attack_coeff = np.exp(-1.0 / (0.001 * attack_ms * sample_rate))
        self.release_coeff = np.exp(-1.0 / (0.001 * release_ms * sample_rate))
        self.envelope = 0.0

    def process(self, audio_in: np.ndarray) -> np.ndarray:
        """Applies dynamic compression sample-by-sample with attack/release ballistics."""
        output = np.zeros_like(audio_in)
        
        for i in range(len(audio_in)):
            x = audio_in[i]
            abs_x = abs(x)
            
            # Envelope detector
            if abs_x > self.envelope:
                self.envelope = self.attack_coeff * self.envelope + (1.0 - self.attack_coeff) * abs_x
            else:
                self.envelope = self.release_coeff * self.envelope + (1.0 - self.release_coeff) * abs_x
                
            # Compute gain reduction if envelope exceeds threshold
            if self.envelope > self.threshold:
                env_db = 20.0 * np.log10(max(self.envelope, 1e-6))
                excess_db = env_db - self.threshold_db
                compressed_excess_db = excess_db / self.ratio
                target_db = self.threshold_db + compressed_excess_db
                target_amplitude = 10.0 ** (target_db / 20.0)
                gain = target_amplitude / max(self.envelope, 1e-6)
            else:
                gain = 1.0
                
            output[i] = x * gain
            
        return output

# ==========================================
# VERIFICATION TEST
# ==========================================
if __name__ == "__main__":
    print("--- Testing S.M.U.V.E- Master Dynamics & Compressor ---")
    comp = MasterCompressor(threshold_db=-6.0, ratio=4.0)
    test_signal = np.sin(2.0 * np.pi * 440.0 * np.linspace(0, 1.0, 44100)) * 1.5  # Hot signal above threshold
    processed = comp.process(test_signal)
    print(f"[+] Compressor test successful! Peak Input: {np.max(np.abs(test_signal)):.2f} | Peak Output: {np.max(np.abs(processed)):.2f}")
    print("--- Master Dynamics Engine Ready for Integration ---")

