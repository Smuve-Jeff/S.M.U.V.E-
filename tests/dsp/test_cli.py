"""Interactive studio menu: scripted walks that pin the CLI-to-engine wiring."""

import json

import pytest

from smuve_main import SmuveInteractiveStudio
from smuve_preset_manager import PresetManager


def run_menu(monkeypatch, studio, *answers):
    """Drives ``interactive_menu()`` with scripted answers to its prompts."""
    replies = iter(answers)
    monkeypatch.setattr("builtins.input", lambda *args: next(replies))
    studio.interactive_menu()


@pytest.fixture
def studio(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    s = SmuveInteractiveStudio()
    s.preset_mgr = PresetManager(preset_dir=str(tmp_path / "presets"))
    return s


class TestMenuWiring:
    def test_rendered_note_joins_the_mixer_under_its_waveform_name(self, studio, monkeypatch):
        # Used to die with NameError: the handler referenced an undefined
        # ``wave_type`` instead of reading it off the active patch.
        run_menu(monkeypatch, studio, "2", "60", "0.5", "y", "18")

        names = [t["name"] for t in studio.mixer.tracks]
        assert names == ["Synth SAW"]
        assert len(studio.mixer.tracks[0]["buffer"]) > 0

    def test_loading_a_factory_patch_copies_it_out_of_the_catalog(self, studio, monkeypatch):
        run_menu(monkeypatch, studio, "13", "1", "1", "18")

        catalog_entry = studio.factory_presets["Warm Saw Lead"]
        assert studio.active_patch["name"] == "Warm Saw Lead"
        # No aliasing: the shared factory catalog keeps its pristine shape.
        assert "name" not in catalog_entry

        studio.active_patch["cutoff_hz"] = 999
        assert catalog_entry["cutoff_hz"] != 999


class TestPatchSave:
    def test_saving_the_current_patch_keeps_parameters_the_editor_never_prompts_for(
        self, studio, monkeypatch, tmp_path
    ):
        before = dict(studio.active_patch)

        # Every prompt left blank — the defaults must come from the active
        # patch, and the unprompted sound-design params must survive.
        run_menu(monkeypatch, studio, "14", "", "", "", "", "", "18")

        saved = json.loads(
            (tmp_path / "presets" / "synth_warm_saw_lead.json").read_text()
        )
        assert saved["parameters"] == before
        assert studio.active_patch == before
        for key in ("attack_sec", "decay_sec", "sustain_level", "release_sec"):
            assert saved["parameters"][key] == before[key]

    def test_prompted_values_override_the_defaults(self, studio, monkeypatch, tmp_path):
        run_menu(
            monkeypatch,
            studio,
            "14",
            "Deep Tech Bass",
            "square",
            "800",
            "1.5",
            "n",
            "18",
        )

        saved = json.loads(
            (tmp_path / "presets" / "synth_deep_tech_bass.json").read_text()
        )
        params = saved["parameters"]
        assert params["name"] == "Deep Tech Bass"
        assert params["wave_type"] == "square"
        assert params["cutoff_hz"] == 800.0
        assert params["resonance_q"] == 1.5
        assert params["use_lfo"] is False


class TestSessionPersistence:
    def test_save_then_load_round_trips_the_session(self, studio, monkeypatch, tmp_path):
        studio.transport.bpm = 90.0
        studio.step_pattern.pattern_name = "Deep Groove"
        studio.active_patch = {
            "name": "Custom",
            "wave_type": "square",
            "cutoff_hz": 1234,
            "use_lfo": False,
        }

        run_menu(monkeypatch, studio, "17", "1", "18")
        assert (tmp_path / "smuve_master_session.smuve").exists()

        fresh = SmuveInteractiveStudio()
        run_menu(monkeypatch, fresh, "17", "2", "18")

        assert fresh.transport.bpm == 90.0
        assert fresh.arranger.bpm == 90.0
        assert fresh.step_pattern.pattern_name == "Deep Groove"
        assert fresh.active_patch == studio.active_patch

    def test_loading_a_missing_session_leaves_the_studio_alone(self, studio, monkeypatch):
        bpm_before = studio.transport.bpm

        run_menu(monkeypatch, studio, "17", "2", "18")

        assert studio.transport.bpm == bpm_before
