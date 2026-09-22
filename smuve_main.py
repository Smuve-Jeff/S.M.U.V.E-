"""
S.M.U.V.E- Master Application Orchestrator & Interactive CLI Workstation
Author: Smuve-Jeff Architectural Architecture
Description: Unifies studio workspace, synth engine, step sequencer, song arranger, 
             transport clock, spatial FX, multi-track mixer, master dynamics compressor, 
             audio sampler, chord generator/arpeggiator, stem exporter, 
             analog saturation, sidechain ducking, 3-band parametric EQ, 
             stereo chorus modulation, lo-fi bitcrusher, dynamic automation ramps, 
             and WAV master rendering into a complete professional mobile DAW (v2.7).
"""

import sys
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

    def interactive_menu(self):
        while True:
            print("\n==================================================")
            print("   S.M.U.V.E- PRO MOBILE DAW WORKSTATION (v2.7)")
            print("==================================================")
            print("1. Trigger Drum Pad & Process Spatial FX")
            print("2. Render Synth Lead Note (LFO Filter Sweep)")
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
            print("13. Export Multi-Track Mixer Stems (.wav)")
            print("14. Load External WAV Audio Sample / Loop")
            print("15. Save/Load Project Session (.smuve)")
            print("16. Exit Studio")
            
            choice = input("\nSelect an option [1-16]: ").strip()
            
            if choice == "1":
                pad_id = int(input("Enter Drum Pad ID (1: Kick, 2: Snare, 3: Hi-Hat): ") or "1")
                audio = self.drums.play_pad(pad_id)
                if audio is not None:
                    processed = self.delay.process(audio)
                    processed = self.reverb.process(processed)
                    print(f"[+] Triggered Pad {pad_id} | Processed FX Buffer: {len(processed)} samples")
                else:
                    print("[-] Invalid pad ID.")
                    
            elif choice == "2":
                note = int(input("Enter MIDI Note Number (default 60 = C4): ") or "60")
                dur = float(input("Enter Duration in Seconds (default 1.0): ") or "1.0")
                wave = input("Enter Waveform (saw/sine/square/triangle): ").strip() or "saw"
                
                buf = self.synth.render_note(midi_note=note, duration_secs=dur, wave_type=wave, use_lfo=True)
                print(f"[+] Rendered LFO-swept '{wave}' synth note at MIDI {note} ({len(buf)} samples)")
                
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
                lead_buffer = self.synth.render_note(60, 2.0, "saw", use_lfo=True)
                
                self.arranger.add_clip("Intro Kick", start_bar=0, length_bars=2, audio_buffer=intro_buffer)
                self.arranger.add_clip("Lead Melodic Drop", start_bar=4, length_bars=4, audio_buffer=lead_buffer)
                
                arranged_song = self.arranger.render_arrangement()
                print(f"[+] Arrangement rendered successfully! Total timeline length: {len(arranged_song)} samples ({len(arranged_song)/44100:.2f}s)")
                
            elif choice == "5":
                print("[*] Summing multi-track session through mixer bus & compressor...")
                track1 = self.drums.play_pad(1)  # Kick
                track2 = self.synth.render_note(midi_note=60, duration_secs=3.0, wave_type="saw", use_lfo=True)
                
                self.mixer.tracks.clear()
                self.mixer.add_track_buffer("Drums", track1, volume=1.0)
                self.mixer.add_track_buffer("Lead Synth", track2, volume=0.8)
                
                raw_mix = self.mixer.sum_mix(target_samples=int(self.sample_rate * 3.0))
                
                master_output = self.compressor.process(raw_mix)
                print(f"[+] Master mix compressed and summed successfully ({len(master_output)} samples).")
                
                filename = input("Enter output filename (default: smuve_master_compressed.wav): ").strip() or "smuve_master_compressed.wav"
                AudioExporter.export_to_wav(master_output, filename=filename, sample_rate=self.sample_rate)

            elif choice == "6":
                print("[*] Generating Chord Progression & Arpeggiator Sequence...")
                root_note = int(input("Enter Root MIDI Note (default 60 = C4): ") or "60")
                chord_type = input("Enter Chord Type (maj/min/maj7/min7/dom7/sus4): ").strip() or "min7"
                arp_pattern = input("Enter Arp Pattern (up/down/updown): ").strip() or "updown"
                
                chord_notes = ChordGenerator.get_chord_notes(root_note, chord_type)
                arp_notes = Arpeggiator.generate_arp_sequence(chord_notes, pattern=arp_pattern, num_steps=16)
                print(f"[+] Generated Chord: {chord_notes} -> Arp Sequence: {arp_notes}")
                
                step_dur = 0.15
                arp_buffer = np.zeros(0)
                for note in arp_notes:
                    note_buf = self.synth.render_note(midi_note=note, duration_secs=step_dur, wave_type="saw", use_lfo=True)
                    arp_buffer = np.concatenate([arp_buffer, note_buf])
                    
                print(f"[+] Rendered Arp buffer ({len(arp_buffer)} samples).")
                add_mix = input("Add this arpeggio sequence to the Mixer Bus tracks? (y/n): ").strip().lower()
                if add_mix == 'y':
                    self.mixer.add_track_buffer("Arp Synth", arp_buffer, volume=0.85)
                    print("[+] Arp track added to Mixer Bus!")

            elif choice == "7":
                print("[*] Applying Analog Saturation & Waveshaper Distortion...")
                test_buf = self.synth.render_note(60, 2.0, "saw", use_lfo=True)
                drive = float(input("Enter Saturation Drive (default 2.5): ") or "2.5")
                mix_val = float(input("Enter Dry/Wet Mix (0.0 to 1.0, default 0.4): ") or "0.4")
                
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
                synth_buf = self.synth.render_note(60, 2.0, "saw", use_lfo=True)
                
                thresh = float(input("Enter Threshold in dB (default -15.0): ") or "-15.0")
                ratio = float(input("Enter Ratio (default 6.0): ") or "6.0")
                
                sidechain = SidechainCompressor(threshold_db=thresh, ratio=ratio, sample_rate=self.sample_rate)
                ducked_buf = sidechain.process(synth_buf, kick_buf)
                print(f"[+] Sidechain ducking applied successfully! Buffer length: {len(ducked_buf)} samples")
                
                add_mix = input("Add ducked synth track to the Mixer Bus? (y/n): ").strip().lower()
                if add_mix == 'y':
                    self.mixer.add_track_buffer("Ducked Synth", ducked_buf, volume=0.9)
                    print("[+] Ducked track added to Mixer Bus!")

            elif choice == "9":
                print("[*] Applying 3-Band Parametric EQ Shaping...")
                test_buf = self.synth.render_note(60, 2.0, "saw", use_lfo=True)
                low_g = float(input("Enter Low Gain in dB (default 0.0): ") or "0.0")
                mid_g = float(input("Enter Mid Gain in dB (default 0.0): ") or "0.0")
                high_g = float(input("Enter High Gain in dB (default 0.0): ") or "0.0")
                
                eq = ParametricEQ(low_gain_db=low_g, mid_gain_db=mid_g, high_gain_db=high_g, sample_rate=self.sample_rate)
                eq_buf = eq.process(test_buf)
                print(f"[+] EQ shaping applied successfully! Buffer length: {len(eq_buf)} samples")
                
                add_mix = input("Add EQ-shaped track to the Mixer Bus? (y/n): ").strip().lower()
                if add_mix == 'y':
                    self.mixer.add_track_buffer("EQ Synth", eq_buf, volume=0.9)
                    print("[+] EQ track added to Mixer Bus!")

            elif choice == "10":
                print("[*] Applying Stereo Chorus & Modulation Width...")
                test_buf = self.synth.render_note(60, 2.0, "saw", use_lfo=True)
                rate = float(input("Enter LFO Rate in Hz (default 1.2): ") or "1.2")
                depth = float(input("Enter Depth in ms (default 5.0): ") or "5.0")
                mix_val = float(input("Enter Dry/Wet Mix (default 0.4): ") or "0.4")
                
                chorus = ChorusEffect(rate_hz=rate, depth_ms=depth, mix=mix_val, sample_rate=self.sample_rate)
                chorus_buf = chorus.process(test_buf)
                print(f"[+] Chorus modulation applied successfully! Buffer length: {len(chorus_buf)} samples")
                
                add_mix = input("Add chorus track to the Mixer Bus? (y/n): ").strip().lower()
                if add_mix == 'y':
                    self.mixer.add_track_buffer("Chorus Synth", chorus_buf, volume=0.9)
                    print("[+] Chorus track added to Mixer Bus!")

            elif choice == "11":
                print("[*] Applying Lo-Fi Bitcrusher & Sample-Rate Decimation...")
                test_buf = self.synth.render_note(60, 2.0, "saw", use_lfo=True)
                bits = int(input("Enter Bit Depth (1-16, default 8): ") or "8")
                ds_factor = int(input("Enter Downsample Factor (1-8, default 2): ") or "2")
                mix_val = float(input("Enter Dry/Wet Mix (default 0.5): ") or "0.5")
                
                crusher = Bitcrusher(bit_depth=bits, downsample_factor=ds_factor, mix=mix_val, sample_rate=self.sample_rate)
                crushed_buf = crusher.process(test_buf)
                print(f"[+] Bitcrusher applied! Buffer length: {len(crushed_buf)} samples")
                
                add_mix = input("Add bitcrushed track to the Mixer Bus? (y/n): ").strip().lower()
                if add_mix == 'y':
                    self.mixer.add_track_buffer("LoFi Synth", crushed_buf, volume=0.9)
                    print("[+] Bitcrushed track added to Mixer Bus!")

            elif choice == "12":
                print("[*] Applying Dynamic Parameter Automation Ramp...")
                test_buf = self.synth.render_note(60, 2.0, "saw", use_lfo=True)
                start_g = float(input("Enter Start Gain (default 0.0): ") or "0.0")
                end_g = float(input("Enter End Gain (default 1.0): ") or "1.0")
                curve = input("Enter Curve Type (linear/exponential): ").strip() or "linear"
                
                automated_buf = ParameterAutomation.apply_gain_ramp(test_buf, start_gain=start_g, end_gain=end_g, curve_type=curve)
                print(f"[+] Automation ramp applied! Buffer length: {len(automated_buf)} samples")
                
                add_mix = input("Add automated track to the Mixer Bus? (y/n): ").strip().lower()
                if add_mix == 'y':
                    self.mixer.add_track_buffer("Automated Track", automated_buf, volume=0.9)
                    print("[+] Automated track added to Mixer Bus!")

            elif choice == "13":
                if not self.mixer.tracks:
                    print("[-] No tracks currently in the Mixer Bus! Run option 5 or add tracks first.")
                else:
                    print("[*] Exporting individual mixer tracks as WAV stems...")
                    prefix = input("Enter stem filename prefix (default: smuve_stem): ").strip() or "smuve_stem"
                    StemExporter.export_stems(self.mixer.tracks, output_prefix=prefix, sample_rate=self.sample_rate)

            elif choice == "14":
                filepath = input("Enter path to WAV file (leave blank to generate test sample): ").strip()
                if not filepath:
                    filepath = "smuve_test_loop.wav"
                    dummy_data = (np.sin(2.0 * np.pi * 523.25 * np.linspace(0, 1.0, 44100)) * 32767).astype(np.int16)
                    with wave.open(filepath, 'w') as wf:
                        wf.setnchannels(1)
                        wf.setsampwidth(2)
                        wf.setframerate(44100)
                        wf.writeframes(dummy_data.tobytes())
                    print(f"[*] Created test WAV sample '{filepath}'.")

                loaded_audio = self.sampler.load_wav_sample(filepath)
                if len(loaded_audio) > 0:
                    add_mix = input("Add this loaded sample as a track in the Mixer Bus? (y/n): ").strip().lower()
                    if add_mix == 'y':
                        self.mixer.add_track_buffer("External Sample", loaded_audio, volume=0.9)
                        print("[+] Sample successfully added to Mixer tracks!")
                
            elif choice == "15":
                session_data = {
                    "project_name": "S.M.U.V.E- Master Pro Session v2.7", 
                    "bpm": self.transport.bpm,
                    "sequencer_pattern": self.step_pattern.pattern_name
                }
                success = ProjectManager.save_project(session_data, "smuve_master_session.smuve")
                print(f"[+] Session saved to 'smuve_master_session.smuve': {success}")
                
            elif choice == "16":
                print("Exiting S.M.U.V.E- Studio. Keep making beats!")
                break
            else:
                print("[-] Invalid selection. Please choose between 1 and 16.")

if __name__ == "__main__":
    studio = SmuveInteractiveStudio()
    studio.interactive_menu()

