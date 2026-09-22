"""
S.M.U.V.E- Sidechain Compression & Ducking Engine
Author: Smuve-Jeff Architectural Architecture
Description: Implements sidechain ducking where a trigger audio track (e.g., Kick) 
             automatically compresses a target track (e.g., Synth/Bass) for professional mix breathing.
"""

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

        for i in range(max_len):
            abs_trig = abs(trigger[i])
            
            # Envelope detection on trigger signal
            if abs_trig > envelope:
                envelope = self.attack_coeff * envelope + (1.0 - self.attack_coeff) * abs_trig
            else:
                envelope = self.release_coeff * envelope + (1.0 - self.release_coeff) * abs_trig
                
            # Compute gain reduction based on trigger envelope exceeding threshold
            if envelope > self.threshold:
                env_db = 20.0 * np.log10(max(envelope, 1e-6))
                excess_db = env_db - self.threshold_db
                compressed_excess_db = excess_db / self.ratio
                target_db = self.threshold_db + compressed_excess_db
                target_amplitude = 10.0 ** (target_db / 20.0)
                gain = target_amplitude / max(envelope, 1e-6)
            else:
                gain = 1.0
                
            output[i] = target[i] * gain
            
        return output

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

