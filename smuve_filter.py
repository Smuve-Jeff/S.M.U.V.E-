"""
S.M.U.V.E- Biquad Resonant Filter & Sound Sculpting Engine
Author: Smuve-Jeff Architectural Architecture
Description: Implements digital biquad filters (Lowpass, Highpass, Bandpass, 
             Low/High Shelf, Peaking) for advanced synth sound design and 
             frequency shaping.
"""

import numpy as np

class BiquadFilter:
    def __init__(self, filter_type: str = "lowpass", cutoff_freq: float = 1200.0, q: float = 1.414, sample_rate: int = 44100,
                 gain_db: float = 0.0):
        self.filter_type = filter_type.lower()
        self.sample_rate = sample_rate
        self.gain_db = float(gain_db)
        # Guard the coefficient math: a cutoff at or above Nyquist (sin(w0) <= 0)
        # makes the difference equation unstable (NaN output), and Q = 0
        # divides by zero. Clamp instead of trusting the caller.
        self.cutoff_freq = float(min(max(cutoff_freq, 1.0), sample_rate * 0.499))
        self.q = max(1e-3, float(q))
        self.b0 = self.b1 = self.b2 = self.a1 = self.a2 = 0.0
        self.x1 = self.x2 = self.y1 = self.y2 = 0.0
        self.compute_coefficients()

    def compute_coefficients(self):
        """Calculates digital biquad filter coefficients based on cutoff and resonance (Q)."""
        # Re-clamp here as well: the cutoff is a public attribute that the synth
        # engine sweeps block-by-block after construction.
        self.cutoff_freq = float(min(max(self.cutoff_freq, 1.0), self.sample_rate * 0.499))
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
        elif self.filter_type == "bandpass":
            # Constant peak-gain bandpass (RBJ cookbook, BPF with 0 dB peak).
            b0 = alpha
            b1 = 0.0
            b2 = -alpha
            a0 = 1.0 + alpha
            a1 = -2.0 * cos_w0
            a2 = 1.0 - alpha
        elif self.filter_type in ("lowshelf", "highshelf", "peaking"):
            # RBJ cookbook EQ bands. A shelf of 0 dB reduces to a unity transfer
            # function (b == a), so an untouched band never colours the signal,
            # and a peaking band multiplies the spectrum by its bell instead of
            # summing sub-bands and letting their skirts cancel.
            amplitude = 10.0 ** (self.gain_db / 40.0)
            # alpha as defined for shelving filters with slope S = 1.
            shelf_alpha = (sin_w0 / 2.0) * np.sqrt(2.0)
            peak_alpha = sin_w0 / (2.0 * self.q)

            if self.filter_type == "lowshelf":
                sqrt_a = np.sqrt(amplitude)
                b0 = amplitude * ((amplitude + 1.0) - (amplitude - 1.0) * cos_w0 + 2.0 * sqrt_a * shelf_alpha)
                b1 = 2.0 * amplitude * ((amplitude - 1.0) - (amplitude + 1.0) * cos_w0)
                b2 = amplitude * ((amplitude + 1.0) - (amplitude - 1.0) * cos_w0 - 2.0 * sqrt_a * shelf_alpha)
                a0 = (amplitude + 1.0) + (amplitude - 1.0) * cos_w0 + 2.0 * sqrt_a * shelf_alpha
                a1 = -2.0 * ((amplitude - 1.0) + (amplitude + 1.0) * cos_w0)
                a2 = (amplitude + 1.0) + (amplitude - 1.0) * cos_w0 - 2.0 * sqrt_a * shelf_alpha
            elif self.filter_type == "highshelf":
                sqrt_a = np.sqrt(amplitude)
                b0 = amplitude * ((amplitude + 1.0) + (amplitude - 1.0) * cos_w0 + 2.0 * sqrt_a * shelf_alpha)
                b1 = -2.0 * amplitude * ((amplitude - 1.0) + (amplitude + 1.0) * cos_w0)
                b2 = amplitude * ((amplitude + 1.0) + (amplitude - 1.0) * cos_w0 - 2.0 * sqrt_a * shelf_alpha)
                a0 = (amplitude + 1.0) - (amplitude - 1.0) * cos_w0 + 2.0 * sqrt_a * shelf_alpha
                a1 = 2.0 * ((amplitude - 1.0) - (amplitude + 1.0) * cos_w0)
                a2 = (amplitude + 1.0) - (amplitude - 1.0) * cos_w0 - 2.0 * sqrt_a * shelf_alpha
            else:  # peaking
                b0 = 1.0 + peak_alpha * amplitude
                b1 = -2.0 * cos_w0
                b2 = 1.0 - peak_alpha * amplitude
                a0 = 1.0 + peak_alpha / amplitude
                a1 = -2.0 * cos_w0
                a2 = 1.0 - peak_alpha / amplitude
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
        """Applies the biquad filter sample-by-sample to an audio buffer.

        Optimized inner loop: iterates over plain Python floats (via tolist)
        instead of NumPy scalar indexing, which is several times faster while
        computing the exact same difference equation.
        """
        b0, b1, b2, a1, a2 = self.b0, self.b1, self.b2, self.a1, self.a2
        x1, x2, y1, y2 = self.x1, self.x2, self.y1, self.y2

        out = []
        append = out.append
        for x0 in audio_in.tolist():
            y0 = b0 * x0 + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2
            x2 = x1
            x1 = x0
            y2 = y1
            y1 = y0
            append(y0)

        self.x1, self.x2, self.y1, self.y2 = x1, x2, y1, y2
        return np.asarray(out, dtype=audio_in.dtype)

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

