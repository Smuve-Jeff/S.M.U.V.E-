"""
S.M.U.V.E- 3-Band Parametric Equalizer Engine
Author: Smuve-Jeff Architectural Architecture
Description: Implements biquad shelving and peaking filter bands to sculpt 
             low, mid, and high frequencies for professional track and master bus EQ shaping.
"""

import numpy as np

from smuve_filter import BiquadFilter

class ParametricEQ:
    def __init__(self, low_gain_db: float = 0.0, mid_gain_db: float = 0.0, high_gain_db: float = 0.0, sample_rate: int = 44100,
                 low_crossover_hz: float = 250.0, mid_freq_hz: float = 1000.0, high_crossover_hz: float = 4000.0):
        self.low_gain_db = low_gain_db
        self.mid_gain_db = mid_gain_db
        self.high_gain_db = high_gain_db
        self.sample_rate = sample_rate
        self.low_crossover_hz = low_crossover_hz
        self.mid_freq_hz = mid_freq_hz
        self.high_crossover_hz = high_crossover_hz

    def process(self, audio_in: np.ndarray) -> np.ndarray:
        """Applies 3-band EQ frequency shaping using digital biquad filter approximations."""
        if len(audio_in) == 0:
            return audio_in

        # A flat setting must not colour a single sample, and it also skips the
        # filter transient entirely.
        if self.low_gain_db == 0.0 and self.mid_gain_db == 0.0 and self.high_gain_db == 0.0:
            return audio_in.copy()

        # Real RBJ bands (low shelf -> mid bell -> high shelf) in series. Every
        # band multiplies the spectrum instead of summing sub-bands, so each
        # control only shapes its own range - boosting the lows no longer lifts
        # 2 kHz, and the high control reaches the top octave instead of the mids.
        low_band = BiquadFilter("lowshelf", self.low_crossover_hz, sample_rate=self.sample_rate, gain_db=self.low_gain_db)
        mid_band = BiquadFilter("peaking", self.mid_freq_hz, q=0.7, sample_rate=self.sample_rate, gain_db=self.mid_gain_db)
        high_band = BiquadFilter("highshelf", self.high_crossover_hz, sample_rate=self.sample_rate, gain_db=self.high_gain_db)

        output = high_band.process(mid_band.process(low_band.process(audio_in)))

        # Prevent clipping
        peak = np.max(np.abs(output))
        if peak > 1.0:
            output = output / peak

        return output

# ==========================================
# VERIFICATION TEST
# ==========================================
if __name__ == "__main__":
    print("--- Testing S.M.U.V.E- 3-Band Parametric EQ Module ---")
    eq = ParametricEQ(low_gain_db=3.0, mid_gain_db=-2.0, high_gain_db=4.0, sample_rate=44100)
    test_signal = np.sin(2.0 * np.pi * 440.0 * np.linspace(0, 1.0, 44100))
    processed = eq.process(test_signal)
    print(f"[+] EQ test successful! Input Peak: {np.max(np.abs(test_signal)):.2f} | EQ Processed Peak: {np.max(np.abs(processed)):.2f}")
    print("--- Parametric EQ Engine Ready for Integration ---")
