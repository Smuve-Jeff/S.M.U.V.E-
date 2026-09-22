"""
S.M.U.V.E- Master Application Orchestrator & Interactive CLI Workstation
Author: Smuve-Jeff Architectural Architecture
Description: Unifies studio workspace, synth engine, step sequencer, song arranger, 
             transport clock, spatial FX, multi-track mixer, master dynamics compressor, 
             audio sampler, chord generator/arpeggiator, stem exporter, 
             and WAV master rendering into a complete professional mobile DAW.
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
            print("   S.M.U.V.E- PRO MOBILE DAW WORKSTATION (v2.4)")
            print("==================================================")
            print("1. Trigger Drum Pad & Process Spatial FX")
            print("2. Render Synth Lead Note (LFO Filter Sweep)")
            print("3. Run 16-Step Grid Sequencer Pattern")
            print("4. Build Multi-Bar Song Arrangement")
            print("5. Run Multi-Track Mix, Master Compression & Export WAV")
            print("6. Generate Chord & Arpeggiated Synth Sequence")
            print("7. Export Multi-Track Mixer Stems (.wav)")
            print("8. Load External WAV Audio Sample / Loop")
            print("9. Save/Load Project Session (.smuve)")
            print("10. Exit Studio")
            
            choice = input("\nSelect an option [1-10]: ").strip()
            
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
                
                # Apply Master Compressor for studio glue & loudness
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
                if not self.mixer.tracks:
                    print("[-] No tracks currently in the Mixer Bus! Run option 5 or add tracks first.")
                else:
                    print("[*] Exporting individual mixer tracks as WAV stems...")
                    prefix = input("Enter stem filename prefix (default: smuve_stem): ").strip() or "smuve_stem"
                    StemExporter.export_stems(self.mixer.tracks, output_prefix=prefix, sample_rate=self.sample_rate)

            elif choice == "8":
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
                
            elif choice == "9":
                session_data = {
                    "project_name": "S.M.U.V.E- Master Pro Session", 
                    "bpm": self.transport.bpm,
                    "sequencer_pattern": self.step_pattern.pattern_name
                }
                success = ProjectManager.save_project(session_data, "smuve_master_session.smuve")
                print(f"[+] Session saved to 'smuve_master_session.smuve': {success}")
                
            elif choice == "10":
                print("Exiting S.M.U.V.E- Studio. Keep making beats!")
                break
            else:
                print("[-] Invalid selection. Please choose between 1 and 10.")

if __name__ == "__main__":
    studio = SmuveInteractiveStudio()
    studio.interactive_menu()

