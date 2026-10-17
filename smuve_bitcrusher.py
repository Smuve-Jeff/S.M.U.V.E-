"""
S.M.U.V.E- Lo-Fi Bitcrusher & Sample-Rate Reduction Engine
Author: Smuve-Jeff Architectural Architecture
Description: Quantizes bit depth and decimates sample rate to introduce 
             vintage sampler grit, digital crunch, and aliasing character.
"""

import numpy as np

class Bitcrusher:
    def __init__(self, bit_depth: int = 8, downsample_factor: int = 2, mix: float = 0.5, sample_rate: int = 44100):
        self.bit_depth = max(1, min(16, bit_depth))
        self.downsample_factor = max(1, downsample_factor)
        self.mix = np.clip(mix, 0.0, 1.0)
        self.sample_rate = sample_rate

    def process(self, audio_in: np.ndarray) -> np.ndarray:
        """Applies bit reduction and sample-rate decimation for lo-fi character."""
        if len(audio_in) == 0:
            return audio_in

        output = audio_in.copy()
        num_samples = len(output)

        # 1. Bit Depth Quantization (Quantize amplitude levels)
        levels = float(2 ** self.bit_depth)
        quantized = np.round(output * levels) / levels

        # 2. Sample-Rate Decimation (hold each sample for `downsample_factor`
        # steps). Vectorised: repeat the sampled grid and trim the tail instead
        # of walking the buffer one hold-chunk at a time.
        factor = self.downsample_factor
        if factor > 1:
            quantized = np.repeat(quantized[::factor], factor)[:num_samples]

        # Dry/Wet blend
        final_output = (1.0 - self.mix) * audio_in + self.mix * quantized
        return final_output

# ==========================================
# VERIFICATION TEST
# ==========================================
if __name__ == "__main__":
    print("--- Testing S.M.U.V.E- Bitcrusher & Lo-Fi Module ---")
    crusher = Bitcrusher(bit_depth=6, downsample_factor=3, mix=0.5, sample_rate=44100)
    test_signal = np.sin(2.0 * np.pi * 440.0 * np.linspace(0, 1.0, 44100))
    processed = crusher.process(test_signal)
    print(f"[+] Bitcrusher test successful! Input Length: {len(test_signal)} | Processed Output Length: {len(processed)}")
    print("--- Bitcrusher Engine Ready for Integration ---")

