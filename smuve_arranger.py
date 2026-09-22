"""
S.M.U.V.E- Song Arranger & Timeline Engine
Author: Smuve-Jeff Architectural Architecture
Description: Manages multi-bar timeline arrangement, scheduling clips, 
             patterns, and audio sections into a full structural song.
"""

import numpy as np
from typing import List, Dict, Optional

class TimelineClip:
    def __init__(self, name: str, start_bar: int, length_bars: int, audio_buffer: np.ndarray):
        self.name = name
        self.start_bar = start_bar
        self.length_bars = length_bars
        self.audio_buffer = audio_buffer

class SongArranger:
    def __init__(self, bpm: float = 130.0, time_signature_numerator: int = 4, sample_rate: int = 44100):
        self.bpm = bpm
        self.time_sig = time_signature_numerator
        self.sample_rate = sample_rate
        self.clips: List[TimelineClip] = []

    def seconds_per_bar(self) -> float:
        """Calculates the exact duration of a single bar in seconds based on BPM."""
        beats_per_second = self.bpm / 60.0
        bars_per_second = beats_per_second / self.time_sig
        return 1.0 / bars_per_second

    def add_clip(self, name: str, start_bar: int, length_bars: int, audio_buffer: np.ndarray):
        """Adds an arranged audio clip to the timeline structure."""
        self.clips.append(TimelineClip(name, start_bar, length_bars, audio_buffer))

    def render_arrangement(self) -> np.ndarray:
        """Compiles and mixes all timeline clips into a single master arranged song buffer."""
        if not self.clips:
            return np.zeros(0)

        sec_per_bar = self.seconds_per_bar()

        # Resolve every clip placement first so the timeline can be allocated
        # once and each clip summed with a single vectorised slice add.
        placements = []
        total_samples = 0
        for clip in self.clips:
            start_sample = int(clip.start_bar * sec_per_bar * self.sample_rate)
            # A clip reserves its bar length, but a longer buffer still has to fit.
            bar_end_sample = int((clip.start_bar + clip.length_bars) * sec_per_bar * self.sample_rate)
            end_sample = max(bar_end_sample, start_sample + len(clip.audio_buffer))

            placements.append((start_sample, clip.audio_buffer))
            if end_sample > total_samples:
                total_samples = end_sample

        master_arrangement = np.zeros(total_samples)

        for start_sample, buf in placements:
            master_arrangement[start_sample:start_sample + len(buf)] += buf

        return master_arrangement

# ==========================================
# VERIFICATION TEST
# ==========================================
if __name__ == "__main__":
    print("--- Testing S.M.U.V.E- Song Arranger Engine ---")
    arranger = SongArranger(bpm=120.0, sample_rate=44100)
    dummy_beat = np.sin(2.0 * np.pi * 440.0 * np.linspace(0, 2.0, 44100))
    arranger.add_clip("Intro Clip", start_bar=0, length_bars=2, audio_buffer=dummy_beat)
    arranger.add_clip("Chorus Clip", start_bar=4, length_bars=4, audio_buffer=dummy_beat * 0.9)
    
    full_song = arranger.render_arrangement()
    print(f"[+] Arrangement compiled successfully! Total Song Buffer Length: {len(full_song)} samples ({len(full_song)/44100:.2f} seconds)")
    print("--- Song Arranger Ready for Integration ---")

