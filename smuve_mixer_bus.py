"""
S.M.U.V.E- Multi-Track Mixer & Audio Summing Bus
Author: Smuve-Jeff Architectural Architecture
Description: Performs sample-accurate mixing of multiple instrument tracks, 
             volume scaling, stereo panning, and master limiting.
"""

import numpy as np
from typing import List, Dict

class MixerBus:
    def __init__(self, sample_rate: int = 44100):
        self.sample_rate = sample_rate
        self.tracks: List[Dict] = []
        self.master_volume = 1.0

    def add_track_buffer(self, name: str, buffer: np.ndarray, volume: float = 1.0, pan: float = 0.0):
        """Registers a track audio buffer with volume and pan settings."""
        self.tracks.append({
            "name": name,
            "buffer": buffer * volume,
            "pan": float(np.clip(pan, -1.0, 1.0))
        })

    def sum_mix(self, target_samples: int) -> np.ndarray:
        """Sum tracks into a constant-power stereo mix with soft clipping.

        The returned array has shape ``(target_samples, 2)`` in left/right
        channel order. Pan follows the equal-power law: hard left and hard
        right send full amplitude to one side, while center sends equal
        ``sqrt(0.5)`` gain to both channels.
        """
        master_mix = np.zeros((target_samples, 2), dtype=np.float64)

        for track in self.tracks:
            buf = track["buffer"]
            if len(buf) < target_samples:
                padded = np.zeros(target_samples, dtype=np.float64)
                padded[:len(buf)] = buf
                buf = padded
            else:
                buf = buf[:target_samples]

            pan = float(np.clip(track["pan"], -1.0, 1.0))
            pan_angle = (pan + 1.0) * np.pi / 4.0
            left_gain = np.cos(pan_angle)
            right_gain = np.sin(pan_angle)
            master_mix[:, 0] += buf * left_gain
            master_mix[:, 1] += buf * right_gain

        # Apply Master Limiter / Soft Clipping protection (Tanh saturation)
        return np.tanh(master_mix * self.master_volume)





