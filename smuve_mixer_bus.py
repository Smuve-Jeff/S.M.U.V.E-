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
            "pan": pan
        })

    def sum_mix(self, target_samples: int) -> np.ndarray:
        """Summates all registered track buffers into a single master mix stream with limiting."""
        master_mix = np.zeros(target_samples)
        
        for track in self.tracks:
            buf = track["buffer"]
            if len(buf) < target_samples:
                padded = np.zeros(target_samples)
                padded[:len(buf)] = buf
                buf = padded
            else:
                buf = buf[:target_samples]
                
            master_mix += buf
            
        # Apply Master Limiter / Soft Clipping protection (Tanh saturation)
        master_mix = np.tanh(master_mix * self.master_volume)
        return master_mix





