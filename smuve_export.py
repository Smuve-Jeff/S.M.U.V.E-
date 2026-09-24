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
        """Normalizes and exports a mono or interleaved stereo buffer to 16-bit PCM WAV."""
        try:
            audio_buffer = np.asarray(audio_buffer)
            if audio_buffer.ndim == 2:
                if audio_buffer.shape[1] != 2:
                    raise ValueError("audio_buffer must have shape (N,) or (N, 2)")
                channels = 2
            elif audio_buffer.ndim == 1:
                channels = 1
            else:
                raise ValueError("audio_buffer must be one- or two-dimensional")

            # Normalize audio to prevent clipping (-1.0 to 1.0)
            peak = np.max(np.abs(audio_buffer)) if audio_buffer.size else 0.0
            normalized = audio_buffer / peak if peak > 0 else audio_buffer

            # Convert float samples to int16 PCM and interleave stereo frames.
            pcm_data = (normalized * 32767.0).astype(np.int16)
            if channels == 2:
                pcm_data = pcm_data.reshape(-1)

            with wave.open(filename, 'w') as wav_file:
                wav_file.setnchannels(channels)
                wav_file.setsampwidth(2)   # 2 bytes per sample (16-bit)
                wav_file.setframerate(sample_rate)
                wav_file.writeframes(pcm_data.tobytes())
                
            print(f"[+] Master mix successfully exported to: {os.path.abspath(filename)}")
            return True
        except Exception as e:
            print(f"[-] Error exporting WAV: {e}")
            return False

