"""
S.M.U.V.E- Master Application Orchestrator & Interactive CLI Workstation
Author: Smuve-Jeff Architectural Architecture
Description: Unifies studio workspace, synth engine, step sequencer, 
             transport clock, spatial audio FX, multi-track mixer summing, 
             and WAV export into a complete interactive mobile DAW.
"""

import sys
import numpy as np

# Import all S.M.U.V.E- Submodules
from smuve_studio_engine import SmuveStudioWorkspace, TrackType
from smuve_synth_engine import SynthesizerVoice, DrumMachineRack
from smuve_sequencer import StepPattern, ProjectManager
from smuve_fx_transport import MasterTransport, DelayEffect, SimpleReverb
from smuve_mixer_bus import MixerBus
from smuve_export import AudioExporter

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

    def interactive_menu(self):
        while True:
            print("\n==================================================")
            print("   S.M.U.V.E- PRO MOBILE DAW WORKSTATION (v2.1)")
            print("==================================================")
            print("1. Trigger Drum Pad & Process Spatial FX")
            print("2. Render Synth Lead Note")
            print("3. Run 16-Step Grid Sequencer Pattern")
            print("4. Execute Multi-Track Summing Mix & Export WAV")
            print("5. Save/Load Project Session (.smuve)")
            print("6. Exit Studio")
            
            choice = input("\nSelect an option [1-6]: ").strip()
            
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
                
                buf = self.synth.render_note(midi_note=note, duration_secs=dur, wave_type=wave)
                print(f"[+] Rendered '{wave}' synth note at MIDI {note} ({len(buf)} samples)")
                
            elif choice == "3":
                print("[*] Configuring 16-Step Sequencer Pattern...")
                for step in [0, 4, 8, 12]:
                    self.step_pattern.toggle_step(step, velocity=127)
                active_steps = [i for i, s in enumerate(self.step_pattern.steps) if s.active]
                print(f"[+] Active Step Indices in Pattern '{self.step_pattern.pattern_name}': {active_steps}")
                
            elif choice == "4":
                print("[*] Summing multi-track session through mixer bus...")
                track1 = self.drums.play_pad(1)  # Kick
                track2 = self.synth.render_note(midi_note=60, duration_secs=2.0, wave_type="saw")
                
                self.mixer.tracks.clear()
                self.mixer.add_track_buffer("Drums", track1, volume=1.0)
                self.mixer.add_track_buffer("Lead Synth", track2, volume=0.8)
                
                master_output = self.mixer.sum_mix(target_samples=int(self.sample_rate * 3.0))
                print(f"[+] Master mix successfully summed ({len(master_output)} samples).")
                
                filename = input("Enter output filename (default: smuve_master.wav): ").strip() or "smuve_master.wav"
                AudioExporter.export_to_wav(master_output, filename=filename, sample_rate=self.sample_rate)
                
            elif choice == "5":
                session_data = {
                    "project_name": "S.M.U.V.E- Master Session", 
                    "bpm": self.transport.bpm,
                    "sequencer_pattern": self.step_pattern.pattern_name
                }
                success = ProjectManager.save_project(session_data, "smuve_master_session.smuve")
                print(f"[+] Session saved to 'smuve_master_session.smuve': {success}")
                
            elif choice == "6":
                print("Exiting S.M.U.V.E- Studio. Keep making beats!")
                break
            else:
                print("[-] Invalid selection. Please choose between 1 and 6.")

if __name__ == "__main__":
    studio = SmuveInteractiveStudio()
    studio.interactive_menu()

