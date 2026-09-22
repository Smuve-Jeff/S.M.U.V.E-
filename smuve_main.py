"""
S.M.U.V.E- Master Application Orchestrator & CLI Workstation
Author: Smuve-Jeff Architectural Architecture
Description: Unifies the studio workspace, synth engine, step sequencer, 
             transport clock, and audio effects rack into a single executable workstation.
"""

import sys
import numpy as np

# Import S.M.U.V.E- Submodules
from smuve_studio_engine import SmuveStudioWorkspace, TrackType, Compressor
from smuve_synth_engine import SynthesizerVoice, DrumMachineRack
from smuve_sequencer import StepPattern, ProjectManager
from smuve_fx_transport import MasterTransport, DelayEffect, SimpleReverb

class SmuveMobileWorkstation:
    def __init__(self, project_name: str = "Untitled Session", bpm: float = 120.0):
        print(f"=== Initializing S.M.U.V.E- Pro Mobile Studio: '{project_name}' ===")
        self.project_name = project_name
        self.workspace = SmuveStudioWorkspace(bpm=bpm)
        self.transport = MasterTransport(bpm=bpm, loop_enabled=True, loop_end_beat=16.0)
        self.synth = SynthesizerVoice(sample_rate=self.workspace.sample_rate)
        self.drums = DrumMachineRack(sample_rate=self.workspace.sample_rate)
        self.delay_fx = DelayEffect(delay_time_secs=0.375, mix=0.3, sample_rate=self.workspace.sample_rate)
        self.reverb_fx = SimpleReverb(room_size=0.8, mix=0.2, sample_rate=self.workspace.sample_rate)
        self.step_pattern = StepPattern(pattern_name="Beat 1", num_steps=16)

    def setup_default_session(self):
        """Sets up default professional track routing and pattern loops."""
        print("[*] Configuring default mixer channels and tracks...")
        self.workspace.add_track("Lead Synth", TrackType.INSTRUMENT)
        self.workspace.add_track("808 Drums", TrackType.GROUP_BUS)
        
        # Add active steps to drum pattern (Four-on-the-floor kick)
        for step in [0, 4, 8, 12]:
            self.step_pattern.toggle_step(step, velocity=127)
        print("[+] Tracks and 16-step drum pattern initialized.")

    def run_workstation_simulation(self):
        """Simulates playback, synthesis, sequencing, and effect chain processing."""
        print("\n--- Starting Workstation Audio Simulation ---")
        self.transport.play()
        print(f"Transport State: {self.transport.state.upper()} | BPM: {self.transport.bpm}")
        
        # 1. Generate synth lead note preview
        synth_buffer = self.synth.render_note(midi_note=62, duration_secs=0.5, wave_type="saw")
        
        # 2. Trigger drum pad sample
        kick_buffer = self.drums.play_pad(1)
        
        # 3. Pass drum audio through Delay & Reverb FX chain
        processed_drums = self.delay_fx.process(kick_buffer)
        processed_drums = self.reverb_fx.process(processed_drums)
        
        print(f"-> Synth Note Generated: {synth_buffer.shape[0]} samples")
        print(f"-> Drum Kick Processed through FX Rack (Delay + Reverb): Max Amp = {np.max(np.abs(processed_drums)):.3f}")
        
        # 4. Save Project Session
        session_state = {
            "project_name": self.project_name,
            "bpm": self.transport.bpm,
            "sample_rate": self.workspace.sample_rate,
            "active_pattern_steps": [i for i, s in enumerate(self.step_pattern.steps) if s.active]
        }
        
        filename = "smuve_live_session.smuve"
        success = ProjectManager.save_project(session_state, filename)
        print(f"-> Project Session Saved to disk ('{filename}'): {success}")
        print("--- Simulation Completed Successfully ---")

if __name__ == "__main__":
    workstation = SmuveMobileWorkstation(project_name="Termux Studio Alpha", bpm=128.0)
    workstation.setup_default_session()
    workstation.run_workstation_simulation()

