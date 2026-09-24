"""Time-domain effects: lo-fi bitcrusher, chorus, delay, reverb, automation."""

import numpy as np
import pytest

from smuve_automation import ParameterAutomation
from smuve_bitcrusher import Bitcrusher
from smuve_fx_transport import DelayEffect, SimpleReverb
from smuve_modulation import ChorusEffect


class TestBitcrusher:
    def test_output_length_and_dtype(self, noise):
        signal = noise(seed=20, n=777)
        out = Bitcrusher().process(signal)
        assert out.shape == signal.shape
        assert out.dtype == signal.dtype

    def test_dry_signal_is_preserved_at_zero_mix(self, noise):
        signal = noise(seed=21, n=1024)
        np.testing.assert_allclose(Bitcrusher(bit_depth=4, mix=0.0).process(signal), signal, rtol=0.0, atol=0.0)

    def test_quantisation_lands_on_bit_depth_levels(self, noise):
        signal = noise(seed=22, n=1024)
        out = Bitcrusher(bit_depth=5, downsample_factor=1, mix=1.0).process(signal)
        steps = out * 2**5
        np.testing.assert_allclose(steps, np.round(steps), atol=1e-9)
        assert np.max(np.abs(out - signal)) <= 0.5 * 2**-5

    def test_decimation_holds_samples(self, noise):
        signal = noise(seed=23, n=64)
        out = Bitcrusher(bit_depth=8, downsample_factor=4, mix=1.0).process(signal)
        for start in range(0, 64, 4):
            np.testing.assert_allclose(out[start : start + 4], out[start])

    def test_downsample_factor_one_is_a_no_op_for_decimation(self, noise):
        signal = noise(seed=24, n=256)
        out = Bitcrusher(bit_depth=16, downsample_factor=1, mix=1.0).process(signal)
        # 16-bit quantisation of a [-1, 1] signal is below float precision.
        np.testing.assert_allclose(out, signal, atol=2**-16)

    def test_parameter_clamping(self):
        assert Bitcrusher(bit_depth=0).bit_depth == 1
        assert Bitcrusher(bit_depth=32).bit_depth == 16
        assert Bitcrusher(downsample_factor=0).downsample_factor == 1
        assert Bitcrusher(mix=9.0).mix == 1.0

    def test_empty_buffer(self):
        assert Bitcrusher().process(np.zeros(0)).shape == (0,)


class TestChorusEffect:
    def test_empty_buffer_is_returned_untouched(self):
        empty = np.zeros(0)
        assert ChorusEffect(sample_rate=44100).process(empty) is empty

    def test_output_length_is_preserved(self, noise):
        signal = noise(seed=25, n=5000)
        assert ChorusEffect(sample_rate=44100).process(signal).shape == signal.shape

    def test_dry_signal_is_preserved_at_zero_mix(self, noise):
        signal = noise(seed=26, n=5000)
        chorus = ChorusEffect(rate_hz=1.0, depth_ms=5.0, mix=0.0, sample_rate=44100)
        np.testing.assert_allclose(chorus.process(signal), signal, rtol=0.0, atol=0.0)

    def test_first_samples_have_no_delay_content(self, noise):
        """The 5-sample base offset means the head of the buffer is still dry."""
        signal = noise(seed=27, n=64)
        chorus = ChorusEffect(rate_hz=1.5, depth_ms=8.0, mix=1.0, sample_rate=44100)
        out = chorus.process(signal)
        np.testing.assert_allclose(out[:4], np.zeros(4), atol=1e-12)

    def test_delay_line_state_persists_between_calls(self, noise):
        signal = noise(seed=28, n=2000)
        chorus = ChorusEffect(rate_hz=1.5, depth_ms=8.0, mix=0.5, sample_rate=44100)
        first = chorus.process(signal)
        second = chorus.process(signal)
        assert not np.allclose(second, first)

    def test_identical_instances_are_deterministic(self, noise):
        signal = noise(seed=29, n=3000)
        a = ChorusEffect(1.5, 8.0, 0.5, 44100).process(signal)
        b = ChorusEffect(1.5, 8.0, 0.5, 44100).process(signal)
        np.testing.assert_array_equal(a, b)


class TestDelayEffect:
    def test_output_length_is_preserved(self, noise):
        signal = noise(seed=30, n=900)
        assert DelayEffect(0.005, 0.4, 0.5, 44100).process(signal).shape == signal.shape

    def test_dry_signal_is_preserved_at_zero_mix(self, noise):
        signal = noise(seed=31, n=600)
        np.testing.assert_allclose(DelayEffect(0.005, 0.4, 0.0, 44100).process(signal), signal, rtol=0.0, atol=0.0)

    def test_impulse_produces_an_echo_at_the_delay_time(self, sample_rate):
        delay = DelayEffect(delay_time_secs=0.002, feedback=0.5, mix=0.4, sample_rate=sample_rate)
        d = int(0.002 * sample_rate)  # 88 samples

        impulse = np.zeros(4 * d)
        impulse[0] = 1.0
        out = delay.process(impulse)

        assert out[d] == pytest.approx(0.4, abs=1e-12)  # first echo: mix * 1.0
        assert out[2 * d] == pytest.approx(0.4 * 0.5, abs=1e-12)  # feedback decayed
        assert out[3 * d] == pytest.approx(0.4 * 0.5**2, abs=1e-12)

    def test_no_feedback_leaves_a_single_echo(self, sample_rate):
        delay = DelayEffect(delay_time_secs=0.001, feedback=0.0, mix=0.5, sample_rate=sample_rate)
        d = int(0.001 * sample_rate)
        impulse = np.zeros(3 * d)
        impulse[0] = 1.0
        out = delay.process(impulse)
        assert out[2 * d] == pytest.approx(0.0, abs=1e-15)

    def test_delay_line_state_persists_between_calls(self, noise, sample_rate):
        signal = noise(seed=32, n=1200)
        whole = DelayEffect(0.002, 0.5, 0.4, sample_rate).process(signal)

        chunked = DelayEffect(0.002, 0.5, 0.4, sample_rate)
        parts = np.concatenate([chunked.process(signal[:256]), chunked.process(signal[256:])])
        np.testing.assert_allclose(parts, whole, rtol=0.0, atol=1e-15)


class TestSimpleReverb:
    def test_dry_signal_is_preserved_at_zero_mix(self, noise):
        signal = noise(seed=33, n=4096)
        np.testing.assert_allclose(SimpleReverb(mix=0.0).process(signal), signal, rtol=0.0, atol=0.0)

    def test_output_length_matches_input(self, noise):
        signal = noise(seed=34, n=4096)
        assert SimpleReverb(mix=0.3).process(signal).shape == signal.shape

    @pytest.mark.parametrize("sample_count", [10, 100, 1000])
    def test_short_buffers_preserve_length(self, sample_count):
        signal = np.ones(sample_count)
        output = SimpleReverb(mix=0.3).process(signal)
        assert output.shape == signal.shape
        assert np.isfinite(output).all()

    def test_empty_buffer_is_returned_untouched(self):
        empty = np.zeros(0)
        assert SimpleReverb().process(empty) is empty

    def test_wet_mix_smears_energy_past_the_dry_signal(self, noise):
        signal = noise(seed=35, n=4096)
        out = SimpleReverb(room_size=0.7, damping=0.5, mix=1.0).process(signal)
        assert not np.allclose(out, signal)


class TestParameterAutomation:
    def test_linear_gain_ramp_endpoints(self, noise):
        signal = noise(seed=36, n=1024)
        out = ParameterAutomation.apply_gain_ramp(signal, start_gain=0.0, end_gain=1.0, curve_type="linear")
        assert out[0] == pytest.approx(0.0)
        np.testing.assert_allclose(out[-1], signal[-1], rtol=0.0, atol=1e-12)

    def test_linear_gain_ramp_midpoint(self, noise):
        signal = np.ones(1001)
        out = ParameterAutomation.apply_gain_ramp(signal, 0.0, 1.0, "linear")
        assert out[500] == pytest.approx(0.5, abs=1e-9)

    def test_exponential_ramp_starts_at_the_floor(self, noise):
        signal = np.ones(512)
        out = ParameterAutomation.apply_gain_ramp(signal, start_gain=0.0, end_gain=1.0, curve_type="exponential")
        assert out[0] == pytest.approx(1e-4)
        assert out[-1] == pytest.approx(1.0)

    def test_empty_buffer_is_returned_untouched(self):
        empty = np.zeros(0)
        assert ParameterAutomation.apply_gain_ramp(empty) is empty

    def test_keyframe_envelope_hits_its_keyframes(self):
        env = ParameterAutomation.generate_envelope_points(1024, [(0, 0.0), (400, 1.0), (1024, 0.25)])
        assert env.shape == (1024,)
        assert env[0] == pytest.approx(0.0)
        assert env[400] == pytest.approx(1.0)
        assert env[1023] == pytest.approx(0.25, abs=2e-3)

    def test_unsorted_keyframes_are_sorted(self):
        points = [(512, 0.5), (0, 0.0), (1024, 1.0)]
        env = ParameterAutomation.generate_envelope_points(1024, points)
        assert env[0] == pytest.approx(0.0)
        assert env[512] == pytest.approx(0.5, abs=1e-9)
        assert env[-1] == pytest.approx(1.0, abs=2e-3)

    def test_no_keyframes_is_a_flat_unity_envelope(self):
        env = ParameterAutomation.generate_envelope_points(64, [])
        np.testing.assert_allclose(env, np.ones(64))
