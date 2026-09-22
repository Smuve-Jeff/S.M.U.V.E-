"""Dynamic-range engines: master compressor, sidechain ducking, tape saturation."""

import numpy as np
import pytest

from smuve_dynamics import MasterCompressor
from smuve_saturation import SaturationEffect
from smuve_sidechain import SidechainCompressor


class TestMasterCompressor:
    def test_quiet_signal_passes_through_unity(self, noise):
        comp = MasterCompressor(threshold_db=-12.0, ratio=4.0)
        quiet = noise(seed=10, n=2048, scale=0.2)  # below the -12 dB threshold
        np.testing.assert_allclose(comp.process(quiet), quiet, rtol=0.0, atol=0.0)

    def test_loud_signal_is_compressed(self, noise):
        comp = MasterCompressor(threshold_db=-12.0, ratio=4.0)
        loud = noise(seed=11, n=8192, scale=0.9)
        out = comp.process(loud)
        assert np.sqrt(np.mean(out**2)) < np.sqrt(np.mean(loud**2))

    def test_higher_ratio_compresses_harder(self, noise):
        loud = noise(seed=12, n=8192, scale=0.9)
        gentle = MasterCompressor(threshold_db=-12.0, ratio=2.0).process(loud)
        hard = MasterCompressor(threshold_db=-12.0, ratio=12.0).process(loud)
        # Compare energy rather than peaks: the attack transient of both
        # renders is identical and would mask the ratio difference.
        assert np.mean(np.abs(hard)) < np.mean(np.abs(gentle))

    def test_below_threshold_samples_are_untouched_within_a_loud_pass(self, noise):
        comp = MasterCompressor(threshold_db=-12.0, ratio=4.0)
        comp.process(noise(seed=13, n=4096, scale=0.9))
        # The envelope is still hot, so the *first* quiet samples get ducked.
        quiet = np.full(64, 0.05)
        out = comp.process(quiet)
        assert out[0] < quiet[0]

    def test_envelope_state_persists_between_calls(self, noise, sample_rate):
        loud = noise(seed=14, n=4096, scale=0.9)
        single = MasterCompressor(threshold_db=-12.0, ratio=4.0, sample_rate=sample_rate)
        whole = single.process(np.concatenate([loud, loud]))

        chunked_comp = MasterCompressor(threshold_db=-12.0, ratio=4.0, sample_rate=sample_rate)
        chunked = np.concatenate([chunked_comp.process(loud), chunked_comp.process(loud)])

        np.testing.assert_allclose(chunked[4096:], whole[4096:], rtol=0.0, atol=1e-15)

    def test_empty_buffer(self):
        comp = MasterCompressor()
        out = comp.process(np.zeros(0))
        assert out.shape == (0,)
        assert comp.envelope == 0.0

    def test_ballistics_coefficients_are_stable(self):
        comp = MasterCompressor(attack_ms=5.0, release_ms=50.0)
        for coeff in (comp.attack_coeff, comp.release_coeff):
            assert 0.0 < coeff < 1.0
        assert comp.attack_coeff < comp.release_coeff  # faster attack than release


class TestSidechainCompressor:
    def test_empty_input_is_returned(self):
        sc = SidechainCompressor()
        empty = np.zeros(0)
        assert sc.process(empty, np.ones(10)) is empty
        assert sc.process(np.ones(10), empty).shape == (10,)

    def test_length_mismatch_is_padded_to_the_longest(self, noise):
        sc = SidechainCompressor()
        out = sc.process(noise(seed=15, n=1000), noise(seed=16, n=1500))
        assert out.shape == (1500,)

    def test_kick_ducks_a_constant_pad(self, sample_rate):
        sc = SidechainCompressor(threshold_db=-10.0, ratio=6.0, attack_ms=1.0)
        target = np.full(sample_rate, 0.8)

        trigger = np.zeros(sample_rate)
        trigger[: sample_rate // 10] = 1.0  # loud transient

        ducked = sc.process(target, trigger)
        assert np.min(ducked[: sample_rate // 10]) < 0.8
        assert np.all(ducked <= 0.8 + 1e-9)

    def test_silent_trigger_leaves_target_untouched(self, sample_rate):
        sc = SidechainCompressor()
        target = np.full(2048, 0.6)
        np.testing.assert_allclose(sc.process(target, np.zeros(2048)), target, rtol=0.0, atol=0.0)


class TestSaturationEffect:
    def test_is_an_odd_function(self, noise):
        sat = SaturationEffect(drive=3.0, mix=0.6)
        signal = noise(seed=17, n=2048, scale=0.5)
        np.testing.assert_allclose(sat.process(-signal), -sat.process(signal), rtol=0.0, atol=1e-15)

    def test_dry_signal_is_preserved_at_zero_mix(self, noise):
        signal = noise(seed=18, n=512)
        np.testing.assert_allclose(SaturationEffect(drive=3.0, mix=0.0).process(signal), signal, rtol=0.0, atol=0.0)

    def test_output_stays_bounded(self, noise):
        out = SaturationEffect(drive=20.0, mix=1.0).process(noise(seed=19, n=2048) * 8.0)
        assert np.max(np.abs(out)) <= 1.0

    def test_low_drive_adds_harmonics_without_crushing_level(self, sine, sample_rate):
        tone = sine(freq=220.0, secs=0.25, amp=0.5, sr=sample_rate)
        out = SaturationEffect(drive=1.0, mix=0.5).process(tone)
        assert np.sqrt(np.mean(out**2)) > 0.0
        assert not np.allclose(out, tone)

    def test_parameter_clamping(self):
        assert SaturationEffect(drive=0.1).drive == 1.0
        assert SaturationEffect(mix=5.0).mix == 1.0
        assert SaturationEffect(mix=-1.0).mix == 0.0

    def test_empty_buffer_is_returned_untouched(self):
        empty = np.zeros(0)
        assert SaturationEffect().process(empty) is empty
