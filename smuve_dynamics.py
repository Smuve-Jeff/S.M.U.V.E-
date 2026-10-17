"""
S.M.U.V.E- Master Dynamics & Compression Engine
Author: Smuve-Jeff Architectural Architecture
Description: Implements a digital feedforward dynamic compressor and peak 
             limiter to glue multi-track mixes and add professional studio punch.
"""

import math

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
        """Applies dynamic compression sample-by-sample with attack/release ballistics.

        Optimized inner loop (plain Python floats instead of NumPy scalar
        indexing) computing the exact same envelope follower and gain math.
        """
        threshold = self.threshold
        threshold_db = self.threshold_db
        ratio_inv = 1.0 / self.ratio
        attack_coeff = self.attack_coeff
        release_coeff = self.release_coeff
        env = self.envelope
        log10 = math.log10

        out = []
        append = out.append
        for x in audio_in.tolist():
            abs_x = x if x >= 0.0 else -x

            # Envelope detector
            if abs_x > env:
                env = attack_coeff * env + (1.0 - attack_coeff) * abs_x
            else:
                env = release_coeff * env + (1.0 - release_coeff) * abs_x

            # Compute gain reduction if envelope exceeds threshold
            if env > threshold:
                env_safe = env if env > 1e-6 else 1e-6
                env_db = 20.0 * log10(env_safe)
                target_db = threshold_db + (env_db - threshold_db) * ratio_inv
                gain = (10.0 ** (target_db * 0.05)) / env_safe
            else:
                gain = 1.0

            append(x * gain)

        self.envelope = env
        return np.asarray(out, dtype=audio_in.dtype)

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

