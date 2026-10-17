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
        """Applies time-varying modulated delay lines to create lush chorus width.

        Fully vectorised: the modulated read is a gather over a linear view of
        the delay line. The line is written before it is read and the shortest
        delay is 5 samples, so a read can never touch a sample that is still to
        be written - the whole delay is therefore feed-forward and the reads can
        be resolved in one pass.
        """
        if len(audio_in) == 0:
            return audio_in

        num_samples = len(audio_in)
        line_len = self.delay_buffer_len
        write_ptr = self.write_ptr

        # Linear (oldest -> newest) view of the circular delay line.
        history = np.concatenate((self.delay_buffer[write_ptr:], self.delay_buffer[:write_ptr]))
        line = np.concatenate((history, audio_in))

        # Sinusoidal LFO modulation curve for the delay time.
        phase_inc = (2.0 * np.pi * self.rate_hz) / self.sample_rate
        samples = np.arange(num_samples, dtype=np.float64)
        lfo_val = (np.sin(samples * phase_inc) + 1.0) * 0.5  # Range [0, 1]
        mod_delay = self.depth_samples * lfo_val + 5.0  # Base offset + modulated depth

        # Read pointer with fractional interpolation into the linear view. A
        # depth beyond the 100 ms line would point past the newest sample, so
        # clamp it (the old per-sample loop simply read stale slots there).
        read_pos = np.clip(line_len + samples - mod_delay, 0.0, line.size - 2.0)
        idx_low = np.floor(read_pos).astype(np.intp)
        frac = read_pos - idx_low

        delayed_sample = (1.0 - frac) * line[idx_low] + frac * line[idx_low + 1]

        output = (1.0 - self.mix) * audio_in + self.mix * delayed_sample

        # Retain the most recent `line_len` samples so the next block continues
        # the same delay line.
        self.delay_buffer = np.roll(line[-line_len:], (write_ptr + num_samples) % line_len)
        self.write_ptr = (write_ptr + num_samples) % line_len

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

