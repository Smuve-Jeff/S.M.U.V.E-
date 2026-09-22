"""Preset engine: factory patches, JSON disk persistence, and the authored preset."""

import json
from pathlib import Path

import numpy as np
import pytest

from smuve_main import SmuveInteractiveStudio
from smuve_preset_manager import PresetManager

REPO_ROOT = Path(__file__).resolve().parents[2]
PRESETS_DIR = REPO_ROOT / "presets"
AUTHORED_PRESET = PRESETS_DIR / "synth_lo-fi_acid_bass.json"
FACTORY_PRESETS = PresetManager.get_factory_presets()

NUMERIC_SYNTH_KEYS = (
    "cutoff_hz",
    "resonance_q",
    "attack_sec",
    "decay_sec",
    "sustain_level",
    "release_sec",
)


class TestFactoryPresets:
    @pytest.mark.parametrize("preset_name", tuple(FACTORY_PRESETS))
    def test_exposes_the_parameters_the_synth_consumes(self, preset_name):
        patch = FACTORY_PRESETS[preset_name]

        assert patch["wave_type"] in {"saw", "sine", "square", "triangle"}
        assert isinstance(patch["use_lfo"], bool)
        for key in NUMERIC_SYNTH_KEYS:
            assert isinstance(patch[key], (int, float)), key
            assert not isinstance(patch[key], bool), key

        assert 0.0 <= patch["sustain_level"] <= 1.0
        assert patch["attack_sec"] > 0.0 and patch["release_sec"] > 0.0

    def test_names_are_unique(self):
        assert len(set(FACTORY_PRESETS)) == len(FACTORY_PRESETS)


class TestPresetPersistence:
    def test_save_then_load_round_trips_the_parameters(self, tmp_path):
        manager = PresetManager(preset_dir=str(tmp_path))
        params = FACTORY_PRESETS["Lush Ambient Pad"]

        assert manager.save_preset("Lush Ambient Pad", "synth", params) is True

        path = tmp_path / "synth_lush_ambient_pad.json"
        assert manager.load_preset(str(path)) == params

    def test_saved_filename_is_derived_from_the_preset_name(self, tmp_path):
        manager = PresetManager(preset_dir=str(tmp_path))
        manager.save_preset("Lo-Fi Acid Bass", "synth", FACTORY_PRESETS["Lo-Fi Acid Bass"])

        assert (tmp_path / "synth_lo-fi_acid_bass.json").exists()

    def test_saved_payload_keeps_the_name_and_category(self, tmp_path):
        manager = PresetManager(preset_dir=str(tmp_path))
        manager.save_preset("Warm Saw Lead", "synth", FACTORY_PRESETS["Warm Saw Lead"])

        payload = json.loads((tmp_path / "synth_warm_saw_lead.json").read_text())
        assert payload["preset_name"] == "Warm Saw Lead"
        assert payload["category"] == "synth"
        assert payload["parameters"] == FACTORY_PRESETS["Warm Saw Lead"]

    def test_list_presets_filters_by_category(self, tmp_path):
        manager = PresetManager(preset_dir=str(tmp_path))
        manager.save_preset("Warm Saw Lead", "synth", FACTORY_PRESETS["Warm Saw Lead"])
        manager.save_preset("Tape Delay", "fx", {"mix": 0.4})

        assert manager.list_presets("synth") == [str(tmp_path / "synth_warm_saw_lead.json")]
        assert manager.list_presets() == [
            str(tmp_path / "fx_tape_delay.json"),
            str(tmp_path / "synth_warm_saw_lead.json"),
        ]

    def test_list_presets_on_a_missing_directory(self, tmp_path):
        assert PresetManager(preset_dir=str(tmp_path / "nope")).list_presets() == []

    def test_load_missing_preset_returns_empty(self, tmp_path):
        manager = PresetManager(preset_dir=str(tmp_path))
        assert manager.load_preset(str(tmp_path / "ghost.json")) == {}

    def test_load_corrupt_preset_returns_empty(self, tmp_path):
        broken = tmp_path / "synth_broken.json"
        broken.write_text("{not json")

        assert PresetManager(preset_dir=str(tmp_path)).load_preset(str(broken)) == {}


class TestAuthoredPreset:
    """The preset committed to disk has to stay loadable by the engine."""

    def test_is_committed_where_the_manager_looks(self):
        assert AUTHORED_PRESET.exists(), "the authored preset went missing"

        manifest = PresetManager(preset_dir=str(PRESETS_DIR)).list_presets("synth")
        assert str(AUTHORED_PRESET) in manifest

    def test_matches_the_factory_patch(self):
        payload = json.loads(AUTHORED_PRESET.read_text())

        assert payload["category"] == "synth"
        assert payload["preset_name"] == "Lo-Fi Acid Bass"
        assert payload["parameters"] == FACTORY_PRESETS["Lo-Fi Acid Bass"]

    def test_saving_the_factory_patch_reproduces_the_authored_file(self, tmp_path):
        manager = PresetManager(preset_dir=str(tmp_path))
        manager.save_preset(
            "Lo-Fi Acid Bass", "synth", FACTORY_PRESETS["Lo-Fi Acid Bass"]
        )

        written = json.loads((tmp_path / AUTHORED_PRESET.name).read_text())
        assert written == json.loads(AUTHORED_PRESET.read_text())

    def test_loaded_parameters_render_a_note(self):
        manager = PresetManager(preset_dir=str(PRESETS_DIR))
        patch = manager.load_preset(str(AUTHORED_PRESET))
        assert patch, "the authored preset should load its parameters"

        studio = SmuveInteractiveStudio()
        studio.active_patch = dict(patch, name="Lo-Fi Acid Bass")
        buffer = studio.render_active_note(60, 1.0)

        assert len(buffer) == studio.sample_rate
        assert np.isfinite(buffer).all()
        assert np.max(np.abs(buffer)) > 0.0

    def test_authored_patch_applies_its_six_bit_character(self):
        """The preset asks for 6-bit depth, so the render must land on that grid."""
        patch = dict(FACTORY_PRESETS["Lo-Fi Acid Bass"])
        assert patch["bit_depth"] == 6

        studio = SmuveInteractiveStudio()
        studio.active_patch = patch
        buffer = studio.render_active_note(60, 1.0)

        levels = float(2 ** patch["bit_depth"])
        np.testing.assert_allclose(buffer * levels, np.round(buffer * levels), atol=1e-9)
