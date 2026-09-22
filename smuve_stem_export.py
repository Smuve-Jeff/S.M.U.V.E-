"""
S.M.U.V.E- Multi-Track Stem Exporter
Author: Smuve-Jeff Architectural Architecture
Description: Exports individual mixer tracks as separate 16-bit PCM WAV stems 
             for professional external mixing, mastering, or DAW interoperability.
"""

import wave
import numpy as np
import os
from typing import Dict

class StemExporter:
    @staticmethod
    def export_stems(track_buffers: Dict[str, np.ndarray], output_prefix: str = "smuve_stem", sample_rate: int = 44100) -> bool:
        """Exports a dictionary of named track audio buffers into individual WAV stem files."""
        try:
            os.makedirs(".", exist_ok=True)
            exported_count = 0
            
            for track_name, buffer in track_buffers.items():
                if len(buffer) == 0:
                    continue
                    
                # Sanitize track name for filename
                safe_name = "".join(c if c.isalnum() else "_" for c in track_name).lower()
                filename = f"{output_prefix}_{safe_name}.wav"
                
                # Normalize audio buffer
                peak = np.max(np.abs(buffer))
                if peak > 0:
                    normalized = buffer / peak
                else:
                    normalized = buffer
                    
                # Convert to 16-bit PCM
                pcm_data = (normalized * 32767.0).astype(np.int16)
                
                with wave.open(filename, 'w') as wav_file:
                    wav_file.setnchannels(1)
                    wav_file.setsampwidth(2)
                    wav_file.setframerate(sample_rate)
                    wav_file.writeframes(pcm_data.tobytes())
                    
                print(f"[+] Exported Stem: {filename} ({len(buffer)} samples)")
                exported_count += 1
                
            print(f"[+] Successfully exported {exported_count} stems to disk.")
            return True
        except Exception as e:
            print(f"[-] Error exporting stems: {e}")
            return False

# ==========================================
# VERIFICATION TEST
# ==========================================
if __name__ == "__main__":
    print("--- Testing S.M.U.V.E- Stem Exporter Module ---")
    dummy_tracks = {
        "Drums": np.sin(2.0 * np.pi * 100.0 * np.linspace(0, 1.0, 44100)),
        "Synth Lead": np.sin(2.0 * np.pi * 440.0 * np.linspace(0, 1.0, 44100))
    }
    StemExporter.export_stems(dummy_tracks, output_prefix="test_stem", sample_rate=44100)
    print("--- Stem Exporter Ready for Integration ---")

