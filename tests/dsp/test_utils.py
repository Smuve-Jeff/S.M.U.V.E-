"""Musical utilities: chords, arpeggiator, mixer bus, arranger, persistence."""

import json

import numpy as np
import pytest

from smuve_arp import Arpeggiator, ChordGenerator
from smuve_arranger import SongArranger
from smuve_mixer_bus import MixerBus
from smuve_sequencer import ProjectManager, StepPattern
from smuve_studio_engine import (
    Compressor,
    Limiter,
    SmuveStudioWorkspace,
    TrackType,
    UndoRedoManager,
)


class TestChordGenerator:
    @pytest.mark.parametrize(
        ("chord_type", "expected"),
        [
            ("maj", [60, 64, 67]),
            ("min", [60, 63, 67]),
            ("maj7", [60, 64, 67, 71]),
            ("min7", [60, 63, 67, 70]),
            ("dom7", [60, 64, 67, 70]),
            ("sus4", [60, 65, 67]),
        ],
    )
    def test_chord_intervals(self, chord_type, expected):
        assert ChordGenerator.get_chord_notes(60, chord_type) == expected

    def test_chord_type_is_case_insensitive(self):
        assert ChordGenerator.get_chord_notes(60, "MIN7") == ChordGenerator.get_chord_notes(60, "min7")

    def test_unknown_chord_defaults_to_major(self):
        assert ChordGenerator.get_chord_notes(60, "wat") == [60, 64, 67]


class TestArpeggiator:
    def test_step_count_is_honoured(self):
        for steps in (1, 7, 16, 33):
            assert len(Arpeggiator.generate_arp_sequence([60, 64, 67], "up", steps)) == steps

    def test_up_pattern_cycles_the_chord(self):
        assert Arpeggiator.generate_arp_sequence([60, 64, 67], "up", 7) == [60, 64, 67, 60, 64, 67, 60]

    def test_down_pattern_cycles_the_chord_descending(self):
        assert Arpeggiator.generate_arp_sequence([60, 64, 67], "down", 5) == [67, 64, 60, 67, 64]

    def test_updown_pattern_skips_the_repeated_endpoints(self):
        assert Arpeggiator.generate_arp_sequence([60, 64, 67, 71], "updown", 9) == [
            60,
            64,
            67,
            71,
            67,
            64,
            60,
            64,
            67,
        ]

    def test_two_note_chord_updown_reflects_notes(self):
        assert Arpeggiator.generate_arp_sequence([60, 64], "updown", 5) == [60, 64, 64, 60, 60]

    def test_empty_chord_returns_no_steps(self):
        assert Arpeggiator.generate_arp_sequence([], "up", 16) == []

    def test_unsorted_chord_input_is_sorted(self):
        assert Arpeggiator.generate_arp_sequence([67, 60, 64], "up", 3) == [60, 64, 67]


class TestMixerBus:
    def test_volume_is_applied_on_registration(self, sample_rate):
        mixer = MixerBus(sample_rate)
        mixer.add_track_buffer("drums", np.ones(10), volume=0.5)
        assert mixer.tracks[0]["buffer"][0] == pytest.approx(0.5)

    def test_sum_mix_pads_and_truncates(self, sample_rate):
        mixer = MixerBus(sample_rate)
        mixer.add_track_buffer("short", np.ones(4) * 0.3)
        mixer.add_track_buffer("long", np.ones(20) * 0.2)
        mixed = mixer.sum_mix(8)
        assert mixed.shape == (8, 2)
        # Center-panned tracks contribute equal power to both channels.
        center_gain = np.sqrt(0.5)
        expected = np.column_stack(
            (
                np.tanh(np.concatenate([np.full(4, 0.5), np.full(4, 0.2)]) * center_gain),
                np.tanh(np.concatenate([np.full(4, 0.5), np.full(4, 0.2)]) * center_gain),
            )
        )
        np.testing.assert_allclose(mixed, expected, rtol=1e-12)

    @pytest.mark.parametrize(
        ("pan", "expected_left", "expected_right"),
        [
            (-1.0, 1.0, 0.0),
            (0.0, np.sqrt(0.5), np.sqrt(0.5)),
            (1.0, 0.0, 1.0),
        ],
    )
    def test_constant_power_pan(self, pan, expected_left, expected_right):
        mixer = MixerBus()
        mixer.add_track_buffer("panned", np.ones(8), pan=pan)

        mixed = mixer.sum_mix(8)

        assert mixed.shape == (8, 2)
        np.testing.assert_allclose(mixed[:, 0], np.tanh(expected_left), rtol=1e-12, atol=1e-15)
        np.testing.assert_allclose(mixed[:, 1], np.tanh(expected_right), rtol=1e-12, atol=1e-15)
        if pan == -1.0:
            assert np.allclose(mixed[:, 1], 0.0, atol=1e-15)
        elif pan == 1.0:
            assert np.allclose(mixed[:, 0], 0.0, atol=1e-15)

    def test_pan_is_clamped_to_valid_range(self):
        left_mixer = MixerBus()
        left_mixer.add_track_buffer("left", np.ones(4), pan=-2.0)
        right_mixer = MixerBus()
        right_mixer.add_track_buffer("right", np.ones(4), pan=2.0)

        left_mix = left_mixer.sum_mix(4)
        right_mix = right_mixer.sum_mix(4)

        np.testing.assert_allclose(left_mix[:, 0], np.tanh(np.ones(4)), rtol=1e-12)
        np.testing.assert_allclose(left_mix[:, 1], np.zeros(4), rtol=1e-12, atol=1e-15)
        np.testing.assert_allclose(right_mix[:, 0], np.zeros(4), rtol=1e-12, atol=1e-15)
        np.testing.assert_allclose(right_mix[:, 1], np.tanh(np.ones(4)), rtol=1e-12)

    def test_master_limiter_prevents_clipping(self, sample_rate):
        mixer = MixerBus(sample_rate)
        for i in range(4):
            mixer.add_track_buffer(f"track{i}", np.full(16, 0.9))
        mixed = mixer.sum_mix(16)
        assert np.max(np.abs(mixed)) <= 1.0

    def test_empty_mix_is_silent(self, sample_rate):
        mixer = MixerBus(sample_rate)
        mixed = mixer.sum_mix(32)
        assert mixed.shape == (32, 2)
        assert not np.any(mixed)


class TestSongArranger:
    def test_seconds_per_bar(self):
        assert SongArranger(bpm=120.0, time_signature_numerator=4).seconds_per_bar() == pytest.approx(2.0)
        assert SongArranger(bpm=60.0, time_signature_numerator=4).seconds_per_bar() == pytest.approx(4.0)

    def test_empty_arrangement(self):
        assert SongArranger().render_arrangement().shape == (0,)

    def test_clips_land_on_their_bar_boundaries(self, sample_rate):
        arranger = SongArranger(bpm=120.0, sample_rate=sample_rate)
        samples_per_bar = int(arranger.seconds_per_bar() * sample_rate)  # 88200

        clip = np.ones(100)
        arranger.add_clip("Chorus", start_bar=1, length_bars=1, audio_buffer=clip)

        song = arranger.render_arrangement()
        assert len(song) == 2 * samples_per_bar
        np.testing.assert_allclose(song[samples_per_bar : samples_per_bar + 100], clip)
        assert np.sum(np.abs(song[:samples_per_bar])) == pytest.approx(0.0)

    def test_overlapping_clips_are_summed(self, sample_rate):
        arranger = SongArranger(bpm=120.0, sample_rate=sample_rate)
        arranger.add_clip("A", 0, 1, np.full(64, 0.25))
        arranger.add_clip("B", 0, 1, np.full(64, 0.5))
        song = arranger.render_arrangement()
        assert song[0] == pytest.approx(0.75)


class TestStepSequencer:
    def test_pattern_defaults_to_empty_steps(self):
        pattern = StepPattern(num_steps=16)
        assert len(pattern.steps) == 16
        assert not any(step.active for step in pattern.steps)

    def test_toggle_step_activates_and_sets_velocity(self):
        pattern = StepPattern(num_steps=16)
        pattern.toggle_step(4, velocity=120)
        assert pattern.steps[4].active
        assert pattern.steps[4].velocity == 120
        pattern.toggle_step(4)
        assert not pattern.steps[4].active

    @pytest.mark.parametrize("index", [-1, 16, 999])
    def test_out_of_range_toggle_is_ignored(self, index):
        pattern = StepPattern(num_steps=16)
        pattern.toggle_step(index)
        assert not any(step.active for step in pattern.steps)

    def test_project_round_trip(self, tmp_path):
        session = {
            "project_name": "Midnight Trap Anthem",
            "bpm": 140.0,
            "tracks": [{"name": "808 Kick", "active_steps": [0, 4, 8, 12]}],
        }
        path = tmp_path / "session.smuve"

        assert ProjectManager.save_project(session, str(path))
        assert ProjectManager.load_project(str(path)) == session

    def test_missing_project_returns_none(self, tmp_path):
        assert ProjectManager.load_project(str(tmp_path / "nope.smuve")) is None


class TestStudioDSPChain:
    def test_in_place_compressor_reduces_loud_signals(self, sample_rate):
        comp = Compressor(threshold_db=-20.0, ratio=4.0)
        buffer = np.full(64, 0.5)
        out = comp.process(buffer, sample_rate)
        expected = 0.1 * (0.5 / 0.1) ** (1.0 / 4.0)
        np.testing.assert_allclose(out, np.full(64, expected), rtol=1e-9)

    def test_compressor_leaves_quiet_signals_alone(self, sample_rate):
        comp = Compressor(threshold_db=-20.0, ratio=4.0)
        buffer = np.full(64, 0.05)
        np.testing.assert_allclose(comp.process(buffer, sample_rate), buffer, rtol=0.0, atol=0.0)

    def test_limiter_clamps_to_ceiling(self, sample_rate):
        ceiling = 10.0 ** (-0.1 / 20.0)
        out = Limiter(ceiling_db=-0.1).process(np.full(64, 2.0), sample_rate)
        assert np.max(out) == pytest.approx(ceiling, rel=1e-9)

    def test_muted_channel_is_silent(self, sample_rate):
        workspace = SmuveStudioWorkspace(sample_rate=sample_rate)
        track_id = workspace.add_track("Muted Lead", TrackType.INSTRUMENT)
        channel = workspace.tracks[track_id]["mixer_channel"]
        channel.mute = True
        assert not np.any(channel.process_audio(np.ones(16), sample_rate))

    def test_workspace_summary_and_stems(self, sample_rate):
        workspace = SmuveStudioWorkspace(bpm=128.0, sample_rate=sample_rate)
        workspace.add_track("Lead Synth", TrackType.INSTRUMENT)
        workspace.add_track("Drums Bus", TrackType.GROUP_BUS)

        summary = json.loads(workspace.get_project_summary())
        assert summary["bpm"] == 128.0
        assert summary["total_tracks"] == 2

        stems = workspace.export_stems()
        assert set(stems) == {"Lead Synth", "Drums Bus"}
        assert len(stems["Lead Synth"]) == sample_rate * 5


class TestUndoRedoManager:
    def test_execute_undo_redo_cycle(self):
        log = []

        class AddNote:
            def execute(self):
                log.append("do")

            def undo(self):
                log.append("undo")

        manager = UndoRedoManager()
        manager.execute_command(AddNote())
        assert log == ["do"]

        assert manager.undo() is True
        assert log == ["do", "undo"]

        assert manager.redo() is True
        assert log == ["do", "undo", "do"]

    def test_undo_with_empty_stack_returns_false(self):
        manager = UndoRedoManager()
        assert manager.undo() is False
        assert manager.redo() is False

    def test_history_is_capped(self):
        class Noop:
            def execute(self):
                pass

            def undo(self):
                pass

        manager = UndoRedoManager(max_history=3)
        for _ in range(5):
            manager.execute_command(Noop())
        assert len(manager.undo_stack) == 3
