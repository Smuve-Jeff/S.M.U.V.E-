"""Disk I/O engines: WAV sample loading, master export, and stem export."""

import gc
import sys
import wave

import numpy as np
import pytest

from smuve_export import AudioExporter
from smuve_sampler import AudioSampler
from smuve_stem_export import StemExporter


def encode_pcm(samples: np.ndarray, sample_width: int) -> bytes:
    """Helper: encode floats as little-endian PCM at the requested bit depth."""
    if sample_width == 1:
        return ((samples * 127.0) + 128.0).astype(np.uint8).tobytes()
    if sample_width == 2:
        return (samples * 32767.0).astype(np.int16).tobytes()
    if sample_width == 3:
        values = (samples * 8388607.0).astype(np.int64) & 0xFFFFFF
        packed = np.empty((values.size, 3), dtype=np.uint8)
        packed[:, 0] = values & 0xFF
        packed[:, 1] = (values >> 8) & 0xFF
        packed[:, 2] = (values >> 16) & 0xFF
        return packed.tobytes()
    if sample_width == 4:
        return (samples * 2147483647.0).astype(np.int32).tobytes()
    raise ValueError(f"write_wav does not support {sample_width}-byte samples")


def write_wav(path, samples: np.ndarray, channels: int = 1, framerate: int = 44100, sample_width: int = 2):
    """Helper: write a PCM WAV whose floats are scaled to the given bit depth."""
    payload = encode_pcm(samples, sample_width)
    with wave.open(str(path), "w") as wav_file:
        wav_file.setnchannels(channels)
        wav_file.setsampwidth(sample_width)
        wav_file.setframerate(framerate)
        wav_file.writeframes(payload)


class TestAudioSampler:
    def test_missing_file_returns_empty_buffer(self, tmp_path):
        assert AudioSampler().load_wav_sample(str(tmp_path / "missing.wav")).shape == (0,)

    def test_mono_16bit_round_trip(self, tmp_path, sine, sample_rate):
        path = tmp_path / "mono.wav"
        tone = sine(freq=440.0, secs=0.25, amp=0.8, sr=sample_rate)
        write_wav(path, tone)

        loaded = AudioSampler(sample_rate=sample_rate).load_wav_sample(str(path))
        assert loaded.shape == tone.shape
        assert loaded.dtype == np.float32
        np.testing.assert_allclose(loaded, tone, atol=2e-4)

    def test_stereo_is_downmixed_to_mono(self, tmp_path, sample_rate):
        left = np.full(1000, 0.5)
        right = np.full(1000, -0.5)
        interleaved = np.empty(2000)
        interleaved[0::2] = left
        interleaved[1::2] = right

        path = tmp_path / "stereo.wav"
        write_wav(path, interleaved, channels=2, framerate=sample_rate)

        loaded = AudioSampler(sample_rate=sample_rate).load_wav_sample(str(path))
        assert loaded.ndim == 1
        assert loaded.shape == (1000,)
        np.testing.assert_allclose(loaded, np.zeros(1000), atol=2e-4)

    def test_resampling_matches_duration(self, tmp_path, sine):
        path = tmp_path / "low_rate.wav"
        write_wav(path, sine(freq=220.0, secs=1.0, amp=0.5, sr=22050), framerate=22050)

        loaded = AudioSampler(sample_rate=44100).load_wav_sample(str(path))
        assert loaded.shape == (44100,)
        # The interpolated buffer must keep the sampler's float32 contract.
        assert loaded.dtype == np.float32

    def test_8bit_samples_are_scaled(self, tmp_path):
        path = tmp_path / "eight_bit.wav"
        write_wav(path, np.full(64, 0.0), framerate=44100, sample_width=1)

        loaded = AudioSampler(sample_rate=44100).load_wav_sample(str(path))
        assert loaded.shape == (64,)
        np.testing.assert_allclose(loaded, np.zeros(64), atol=0.01)

    @pytest.mark.parametrize("sample_width", [3, 4])
    def test_wide_pcm_round_trip(self, tmp_path, sine, sample_rate, sample_width):
        """24/32-bit files (phone recorders, DAWs) used to be read as 16-bit noise."""
        path = tmp_path / f"wide_{sample_width}.wav"
        tone = sine(freq=440.0, secs=0.25, amp=0.8, sr=sample_rate)
        write_wav(path, tone, sample_width=sample_width)

        loaded = AudioSampler(sample_rate=sample_rate).load_wav_sample(str(path))
        assert loaded.shape == tone.shape
        assert loaded.dtype == np.float32
        np.testing.assert_allclose(loaded, tone, atol=1e-4)

    @pytest.mark.parametrize("sample_width", [3, 4])
    def test_stereo_wide_pcm_is_downmixed(self, tmp_path, sample_rate, sample_width):
        frames = 500
        left = np.full(frames, 0.5)
        right = np.full(frames, -0.5)
        interleaved = np.empty(2 * frames)
        interleaved[0::2] = left
        interleaved[1::2] = right

        path = tmp_path / f"wide_stereo_{sample_width}.wav"
        write_wav(path, interleaved, channels=2, framerate=sample_rate, sample_width=sample_width)

        loaded = AudioSampler(sample_rate=sample_rate).load_wav_sample(str(path))
        assert loaded.shape == (frames,)
        np.testing.assert_allclose(loaded, np.zeros(frames), atol=1e-3)

    def test_unreadable_file_returns_empty_buffer(self, tmp_path):
        path = tmp_path / "truncated.wav"
        path.write_bytes(b"RIFF")
        assert AudioSampler().load_wav_sample(str(path)).shape == (0,)


class TestAudioExporter:
    def test_export_normalises_and_writes_16bit_pcm(self, tmp_path, sine, sample_rate):
        path = tmp_path / "master.wav"
        tone = sine(freq=440.0, secs=0.1, amp=0.5, sr=sample_rate)
        assert AudioExporter.export_to_wav(tone, str(path), sample_rate) is True

        with wave.open(str(path), "rb") as wav_file:
            assert wav_file.getnchannels() == 1
            assert wav_file.getsampwidth() == 2
            assert wav_file.getframerate() == sample_rate
            raw = wav_file.readframes(wav_file.getnframes())

        pcm = np.frombuffer(raw, dtype=np.int16)
        assert pcm.shape == tone.shape
        # Peak sample normalises to the top of the int16 range.
        assert np.max(np.abs(pcm)) == 32767

    def test_silent_buffer_is_exported(self, tmp_path, sample_rate):
        path = tmp_path / "silence.wav"
        assert AudioExporter.export_to_wav(np.zeros(128), str(path), sample_rate) is True
        with wave.open(str(path), "rb") as wav_file:
            assert wav_file.getnframes() == 128

    def test_unwritable_path_returns_false(self, tmp_path, sample_rate):
        target = tmp_path / "no-such-dir" / "master.wav"
        assert AudioExporter.export_to_wav(np.zeros(16), str(target), sample_rate) is False


class TestStemExporter:
    def test_stems_are_written_per_track(self, tmp_path, monkeypatch, sine, sample_rate):
        monkeypatch.chdir(tmp_path)
        tracks = {
            "Drums": sine(freq=80.0, secs=0.05, amp=0.4, sr=sample_rate),
            "Synth Lead": sine(freq=440.0, secs=0.05, amp=0.4, sr=sample_rate),
        }
        assert StemExporter.export_stems(tracks, output_prefix="test_stem", sample_rate=sample_rate) is True

        for name in ("test_stem_drums.wav", "test_stem_synth_lead.wav"):
            assert (tmp_path / name).exists()
            with wave.open(str(tmp_path / name), "rb") as wav_file:
                assert wav_file.getnframes() == len(tracks["Drums"])
                assert wav_file.getframerate() == sample_rate

    def test_unwritable_prefix_fails_without_leaking_a_wave_writer(self, tmp_path, monkeypatch, sample_rate):
        """Regression: `wave.open(path, 'w')` on a bad path left a half-built
        Wave_write whose destructor raised an unraisable AttributeError."""
        monkeypatch.chdir(tmp_path)
        unraisable = []
        monkeypatch.setattr(sys, "unraisablehook", lambda argument: unraisable.append(argument.exc_value))

        assert (
            StemExporter.export_stems({"Drums": np.ones(16)}, output_prefix="no-such-dir/stem", sample_rate=sample_rate)
            is False
        )

        gc.collect()
        assert unraisable == []

    def test_empty_tracks_are_skipped(self, tmp_path, monkeypatch, sample_rate):
        monkeypatch.chdir(tmp_path)
        assert StemExporter.export_stems({"Empty": np.zeros(0)}, output_prefix="test_stem", sample_rate=sample_rate) is True
        assert not list(tmp_path.glob("test_stem_*.wav"))

    def test_track_names_are_sanitised(self, tmp_path, monkeypatch, sample_rate):
        monkeypatch.chdir(tmp_path)
        StemExporter.export_stems(
            {"Bass / Sub 808": np.ones(8) * 0.5}, output_prefix="test_stem", sample_rate=sample_rate
        )
        assert (tmp_path / "test_stem_bass___sub_808.wav").exists()
