"""Frequency-shaping engines: biquad filtering, LFO curves, and the 3-band EQ."""

import numpy as np
import pytest

from smuve_eq import ParametricEQ
from smuve_filter import BiquadFilter
from smuve_lfo import LFOEngine


class TestBiquadFilter:
    @pytest.mark.parametrize("filter_type", ["lowpass", "highpass"])
    def test_coefficients_are_normalised(self, filter_type):
        filt = BiquadFilter(filter_type=filter_type, cutoff_freq=1000.0, q=0.707)
        assert filt.a1 != 0.0  # coefficients were actually computed
        # Normalising by a0 must make the b0 term the leading coefficient.
        assert np.isfinite([filt.b0, filt.b1, filt.b2, filt.a1, filt.a2]).all()

    def test_lowpass_has_unity_dc_gain(self, sample_rate):
        filt = BiquadFilter("lowpass", cutoff_freq=1234.0, q=3.0, sample_rate=sample_rate)
        dc_gain = (filt.b0 + filt.b1 + filt.b2) / (1.0 + filt.a1 + filt.a2)
        assert dc_gain == pytest.approx(1.0, abs=1e-12)

    def test_lowpass_passes_dc_and_highpass_rejects_it(self, sample_rate):
        dc = np.ones(4096)

        lowpassed = BiquadFilter("lowpass", 1234.0, 3.0, sample_rate).process(dc)
        assert lowpassed[-1] == pytest.approx(1.0, abs=1e-6)

        highpassed = BiquadFilter("highpass", 1234.0, 3.0, sample_rate).process(dc)
        assert highpassed[-1] == pytest.approx(0.0, abs=1e-6)

    def test_unknown_type_is_pass_through(self, noise):
        signal = noise(seed=1, n=512)
        out = BiquadFilter("not-a-filter", 1000.0, 1.0).process(signal)
        np.testing.assert_allclose(out, signal, atol=0.0)

    def test_output_length_and_dtype_follow_input(self, noise):
        signal = noise(seed=2, n=333).astype(np.float32)
        out = BiquadFilter("lowpass").process(signal)
        assert out.shape == signal.shape
        assert out.dtype == signal.dtype

    def test_state_carries_across_block_boundaries(self, noise, sample_rate):
        """Block-by-block rendering must equal one contiguous render.

        The synth engine sweeps the cutoff block-by-block, so the filter delay
        line has to survive between `process()` calls.
        """
        signal = noise(seed=3, n=1000)
        whole = BiquadFilter("lowpass", 2000.0, 2.0, sample_rate).process(signal)

        split = BiquadFilter("lowpass", 2000.0, 2.0, sample_rate)
        chunked = np.concatenate([split.process(signal[:256]), split.process(signal[256:])])
        np.testing.assert_allclose(chunked, whole, rtol=0.0, atol=1e-15)

    def test_empty_buffer(self):
        out = BiquadFilter("lowpass").process(np.zeros(0))
        assert out.shape == (0,)


class TestLFOEngine:
    @pytest.mark.parametrize("waveform", ["sine", "triangle", "square", "ramp"])
    def test_curve_length_and_range(self, waveform, sample_rate):
        curve = LFOEngine(3.0, waveform, sample_rate).generate_curve(0.5, 200.0, 2000.0)
        assert len(curve) == int(sample_rate * 0.5)
        assert curve.min() >= 200.0 - 1e-9
        assert curve.max() <= 2000.0 + 1e-9

    def test_waveform_shapes(self, sample_rate):
        # A period-long ramp spans the full range in unipolar terms.
        ramp = LFOEngine(1.0, "ramp", sample_rate).generate_curve(1.0, 0.0, 1.0)
        assert ramp[0] == pytest.approx(0.0, abs=1e-9)
        assert ramp[-1] == pytest.approx(1.0, abs=1e-3)

        # Square jumps between the two rails only.
        square = LFOEngine(1.0, "square", sample_rate).generate_curve(1.0, 0.0, 1.0)
        assert set(np.unique(square)) == {0.0, 1.0}

        # Sine starts its unipolar cycle at the midpoint.
        sine_curve = LFOEngine(1.0, "sine", sample_rate).generate_curve(1.0, 0.0, 1.0)
        assert sine_curve[0] == pytest.approx(0.5, abs=1e-9)

    def test_min_max_mapping_is_affine(self, sample_rate):
        curve = LFOEngine(2.0, "triangle", sample_rate).generate_curve(1.0, -6.0, 6.0)
        assert curve.min() == pytest.approx(-6.0, abs=1e-6)
        assert curve.max() == pytest.approx(6.0, abs=1e-6)

    def test_zero_duration_is_empty(self, sample_rate):
        assert len(LFOEngine(1.0, "sine", sample_rate).generate_curve(0.0)) == 0


class TestParametricEQ:
    def test_flat_settings_are_transparent(self, noise):
        signal = noise(seed=4, n=2048, scale=0.5)  # stays under the clip guard
        out = ParametricEQ(0.0, 0.0, 0.0).process(signal)
        np.testing.assert_allclose(out, signal, rtol=0.0, atol=1e-12)

    def test_low_boost_adds_low_end_energy(self, sine, sample_rate):
        tone = sine(freq=100.0, secs=0.2, amp=0.5, sr=sample_rate)
        boosted = ParametricEQ(low_gain_db=6.0, mid_gain_db=0.0, high_gain_db=0.0).process(tone)
        assert np.sqrt(np.mean(boosted**2)) > np.sqrt(np.mean(tone**2))

    def test_high_cut_removes_high_end_energy(self, sine, sample_rate):
        tone = sine(freq=8000.0, secs=0.2, amp=0.5, sr=sample_rate)
        cut = ParametricEQ(low_gain_db=0.0, mid_gain_db=0.0, high_gain_db=-12.0).process(tone)
        assert np.sqrt(np.mean(cut**2)) < np.sqrt(np.mean(tone**2))

    def test_output_never_clips(self, noise):
        signal = noise(seed=5, n=4096) * 3.0
        out = ParametricEQ(low_gain_db=6.0, mid_gain_db=6.0, high_gain_db=6.0).process(signal)
        assert np.max(np.abs(out)) <= 1.0

    def test_empty_buffer_is_returned_untouched(self):
        empty = np.zeros(0)
        assert ParametricEQ(3.0, -3.0, 3.0).process(empty) is empty
