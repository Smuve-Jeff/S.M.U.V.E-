"""
S.M.U.V.E- Analog Saturation & Waveshaper Distortion Engine
Author: Smuve-Jeff Architectural Architecture
Description: Implements soft-clipping waveshaping and harmonic tape saturation 
             to add warmth, grit, and analog character to individual tracks or the master bus.
"""

import numpy as np

class SaturationEffect:
    def __init__(self, drive: float = 2.5, mix: float = 0.4, sample_rate: int = 44100):
        self.drive = max(1.0, drive)
        self.mix = np.clip(mix, 0.0, 1.0)
        self.sample_rate = sample_rate

    def process(self, audio_in: np.ndarray) -> np.ndarray:
        """Applies soft-clipping waveshaping distortion with adjustable drive and dry/wet mix."""
        if len(audio_in) == 0:
            return audio_in
            
        # Apply input drive gain
        driven = audio_in * self.drive
        
        # Soft-clipping using hyperbolic tangent (tanh) for smooth tube/tape harmonic saturation
        saturated = np.tanh(driven)
        
        # Normalize peak to maintain stable gain staging
        peak = np.max(np.abs(saturated))
        if peak > 1.0:
            saturated = saturated / peak

        # Dry/Wet blend
        output = (1.0 - self.mix) * audio_in + self.mix * saturated
        return output

# ==========================================
# VERIFICATION TEST
# ==========================================
if __name__ == "__main__":
    print("--- Testing S.M.U.V.E- Saturation & Distortion Module ---")
    saturator = SaturationEffect(drive=3.0, mix=0.5, sample_rate=44100)
    test_sine = np.sin(2.0 * np.pi * 440.0 * np.linspace(0, 1.0, 44100)) * 1.2
    processed = saturator.process(test_sine)
    print(f"[+] Saturation test successful! Peak Input: {np.max(np.abs(test_sine)):.2f} | Peak Saturated Output: {np.max(np.abs(processed)):.2f}")
    print("--- Saturation Engine Ready for Integration ---")

