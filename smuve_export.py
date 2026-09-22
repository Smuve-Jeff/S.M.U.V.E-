"""
S.M.U.V.E- Professional WAV Audio Exporter
Author: Smuve-Jeff Architectural Architecture
Description: Renders NumPy audio buffers into standard 16-bit PCM .wav files 
             compatible with Android media players and external DAWs.
"""

import wave
import numpy as np
import os

class AudioExporter:
    @staticmethod
    def export_to_wav(audio_buffer: np.ndarray, filename: str = "smuve_master_mix.wav", sample_rate: int = 44100) -> bool:
        """Normalizes and exports a NumPy audio buffer to 16-bit PCM WAV."""
        try:
            # Normalize audio to prevent clipping (-1.0 to 1.0)
            peak = np.max(np.abs(audio_buffer))
            if peak > 0:
                normalized = audio_buffer / peak
            else:
                normalized = audio_buffer
                
            # Convert float32 [-1.0, 1.0] to int16 [-32768, 32767]
            pcm_data = (normalized * 32767.0).astype(np.int16)
            
            with wave.open(filename, 'w') as wav_file:
                wav_file.setnchannels(1)  # Mono track mix
                wav_file.setsampwidth(2)   # 2 bytes per sample (16-bit)
                wav_file.setframerate(sample_rate)
                wav_file.writeframes(pcm_data.tobytes())
                
            print(f"[+] Master mix successfully exported to: {os.path.abspath(filename)}")
            return True
        except Exception as e:
            print(f"[-] Error exporting WAV: {e}")
            return False

