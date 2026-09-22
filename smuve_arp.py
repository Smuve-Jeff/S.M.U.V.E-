"""
S.M.U.V.E- Polyphonic Chord Generator & Arpeggiator Engine
Author: Smuve-Jeff Architectural Architecture
Description: Generates professional chord progressions and rhythmic arpeggiated 
             note sequences from root notes to feed the synthesizer engine.
"""

import numpy as np
from typing import List

class ChordGenerator:
    CHORD_INTERVALS = {
        "maj": [0, 4, 7],
        "min": [0, 3, 7],
        "maj7": [0, 4, 7, 11],
        "min7": [0, 3, 7, 10],
        "dom7": [0, 4, 7, 10],
        "sus4": [0, 5, 7]
    }

    @staticmethod
    def get_chord_notes(root_midi: int, chord_type: str = "maj") -> List[int]:
        """Generates a list of MIDI notes for a given root note and chord quality."""
        intervals = ChordGenerator.CHORD_INTERVALS.get(chord_type.lower(), [0, 4, 7])
        return [root_midi + interval for interval in intervals]


class Arpeggiator:
    @staticmethod
    def generate_arp_sequence(chord_notes: List[int], pattern: str = "up", num_steps: int = 16) -> List[int]:
        """Generates an arpeggiated MIDI note sequence based on chord notes and pattern type."""
        if not chord_notes:
            return []
            
        sorted_notes = sorted(chord_notes)
        pattern = pattern.lower()
        
        if pattern == "down":
            base_sequence = sorted_notes[::-1]
        elif pattern == "updown":
            if len(sorted_notes) > 2:
                base_sequence = sorted_notes + sorted_notes[-2:0:-1]
            else:
                base_sequence = sorted_notes + sorted_notes[::-1]
        else:  # Default to 'up'
            base_sequence = sorted_notes
            
        # Loop pattern across specified steps
        arp_notes = []
        for i in range(num_steps):
            note = base_sequence[i % len(base_sequence)]
            arp_notes.append(note)
            
        return arp_notes


# ==========================================
# VERIFICATION TEST
# ==========================================
if __name__ == "__main__":
    print("--- Testing S.M.U.V.E- Chord & Arpeggiator Engine ---")
    root = 60  # C4
    chord = ChordGenerator.get_chord_notes(root, "min7")
    print(f"[+] C Minor 7 Chord Notes: {chord}")
    
    arp = Arpeggiator.generate_arp_sequence(chord, pattern="updown", num_steps=8)
    print(f"[+] 8-Step Up/Down Arpeggiator Sequence: {arp}")
    print("--- Arpeggiator Engine Ready for Integration ---")

