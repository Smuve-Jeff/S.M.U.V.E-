"""
S.M.U.V.E- Step Sequencer & Project Persistence Manager
Author: Smuve-Jeff Architectural Architecture
Description: 16/32-step grid pattern sequencer and full JSON project serialization 
             for saving, loading, and archiving mobile music production sessions.
"""

import json
import os
import numpy as np
from dataclasses import dataclass, field
from typing import List, Dict, Any, Optional

# ==========================================
# 1. STEP SEQUENCER PATTERN MATRIX
# ==========================================

@dataclass
class Step:
    active: bool = False
    velocity: int = 100  # 1 to 127
    pitch_offset: int = 0  # Semitone offset from track root

@dataclass
class StepPattern:
    pattern_name: str = "Pattern 1"
    num_steps: int = 16  # 16-step or 32-step grid
    steps: List[Step] = field(default_factory=list)

    def __post_init__(self):
        # Keep the grid in lockstep with num_steps: a caller passing a partial
        # list (or editing num_steps later) would otherwise make toggle_step
        # raise IndexError for indexes the UI still offers.
        if len(self.steps) < self.num_steps:
            self.steps.extend(Step() for _ in range(self.num_steps - len(self.steps)))
        elif len(self.steps) > self.num_steps:
            del self.steps[self.num_steps:]

    def toggle_step(self, step_index: int, velocity: int = 100):
        if 0 <= step_index < self.num_steps:
            self.steps[step_index].active = not self.steps[step_index].active
            self.steps[step_index].velocity = velocity


# ==========================================
# 2. PROJECT SERIALIZATION & PERSISTENCE
# ==========================================

class ProjectManager:
    """Handles saving and loading full S.M.U.V.E- studio projects to/from disk."""
    
    @staticmethod
    def save_project(project_data: Dict[str, Any], filename: str = "project.smuve") -> bool:
        try:
            with open(filename, "w") as f:
                json.dump(project_data, f, indent=4)
            return True
        except Exception as e:
            print(f"Error saving project: {e}")
            return False

    @staticmethod
    def load_project(filename: str = "project.smuve") -> Optional[Dict[str, Any]]:
        if not os.path.exists(filename):
            print(f"Project file {filename} not found.")
            return None
        try:
            with open(filename, "r") as f:
                return json.load(f)
        except Exception as e:
            print(f"Error loading project: {e}")
            return None


# ==========================================
# 3. VERIFICATION & TEST RUN
# ==========================================
if __name__ == "__main__":
    print("--- Initializing S.M.U.V.E- Sequencer & Persistence Module ---")
    
    # Create a 16-step drum pattern (e.g. 4-on-the-floor kick pattern)
    kick_pattern = StepPattern(pattern_name="Main Kick Beat", num_steps=16)
    beat_steps = [0, 4, 8, 12]  # Beats 1, 2, 3, 4 in 16th notes
    for step_idx in beat_steps:
        kick_pattern.toggle_step(step_idx, velocity=120)
        
    # Simulate a full studio project dictionary state
    session_data = {
        "project_name": "Midnight Trap Anthem",
        "bpm": 140.0,
        "sample_rate": 44100,
        "tracks": [
            {
                "name": "808 Kick",
                "type": "instrument",
                "volume": 0.95,
                "pan": 0.0,
                "pattern": {
                    "name": kick_pattern.pattern_name,
                    "num_steps": kick_pattern.num_steps,
                    "active_steps": [i for i, s in enumerate(kick_pattern.steps) if s.active]
                }
            }
        ]
    }
    
    # Test Project Saving
    project_file = "test_anthem.smuve"
    success = ProjectManager.save_project(session_data, project_file)
    print(f"Project Saved to '{project_file}': {success}")
    
    # Test Project Loading
    loaded_data = ProjectManager.load_project(project_file)
    if loaded_data:
        print(f"Loaded Project Title: '{loaded_data['project_name']}' at {loaded_data['bpm']} BPM")
        print(f"Track 1 Active Steps: {loaded_data['tracks'][0]['pattern']['active_steps']}")
        
    print("--- Step Sequencer & Persistence Operational ---")
