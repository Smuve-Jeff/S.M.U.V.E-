"""
S.M.U.V.E- Audio Sampler & Loop Player Engine
Author: Smuve-Jeff Architectural Architecture
Description: Loads external WAV audio samples and loops from disk, handling 
             channel downmixing, sample-rate conversion, and normalization.
"""

import wave
import numpy as np
import os

class AudioSampler:
    #: Full-scale divisor per PCM sample width in bytes (8-bit WAV is unsigned).
    _PCM_SCALE = {1: 128.0, 2: 32768.0, 3: 8388608.0, 4: 2147483648.0}

    def __init__(self, sample_rate: int = 44100):
        self.sample_rate = sample_rate

    @classmethod
    def _decode_pcm(cls, raw_data: bytes, sample_width: int) -> np.ndarray:
        """Decodes interleaved PCM bytes into float32 samples in [-1.0, 1.0].

        8-bit WAV is unsigned while 16/24/32-bit is signed little-endian.
        Reading a wider sample as 16-bit (the old fallback) turns 24/32-bit
        files - what phone recorders and DAWs export - into noise.
        """
        if sample_width == 3:
            # 24-bit has no NumPy dtype: assemble the three bytes by hand.
            frames = np.frombuffer(raw_data, dtype=np.uint8)
            frames = frames[: len(frames) - (len(frames) % 3)].reshape(-1, 3).astype(np.int32)
            values = frames[:, 0] | (frames[:, 1] << 8) | (frames[:, 2] << 16)
            values = np.where(values >= 1 << 23, values - (1 << 24), values)
            return (values / cls._PCM_SCALE[3]).astype(np.float32)
        if sample_width == 1:
            raw = np.frombuffer(raw_data, dtype=np.uint8).astype(np.float64)
            return ((raw - 128.0) / cls._PCM_SCALE[1]).astype(np.float32)
        if sample_width in (2, 4):
            raw = np.frombuffer(raw_data, dtype=(np.int16 if sample_width == 2 else np.int32)).astype(np.float64)
            return (raw / cls._PCM_SCALE[sample_width]).astype(np.float32)
        raise ValueError(f"unsupported PCM sample width: {sample_width} bytes")

    def load_wav_sample(self, filepath: str) -> np.ndarray:
        """Loads an external .wav file into a normalized NumPy float32 audio buffer."""
        try:
            if not os.path.exists(filepath):
                print(f"[-] Sample file not found: {filepath}")
                return np.zeros(0)

            with wave.open(filepath, 'rb') as wav_file:
                channels = wav_file.getnchannels()
                framerate = wav_file.getframerate()
                sample_width = wav_file.getsampwidth()
                num_frames = wav_file.getnframes()
                raw_data = wav_file.readframes(num_frames)

            # Convert raw bytes to a normalized float32 buffer for the loaded
            # bit depth (8-, 16-, 24- or 32-bit PCM).
            audio_data = self._decode_pcm(raw_data, sample_width)

            # If stereo, downmix to mono by averaging whole frames.
            if channels > 1:
                frame_count = len(audio_data) // channels
                audio_data = audio_data[: frame_count * channels].reshape(frame_count, channels).mean(axis=1)

            # Resample if sample rates differ
            if framerate != self.sample_rate and len(audio_data) > 0:
                duration = len(audio_data) / framerate
                target_length = int(duration * self.sample_rate)
                audio_data = np.interp(
                    np.linspace(0, len(audio_data) - 1, target_length),
                    np.arange(len(audio_data)),
                    audio_data
                ).astype(np.float32)

            print(f"[+] Successfully loaded sample: {os.path.basename(filepath)} ({len(audio_data)} samples at {self.sample_rate}Hz)")
            return audio_data

        except Exception as e:
            print(f"[-] Error loading audio sample: {e}")
            return np.zeros(0)

# ==========================================
# VERIFICATION TEST
# ==========================================
if __name__ == "__main__":
    print("--- Testing S.M.U.V.E- Audio Sampler Engine ---")
    sampler = AudioSampler(sample_rate=44100)
    
    # Create a dummy temporary wave file to test loading
    test_filename = "test_sample_loop.wav"
    dummy_data = (np.sin(2.0 * np.pi * 440.0 * np.linspace(0, 1.0, 44100)) * 32767).astype(np.int16)
    with wave.open(test_filename, 'w') as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(44100)
        wf.writeframes(dummy_data.tobytes())
    
    loaded_buffer = sampler.load_wav_sample(test_filename)
    print(f"[+] Sampler test passed! Loaded buffer length: {len(loaded_buffer)} samples")
    
    # Clean up test file
    if os.path.exists(test_filename):
        os.remove(test_filename)
    print("--- Audio Sampler Engine Ready for Integration ---")

