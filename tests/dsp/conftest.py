"""Shared fixtures for the S.M.U.V.E- DSP test suite."""

import numpy as np
import pytest

SAMPLE_RATE = 44100


@pytest.fixture
def sample_rate() -> int:
    return SAMPLE_RATE


@pytest.fixture
def noise():
    """Factory for deterministic white-noise buffers.

    Usage: ``noise(seed=1, n=4096, scale=0.5)``
    """

    def _make(seed: int = 0, n: int = 4096, scale: float = 1.0) -> np.ndarray:
        return (np.random.default_rng(seed).uniform(-1.0, 1.0, n) * scale).astype(np.float64)

    return _make


@pytest.fixture
def sine():
    """Factory for a mono sine tone at ``freq`` Hz."""

    def _make(freq: float = 440.0, secs: float = 1.0, amp: float = 1.0, sr: int = SAMPLE_RATE) -> np.ndarray:
        t = np.linspace(0.0, secs, int(sr * secs), endpoint=False)
        return amp * np.sin(2.0 * np.pi * freq * t)

    return _make
