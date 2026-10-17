"""
S.M.U.V.E- Sidechain Compression & Ducking Engine
Author: Smuve-Jeff Architectural Architecture
Description: Implements sidechain ducking where a trigger audio track (e.g., Kick) 
             automatically compresses a target track (e.g., Synth/Bass) for professional mix breathing.
"""

import math

import numpy as np

class SidechainCompressor:
    def __init__(self, threshold_db: float = -15.0, ratio: float = 6.0, attack_ms: float = 2.0, release_ms: float = 100.0, sample_rate: int = 44100):
        self.threshold_db = threshold_db
        self.threshold = 10.0 ** (threshold_db / 20.0)
        self.ratio = ratio
        self.sample_rate = sample_rate
        self.attack_coeff = np.exp(-1.0 / (0.001 * attack_ms * sample_rate))
        self.release_coeff = np.exp(-1.0 / (0.001 * release_ms * sample_rate))

    def process(self, target_audio: np.ndarray, trigger_audio: np.ndarray) -> np.ndarray:
        """Applies sidechain ducking to target_audio driven by the envelope of trigger_audio."""
        if len(target_audio) == 0 or len(trigger_audio) == 0:
            return target_audio
            
        # Match lengths safely
        max_len = max(len(target_audio), len(trigger_audio))
        target = np.pad(target_audio, (0, max_len - len(target_audio)))
        trigger = np.pad(trigger_audio, (0, max_len - len(trigger_audio)))
        
        output = np.zeros_like(target)
        envelope = 0.0

        threshold = self.threshold
        threshold_db = self.threshold_db
        ratio_inv = 1.0 / self.ratio
        attack_coeff = self.attack_coeff
        release_coeff = self.release_coeff
        env = 0.0
        log10 = math.log10

        out = []
        append = out.append
        for x, trig in zip(target.tolist(), trigger.tolist()):
            abs_trig = trig if trig >= 0.0 else -trig

            # Envelope detection on trigger signal
            if abs_trig > env:
                env = attack_coeff * env + (1.0 - attack_coeff) * abs_trig
            else:
                env = release_coeff * env + (1.0 - release_coeff) * abs_trig

            # Compute gain reduction based on trigger envelope exceeding threshold
            if env > threshold:
                env_safe = env if env > 1e-6 else 1e-6
                env_db = 20.0 * log10(env_safe)
                target_db = threshold_db + (env_db - threshold_db) * ratio_inv
                gain = (10.0 ** (target_db * 0.05)) / env_safe
            else:
                gain = 1.0

            append(x * gain)

        return np.asarray(out, dtype=target_audio.dtype)

# ==========================================
# VERIFICATION TEST
# ==========================================
if __name__ == "__main__":
    print("--- Testing S.M.U.V.E- Sidechain Ducking Engine ---")
    sc = SidechainCompressor(threshold_db=-10.0, ratio=4.0)
    dummy_kick = np.zeros(44100)
    dummy_kick[:4410] = 1.0  # Simulated kick transient
    dummy_synth = np.ones(44100) * 0.8  # Constant synth pad
    
    ducked = sc.process(dummy_synth, dummy_kick)
    print(f"[+] Sidechain test successful! Min Ducked Output Amplitude: {np.min(ducked):.4f}")
    print("--- Sidechain Engine Ready for Integration ---")

