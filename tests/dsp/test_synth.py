"""Tests for the polyphonic synth voice, ADSR envelope, and drum rack."""

import numpy as np
import pytest

from smuve_dynamics import MasterCompressor
from smuve_main import SmuveInteractiveStudio
from smuve_synth_engine import DrumMachineRack, SynthesizerVoice


class TestSynthesizerVoice:
    def test_render_length_matches_duration(self, sample_rate):
        voice = SynthesizerVoice(sample_rate)
        assert len(voice.render_note(60, 0.5)) == int(sample_rate * 0.5)

    def test_zero_and_negative_duration_return_empty(self, sample_rate):
        voice = SynthesizerVoice(sample_rate)
        assert len(voice.render_note(60, 0.0)) == 0
        assert len(voice.render_note(60, -1.0)) == 0

    def test_midi_to_freq_reference_pitches(self, sample_rate):
        voice = SynthesizerVoice(sample_rate)
        assert voice.midi_to_freq(69) == pytest.approx(440.0)
        assert voice.midi_to_freq(81) == pytest.approx(880.0)
        assert voice.midi_to_freq(57) == pytest.approx(220.0)

    @pytest.mark.parametrize("wave_type", ["saw", "sine", "square", "triangle"])
    def test_waveforms_render_finite_audio(self, wave_type, sample_rate):
        out = SynthesizerVoice(sample_rate).render_note(57, 0.25, wave_type)
        assert np.isfinite(out).all()
        assert np.max(np.abs(out)) > 0.0

    def test_waveforms_are_distinguishable(self, sample_rate):
        voice = SynthesizerVoice(sample_rate)
        renders = {wf: voice.render_note(60, 0.2, wf) for wf in ("saw", "sine", "square", "triangle")}
        pairs = list(renders.values())
        for i in range(len(pairs)):
            for j in range(i + 1, len(pairs)):
                assert not np.allclose(pairs[i], pairs[j])

    def test_rendering_is_deterministic(self, sample_rate):
        voice = SynthesizerVoice(sample_rate)
        np.testing.assert_array_equal(voice.render_note(64, 0.1), voice.render_note(64, 0.1))

    def test_lfo_sweep_changes_the_result(self, sample_rate):
        voice = SynthesizerVoice(sample_rate)
        swept = voice.render_note(60, 0.5, "saw", 800.0, 2.5, 2.0, True)
        static = voice.render_note(60, 0.5, "saw", 800.0, 2.5, 2.0, False)
        assert not np.allclose(swept, static)

    def test_resonance_changes_the_result(self, sample_rate):
        voice = SynthesizerVoice(sample_rate)
        gentle = voice.render_note(60, 0.3, "saw", 900.0, 0.7, 2.0, False)
        resonant = voice.render_note(60, 0.3, "saw", 900.0, 14.0, 2.0, False)
        assert not np.allclose(gentle, resonant)

    def test_block_sweep_is_continuous(self, sample_rate):
        """The block-based filter sweep must not introduce discontinuities.

        A sine is used because its sample-to-sample delta is bounded by
        2*pi*f/sr, so any click at a block boundary would stand out.
        """
        out = SynthesizerVoice(sample_rate).render_note(60, 1.0, "sine", 400.0, 2.5, 1.0, True)
        assert np.max(np.abs(np.diff(out))) < 0.1


class TestADSR:
    def test_envelope_starts_and_ends_at_zero(self, sample_rate):
        env = SynthesizerVoice(sample_rate)._build_envelope(4096, 0.05, 0.1, 0.7, 0.2)
        assert env.shape == (4096,)
        assert env[0] == pytest.approx(0.0)
        assert env[-1] == pytest.approx(0.0)
        assert env.max() == pytest.approx(1.0)

    def test_attack_rises_monotonically_to_peak(self, sample_rate):
        env = SynthesizerVoice(sample_rate)._build_envelope(4096, 0.05, 0.1, 0.7, 0.2)
        peak_index = int(np.argmax(env))
        assert peak_index > 0
        assert np.all(np.diff(env[: peak_index + 1]) >= -1e-12)

    def test_short_notes_are_self_scaling(self, sample_rate):
        """Notes shorter than attack+decay+release still fade in and out."""
        env = SynthesizerVoice(sample_rate)._build_envelope(64, 0.05, 0.1, 0.7, 0.2)
        assert env.shape == (64,)
        assert env[0] == pytest.approx(0.0)
        assert env[-1] == pytest.approx(0.0)

    def test_decay_ramps_down_to_the_sustain_level(self, sample_rate):
        attack = int(0.01 * sample_rate)
        decay = int(0.1 * sample_rate)
        env = SynthesizerVoice(sample_rate)._build_envelope(44100, 0.01, 0.1, 0.4, 0.1)
        assert env[attack] == pytest.approx(1.0)
        assert env[attack + decay - 1] == pytest.approx(0.4, abs=1e-3)

    def test_release_is_continuous_with_the_level_it_starts_from(self, sample_rate):
        release = int(0.1 * sample_rate)
        env = SynthesizerVoice(sample_rate)._build_envelope(44100, 0.01, 0.1, 0.4, 0.1)
        release_start = 44100 - release
        assert env[release_start] == pytest.approx(env[release_start - 1], abs=1e-6)
        assert np.all(np.diff(env[release_start:]) <= 1e-12)


class TestDrumMachineRack:
    def test_pad_lengths(self):
        rack = DrumMachineRack(44100)
        for pad in (1, 2, 3, 4):
            assert len(rack.play_pad(pad)) == int(44100 * 0.4)

    def test_unknown_pad_is_silent(self):
        assert not np.any(DrumMachineRack(44100).play_pad(99))

    def test_kick_is_a_low_energy_decaying_hit(self, sample_rate):
        kick = DrumMachineRack(sample_rate).play_pad(1)
        assert np.max(np.abs(kick)) > 0.5
        assert np.max(np.abs(kick[:1000])) > np.max(np.abs(kick[-1000:]))

    @pytest.mark.parametrize("pad", [2, 3])
    def test_noise_pads_produce_signal(self, pad, sample_rate):
        np.random.seed(0)  # the pads use the global RNG
        out = DrumMachineRack(sample_rate).play_pad(pad)
        assert np.max(np.abs(out)) > 0.0
        assert np.isfinite(out).all()


class TestActivePatchRendering:
    """The orchestrator renders notes straight from the active synth patch."""

    def test_renders_from_active_patch(self):
        studio = SmuveInteractiveStudio()
        out = studio.render_active_note(60, 0.1)
        assert len(out) == int(studio.sample_rate * 0.1)
        assert np.isfinite(out).all()

    def test_patch_drive_and_bit_depth_are_applied(self, monkeypatch):
        studio = SmuveInteractiveStudio()
        clean = studio.render_active_note(60, 0.1)

        patched = dict(studio.active_patch, drive=3.5, bit_depth=6)
        monkeypatch.setattr(studio, "active_patch", patched)
        assert not np.allclose(clean, studio.render_active_note(60, 0.1))

    def test_patch_cutoff_reaches_the_synth(self, monkeypatch):
        studio = SmuveInteractiveStudio()

        def render(cutoff_hz):
            patch = dict(studio.active_patch, cutoff_hz=cutoff_hz, use_lfo=False)
            monkeypatch.setattr(studio, "active_patch", patch)
            return studio.render_active_note(60, 0.2)

        def rms(buf):
            return float(np.sqrt(np.mean(buf**2)))

        assert rms(render(4000.0)) > rms(render(120.0))


class TestMasterCompressorDtype:
    def test_dtype_is_preserved(self, noise):
        comp = MasterCompressor(sample_rate=44100)
        out = comp.process(noise(seed=6, n=1024).astype(np.float32))
        assert out.dtype == np.float32
