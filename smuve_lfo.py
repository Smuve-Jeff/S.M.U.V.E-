"""
S.M.U.V.E- LFO & Parameter Automation Engine
Author: Smuve-Jeff Architectural Architecture
Description: Generates low-frequency modulation control signals (Sine, Triangle, Square, Ramp) 
             to automate filter cutoffs, volume swells, and spatial sweeps over time.
"""

import numpy as np

class LFOEngine:
    def __init__(self, frequency_hz: float = 1.0, waveform: str = "sine", sample_rate: int = 44100):
        self.frequency_hz = frequency_hz
        self.waveform = waveform.lower()
        self.sample_rate = sample_rate

    def generate_curve(self, duration_secs: float, min_val: float = 0.0, max_val: float = 1.0) -> np.ndarray:
        """Generates a control curve array mapped between min_val and max_val over a given duration."""
        num_samples = int(self.sample_rate * duration_secs)
        t = np.linspace(0, duration_secs, num_samples, endpoint=False)
        phase = (t * self.frequency_hz) % 1.0

        # Generate base bipolar LFO signal (-1.0 to 1.0)
        if self.waveform == "triangle":
            raw_lfo = 2.0 * np.abs(2.0 * (phase - np.floor(phase + 0.5))) - 1.0
        elif self.waveform == "square":
            raw_lfo = np.where(phase < 0.5, 1.0, -1.0)
        elif self.waveform == "ramp":
            raw_lfo = 2.0 * phase - 1.0
        else:  # Default to Sine
            raw_lfo = np.sin(2.0 * np.pi * self.frequency_hz * t)

        # Scale bipolar [-1, 1] to unipolar [0, 1] then map to [min_val, max_val]
        normalized = (raw_lfo + 1.0) / 2.0
        mapped_curve = min_val + normalized * (max_val - min_val)
        return mapped_curve

# ==========================================
# VERIFICATION TEST
# ==========================================
if __name__ == "__main__":
    print("--- Testing S.M.U.V.E- LFO Automation Engine ---")
    lfo = LFOEngine(frequency_hz=2.0, waveform="triangle", sample_rate=44100)
    curve = lfo.generate_curve(duration_secs=1.0, min_val=400.0, max_val=3000.0 if False else 3000.0)
    print(f"[+] LFO Curve generated successfully! Length: {len(curve)} samples")
    print(f"[+] Filter Cutoff Modulation Range: {curve[0]:.1f}Hz to {np.max(curve):.1f}Hz")
    print("--- LFO Engine Ready for Integration ---")

