"""
S.M.U.V.E- Master Application Orchestrator & Interactive CLI Workstation
Author: Smuve-Jeff Architectural Architecture
Description: Unifies studio workspace, synth engine, step sequencer, song arranger, 
             transport clock, spatial FX, multi-track mixer, master dynamics compressor, 
             audio sampler, chord generator/arpeggiator, stem exporter, 
             analog saturation, sidechain ducking, 3-band parametric EQ, 
             stereo chorus modulation, lo-fi bitcrusher, dynamic automation ramps, 
             synth patch & preset manager, and WAV master rendering into a complete 
             professional mobile DAW (v2.8).
"""

import sys
import os
import wave
import numpy as np

# Import all S.M.U.V.E- Submodules
from smuve_studio_engine import SmuveStudioWorkspace, TrackType
from smuve_synth_engine import SynthesizerVoice, DrumMachineRack
from smuve_sequencer import StepPattern, ProjectManager
from smuve_fx_transport import MasterTransport, DelayEffect, SimpleReverb
from smuve_mixer_bus import MixerBus
from smuve_export import AudioExporter
from smuve_arranger import SongArranger
from smuve_dynamics import MasterCompressor
from smuve_sampler import AudioSampler
from smuve_stem_export import StemExporter
from smuve_arp import ChordGenerator, Arpeggiator
from smuve_saturation import SaturationEffect
from smuve_sidechain import SidechainCompressor
from smuve_eq import ParametricEQ
from smuve_modulation import ChorusEffect
from smuve_bitcrusher import Bitcrusher
from smuve_automation import ParameterAutomation
from smuve_preset_manager import PresetManager

class SmuveInteractiveStudio:
    def __init__(self):
        self.sample_rate = 44100
        self.transport = MasterTransport(bpm=130.0, sample_rate=self.sample_rate)
        self.synth = SynthesizerVoice(sample_rate=self.sample_rate)
        self.drums = DrumMachineRack(sample_rate=self.sample_rate)
        self.mixer = MixerBus(sample_rate=self.sample_rate)
        self.delay = DelayEffect(delay_time_secs=0.3, feedback=0.4, mix=0.3, sample_rate=self.sample_rate)
        self.reverb = SimpleReverb(room_size=0.7, mix=0.2, sample_rate=self.sample_rate)
        self.step_pattern = StepPattern(pattern_name="Main Beat", num_steps=16)
        self.arranger = SongArranger(bpm=self.transport.bpm, sample_rate=self.sample_rate)
        self.compressor = MasterCompressor(threshold_db=-8.0, ratio=4.0, sample_rate=self.sample_rate)
        self.sampler = AudioSampler(sample_rate=self.sample_rate)
        
        # Preset Management Integration
        self.preset_mgr = PresetManager()
        self.factory_presets = PresetManager.get_factory_presets()
        self.active_patch = dict(self.factory_presets["Warm Saw Lead"])
        self.active_patch["name"] = "Warm Saw Lead"

    @staticmethod
    def _ask_int(prompt: str, default: int) -> int:
        """Reads a whole number, falling back to `default` on blank/invalid input.

        A typo at a numeric prompt used to raise ValueError and kill the whole
        session mid-session, losing the unsaved arrangement.
        """
        raw = input(prompt).strip()
        if not raw:
            return default
        try:
            return int(raw)
        except ValueError:
            print(f"[-] '{raw}' is not a whole number - using {default}.")
            return default

    @staticmethod
    def _ask_float(prompt: str, default: float) -> float:
        """Reads a number, falling back to `default` on blank/invalid input."""
        raw = input(prompt).strip()
        if not raw:
            return default
        try:
            return float(raw)
        except ValueError:
            print(f"[-] '{raw}' is not a number - using {default}.")
            return default

    def render_active_note(self, midi_note: int, duration_secs: float = 1.0) -> np.ndarray:
        """Renders a note using every sound-design parameter of the active patch:
        waveform, filter cutoff/resonance, LFO rate, ADSR stages, drive & bit depth."""
        patch = self.active_patch
        buf = self.synth.render_note(
            midi_note=midi_note,
            duration_secs=duration_secs,
            wave_type=patch.get("wave_type", "saw"),
            filter_cutoff_base=float(patch.get("cutoff_hz", 800.0)),
            resonance_q=float(patch.get("resonance_q", 2.5)),
            lfo_rate=float(patch.get("lfo_rate_hz", 2.0)),
            use_lfo=bool(patch.get("use_lfo", True)),
            attack_sec=float(patch.get("attack_sec", 0.05)),
            decay_sec=float(patch.get("decay_sec", 0.1)),
            sustain_level=float(patch.get("sustain_level", 0.7)),
            release_sec=float(patch.get("release_sec", 0.2)),
        )

        # Optional patch-level character processing
        drive = patch.get("drive")
        if drive:
            buf = np.tanh(buf * float(drive))
        bit_depth = patch.get("bit_depth")
        if bit_depth:
            levels = float(2 ** int(bit_depth))
            buf = np.round(buf * levels) / levels
        return buf

    def interactive_menu(self):
        while True:
            print("\n==================================================")
            print("   S.M.U.V.E- PRO MOBILE DAW WORKSTATION (v2.8)")
            print(f"   Active Synth Patch: [{self.active_patch.get('wave_type', 'saw').upper()}] {self.active_patch.get('name', 'Custom Patch')}")
            print("==================================================")
            print("1. Trigger Drum Pad & Process Spatial FX")
            print("2. Render Synth Note with Active Patch")
            print("3. Run 16-Step Grid Sequencer Pattern")
            print("4. Build Multi-Bar Song Arrangement")
            print("5. Run Multi-Track Mix, Master Compression & Export WAV")
            print("6. Generate Chord & Arpeggiated Synth Sequence")
            print("7. Apply Analog Saturation / Waveshaper Distortion")
            print("8. Apply Kick Sidechain Ducking to Target Audio")
            print("9. Apply 3-Band Parametric EQ Shaping")
            print("10. Apply Stereo Chorus & Modulation Width")
            print("11. Apply Lo-Fi Bitcrusher & Sample-Rate Reduction")
            print("12. Create & Apply Dynamic Parameter Automation Ramp")
            print("13. Load Factory Synth Patch or Preset (.json)")
            print("14. Save Current Patch Settings to Preset File")
            print("15. Export Multi-Track Mixer Stems (.wav)")
            print("16. Load External WAV Audio Sample / Loop")
            print("17. Save/Load Project Session (.smuve)")
            print("18. Exit Studio")
            
            choice = input("\nSelect an option [1-18]: ").strip()
            
            if choice == "1":
                pad_id = self._ask_int("Enter Drum Pad ID (1: Kick, 2: Snare, 3: Hi-Hat): ", 1)
                if pad_id not in (1, 2, 3):
                    # play_pad returns silence (never None) for unknown pads, so
                    # the old `is not None` check could never report a bad pad.
                    print("[-] Invalid pad ID. Choose 1 (Kick), 2 (Snare) or 3 (Hi-Hat).")
                else:
                    audio = self.drums.play_pad(pad_id)
                    processed = self.delay.process(audio)
                    processed = self.reverb.process(processed)
                    print(f"[+] Triggered Pad {pad_id} | Processed FX Buffer: {len(processed)} samples")
                    
            elif choice == "2":
                note = self._ask_int("Enter MIDI Note Number (default 60 = C4): ", 60)
                dur = self._ask_float("Enter Duration in Seconds (default 1.0): ", 1.0)
                buf = self.render_active_note(midi_note=note, duration_secs=dur)
                print(f"[+] Rendered '{self.active_patch.get('wave_type', 'saw')}' synth note at MIDI {note} using active patch settings ({len(buf)} samples)")
                
                add_mix = input("Add this note to the Mixer Bus? (y/n): ").strip().lower()
                if add_mix == 'y':
                    # Never name this local `wave`: it shadows the module-level
                    # `import wave` for the whole method, which broke option 16
                    # with UnboundLocalError.
                    waveform = self.active_patch.get('wave_type', 'saw')
                    self.mixer.add_track_buffer(f"Synth {waveform.upper()}", buf, volume=0.85)
                    print("[+] Track added to Mixer Bus!")

            elif choice == "3":
                print("[*] Configuring 16-Step Sequencer Pattern...")
                for step in [0, 4, 8, 12]:
                    self.step_pattern.toggle_step(step, velocity=127)
                active_steps = [i for i, s in enumerate(self.step_pattern.steps) if s.active]
                print(f"[+] Active Step Indices in Pattern '{self.step_pattern.pattern_name}': {active_steps}")
                
            elif choice == "4":
                print("[*] Assembling Song Timeline Arrangement...")
                self.arranger.clips.clear()
                intro_buffer = self.drums.play_pad(1)  # Kick
                lead_buffer = self.render_active_note(60, 2.0)
                
                self.arranger.add_clip("Intro Kick", start_bar=0, length_bars=2, audio_buffer=intro_buffer)
                self.arranger.add_clip("Lead Melodic Drop", start_bar=4, length_bars=4, audio_buffer=lead_buffer)
                
                arranged_song = self.arranger.render_arrangement()
                print(f"[+] Arrangement rendered successfully! Total timeline length: {len(arranged_song)} samples ({len(arranged_song)/44100:.2f}s)")
                
            elif choice == "5":
                print("[*] Summing multi-track session through mixer bus & compressor...")
                track1 = self.drums.play_pad(1)  # Kick
                track2 = self.render_active_note(midi_note=60, duration_secs=3.0)
                
                self.mixer.tracks.clear()
                self.mixer.add_track_buffer("Drums", track1, volume=1.0)
                self.mixer.add_track_buffer("Lead Synth", track2, volume=0.8)
                
                raw_mix = self.mixer.sum_mix(target_samples=int(self.sample_rate * 3.0))
                master_output = np.column_stack(
                    [self.compressor.process(raw_mix[:, channel]) for channel in range(raw_mix.shape[1])]
                )
                print(f"[+] Master mix compressed and summed successfully ({len(master_output)} samples).")
                
                filename = input("Enter output filename (default: smuve_master_compressed.wav): ").strip() or "smuve_master_compressed.wav"
                AudioExporter.export_to_wav(master_output, filename=filename, sample_rate=self.sample_rate)

            elif choice == "6":
                print("[*] Generating Chord Progression & Arpeggiator Sequence...")
                root_note = self._ask_int("Enter Root MIDI Note (default 60 = C4): ", 60)
                chord_type = input("Enter Chord Type (maj/min/maj7/min7/dom7/sus4): ").strip() or "min7"
                arp_pattern = input("Enter Arp Pattern (up/down/updown): ").strip() or "updown"
                
                chord_notes = ChordGenerator.get_chord_notes(root_note, chord_type)
                arp_notes = Arpeggiator.generate_arp_sequence(chord_notes, pattern=arp_pattern, num_steps=16)
                print(f"[+] Generated Chord: {chord_notes} -> Arp Sequence: {arp_notes}")
                
                step_dur = 0.15
                arp_buffer = np.zeros(0)
                for note in arp_notes:
                    note_buf = self.render_active_note(midi_note=note, duration_secs=step_dur)
                    arp_buffer = np.concatenate([arp_buffer, note_buf])
                    
                print(f"[+] Rendered Arp buffer ({len(arp_buffer)} samples).")
                add_mix = input("Add this arpeggio sequence to the Mixer Bus tracks? (y/n): ").strip().lower()
                if add_mix == 'y':
                    self.mixer.add_track_buffer("Arp Synth", arp_buffer, volume=0.85)
                    print("[+] Arp track added to Mixer Bus!")

            elif choice == "7":
                print("[*] Applying Analog Saturation & Waveshaper Distortion...")
                test_buf = self.render_active_note(60, 2.0)
                drive = self._ask_float("Enter Saturation Drive (default 2.5): ", 2.5)
                mix_val = self._ask_float("Enter Dry/Wet Mix (0.0 to 1.0, default 0.4): ", 0.4)
                
                saturator = SaturationEffect(drive=drive, mix=mix_val, sample_rate=self.sample_rate)
                saturated_buf = saturator.process(test_buf)
                print(f"[+] Saturation applied successfully! Buffer length: {len(saturated_buf)} samples")
                
                add_mix = input("Add this saturated track to the Mixer Bus? (y/n): ").strip().lower()
                if add_mix == 'y':
                    self.mixer.add_track_buffer("Saturated Synth", saturated_buf, volume=0.9)
                    print("[+] Saturated track added to Mixer Bus!")

            elif choice == "8":
                print("[*] Applying Sidechain Compression & Ducking...")
                kick_buf = self.drums.play_pad(1)
                synth_buf = self.render_active_note(60, 2.0)
                
                thresh = self._ask_float("Enter Threshold in dB (default -15.0): ", -15.0)
                ratio = self._ask_float("Enter Ratio (default 6.0): ", 6.0)
                
                sidechain = SidechainCompressor(threshold_db=thresh, ratio=ratio, sample_rate=self.sample_rate)
                ducked_buf = sidechain.process(synth_buf, kick_buf)
                print(f"[+] Sidechain ducking applied successfully! Buffer length: {len(ducked_buf)} samples")
                
                add_mix = input("Add ducked synth track to the Mixer Bus? (y/n): ").strip().lower()
                if add_mix == 'y':
                    self.mixer.add_track_buffer("Ducked Synth", ducked_buf, volume=0.9)
                    print("[+] Ducked track added to Mixer Bus!")

            elif choice == "9":
                print("[*] Applying 3-Band Parametric EQ Shaping...")
                test_buf = self.render_active_note(60, 2.0)
                low_g = self._ask_float("Enter Low Gain in dB (default 0.0): ", 0.0)
                mid_g = self._ask_float("Enter Mid Gain in dB (default 0.0): ", 0.0)
                high_g = self._ask_float("Enter High Gain in dB (default 0.0): ", 0.0)
                
                eq = ParametricEQ(low_gain_db=low_g, mid_gain_db=mid_g, high_gain_db=high_g, sample_rate=self.sample_rate)
                eq_buf = eq.process(test_buf)
                print(f"[+] EQ shaping applied successfully! Buffer length: {len(eq_buf)} samples")
                
                add_mix = input("Add EQ-shaped track to the Mixer Bus? (y/n): ").strip().lower()
                if add_mix == 'y':
                    self.mixer.add_track_buffer("EQ Synth", eq_buf, volume=0.9)
                    print("[+] EQ track added to Mixer Bus!")

            elif choice == "10":
                print("[*] Applying Stereo Chorus & Modulation Width...")
                test_buf = self.render_active_note(60, 2.0)
                rate = self._ask_float("Enter LFO Rate in Hz (default 1.2): ", 1.2)
                depth = self._ask_float("Enter Depth in ms (default 5.0): ", 5.0)
                mix_val = self._ask_float("Enter Dry/Wet Mix (default 0.4): ", 0.4)
                
                chorus = ChorusEffect(rate_hz=rate, depth_ms=depth, mix=mix_val, sample_rate=self.sample_rate)
                chorus_buf = chorus.process(test_buf)
                print(f"[+] Chorus modulation applied successfully! Buffer length: {len(chorus_buf)} samples")
                
                add_mix = input("Add chorus track to the Mixer Bus? (y/n): ").strip().lower()
                if add_mix == 'y':
                    self.mixer.add_track_buffer("Chorus Synth", chorus_buf, volume=0.9)
                    print("[+] Chorus track added to Mixer Bus!")

            elif choice == "11":
                print("[*] Applying Lo-Fi Bitcrusher & Sample-Rate Decimation...")
                test_buf = self.render_active_note(60, 2.0)
                bits = self._ask_int("Enter Bit Depth (1-16, default 8): ", 8)
                ds_factor = self._ask_int("Enter Downsample Factor (1-8, default 2): ", 2)
                mix_val = self._ask_float("Enter Dry/Wet Mix (default 0.5): ", 0.5)
                
                crusher = Bitcrusher(bit_depth=bits, downsample_factor=ds_factor, mix=mix_val, sample_rate=self.sample_rate)
                crushed_buf = crusher.process(test_buf)
                print(f"[+] Bitcrusher applied! Buffer length: {len(crushed_buf)} samples")
                
                add_mix = input("Add bitcrushed track to the Mixer Bus? (y/n): ").strip().lower()
                if add_mix == 'y':
                    self.mixer.add_track_buffer("LoFi Synth", crushed_buf, volume=0.9)
                    print("[+] Bitcrushed track added to Mixer Bus!")

            elif choice == "12":
                print("[*] Applying Dynamic Parameter Automation Ramp...")
                test_buf = self.render_active_note(60, 2.0)
                start_g = self._ask_float("Enter Start Gain (default 0.0): ", 0.0)
                end_g = self._ask_float("Enter End Gain (default 1.0): ", 1.0)
                curve = input("Enter Curve Type (linear/exponential): ").strip() or "linear"
                
                automated_buf = ParameterAutomation.apply_gain_ramp(test_buf, start_gain=start_g, end_gain=end_g, curve_type=curve)
                print(f"[+] Automation ramp applied! Buffer length: {len(automated_buf)} samples")
                
                add_mix = input("Add automated track to the Mixer Bus? (y/n): ").strip().lower()
                if add_mix == 'y':
                    self.mixer.add_track_buffer("Automated Track", automated_buf, volume=0.9)
                    print("[+] Automated track added to Mixer Bus!")

            elif choice == "13":
                print("\n--- SYNTH PATCH & PRESET LOADER ---")
                print("1. Factory Presets")
                print("2. User Presets on Disk (.json)")
                sub_choice = input("Select source [1-2]: ").strip()
                
                if sub_choice == "1":
                    print("\nAvailable Factory Presets:")
                    preset_names = list(self.factory_presets.keys())
                    for idx, name in enumerate(preset_names, 1):
                        print(f"  {idx}. {name}")
                    
                    p_idx = self._ask_int(f"Select preset [1-{len(preset_names)}]: ", 1) - 1
                    if 0 <= p_idx < len(preset_names):
                        selected_name = preset_names[p_idx]
                        # Copy, never alias: editing the active patch must not
                        # rewrite the shared factory catalog.
                        self.active_patch = dict(self.factory_presets[selected_name])
                        self.active_patch["name"] = selected_name
                        print(f"[+] Loaded Factory Patch: '{selected_name}'")
                        
                elif sub_choice == "2":
                    disk_files = self.preset_mgr.list_presets(category_filter="synth")
                    if not disk_files:
                        print("[-] No saved synth presets found in presets/ directory.")
                    else:
                        print("\nAvailable Preset Files:")
                        for idx, fpath in enumerate(disk_files, 1):
                            print(f"  {idx}. {fpath}")
                        
                        f_idx = self._ask_int(f"Select file [1-{len(disk_files)}]: ", 1) - 1
                        if 0 <= f_idx < len(disk_files):
                            loaded_params = self.preset_mgr.load_preset(disk_files[f_idx])
                            if loaded_params:
                                self.active_patch = loaded_params
                                self.active_patch["name"] = os.path.basename(disk_files[f_idx])
                                print(f"[+] Successfully loaded patch from disk: {disk_files[f_idx]}")

            elif choice == "14":
                print("\n--- SAVE CURRENT PATCH TO DISK ---")
                # "Save current patch settings" — start from the active patch so
                # parameters this editor does not prompt for (ADSR, LFO rate,
                # drive, bit depth) survive the save, and every prompt defaults
                # to the current value instead of a hardcoded one.
                current = self.active_patch
                preset_name = input("Enter Patch Name (e.g., Deep Tech Bass): ").strip() or current.get("name", "Custom Patch")
                
                patch_data = dict(current)
                patch_data["name"] = preset_name
                patch_data["wave_type"] = input(f"Enter Waveform (saw/sine/square/triangle) [default: {current.get('wave_type', 'saw')}]: ").strip() or current.get("wave_type", "saw")
                patch_data["cutoff_hz"] = self._ask_float(f"Enter Filter Cutoff Hz [default: {current.get('cutoff_hz', 2000)}]: ", float(current.get("cutoff_hz", 2000)))
                patch_data["resonance_q"] = self._ask_float(f"Enter Filter Q Resonance [default: {current.get('resonance_q', 4.0)}]: ", float(current.get("resonance_q", 4.0)))
                lfo_default = "y" if current.get("use_lfo", True) else "n"
                lfo_raw = input(f"Enable LFO modulation? (y/n) [default: {lfo_default}]: ").strip().lower() or lfo_default
                patch_data["use_lfo"] = lfo_raw != "n"
                
                success = self.preset_mgr.save_preset(preset_name, "synth", patch_data)
                if success:
                    self.active_patch = patch_data
                    print(f"[+] Current active patch set to '{preset_name}'!")

            elif choice == "15":
                if not self.mixer.tracks:
                    print("[-] No tracks currently in the Mixer Bus! Run option 5 or add tracks first.")
                else:
                    print("[*] Exporting individual mixer tracks as WAV stems...")
                    prefix = input("Enter stem filename prefix (default: smuve_stem): ").strip() or "smuve_stem"
                    stem_buffers = {track["name"]: track["buffer"] for track in self.mixer.tracks}
                    StemExporter.export_stems(stem_buffers, output_prefix=prefix, sample_rate=self.sample_rate)

            elif choice == "16":
                filepath = input("Enter path to WAV file (leave blank to generate test sample): ").strip()
                if not filepath:
                    filepath = "smuve_test_loop.wav"
                    dummy_data = (np.sin(2.0 * np.pi * 523.25 * np.linspace(0, 1.0, 44100)) * 32767).astype(np.int16)
                    try:
                        # Open the file ourselves (as AudioExporter does) so an
                        # unusable path cannot leave a half-built Wave_write for
                        # its destructor to complain about.
                        with open(filepath, 'wb') as raw_file:
                            with wave.open(raw_file, 'w') as wf:
                                wf.setnchannels(1)
                                wf.setsampwidth(2)
                                wf.setframerate(44100)
                                wf.writeframes(dummy_data.tobytes())
                        print(f"[*] Created test WAV sample '{filepath}'.")
                    except OSError as err:
                        print(f"[-] Could not create the test sample: {err}")

                loaded_audio = self.sampler.load_wav_sample(filepath)
                if len(loaded_audio) > 0:
                    add_mix = input("Add this loaded sample as a track in the Mixer Bus? (y/n): ").strip().lower()
                    if add_mix == 'y':
                        self.mixer.add_track_buffer("External Sample", loaded_audio, volume=0.9)
                        print("[+] Sample successfully added to Mixer tracks!")
                
            elif choice == "17":
                print("\n--- PROJECT SESSION (.smuve) ---")
                print("1. Save Session")
                print("2. Load Session")
                session_choice = input("Select action [1-2]: ").strip()
                session_file = "smuve_master_session.smuve"
                
                if session_choice == "2":
                    session_data = ProjectManager.load_project(session_file)
                    if session_data:
                        if session_data.get("bpm"):
                            self.transport.bpm = float(session_data["bpm"])
                            self.arranger.bpm = self.transport.bpm
                        if session_data.get("sequencer_pattern"):
                            self.step_pattern.pattern_name = session_data["sequencer_pattern"]
                        if session_data.get("active_patch"):
                            self.active_patch = dict(session_data["active_patch"])
                        print(f"[+] Session loaded from '{session_file}' (BPM {self.transport.bpm}).")
                else:
                    session_data = {
                        "project_name": "S.M.U.V.E- Master Pro Session v2.8", 
                        "bpm": self.transport.bpm,
                        "sequencer_pattern": self.step_pattern.pattern_name,
                        "active_patch": self.active_patch
                    }
                    success = ProjectManager.save_project(session_data, session_file)
                    print(f"[+] Session saved to '{session_file}': {success}")
                
            elif choice == "18":
                print("Exiting S.M.U.V.E- Studio. Keep making beats!")
                break
            else:
                print("[-] Invalid selection. Please choose between 1 and 18.")

if __name__ == "__main__":
    studio = SmuveInteractiveStudio()
    studio.interactive_menu()
	
