"""
S.M.U.V.E- Dedicated Synth Patch & Effect Preset Management Engine
Author: Smuve-Jeff Architectural Architecture
Description: Manages serialization, disk persistence, loading, and factory templates 
             for synthesizer instrument patches and effect processor chains.
"""

import json
import os
from typing import Dict, Any, List

class PresetManager:
    PRESET_DIR = "presets"

    def __init__(self, preset_dir: str = PRESET_DIR):
        self.preset_dir = preset_dir
        os.makedirs(self.preset_dir, exist_ok=True)

    def save_preset(self, preset_name: str, category: str, patch_data: Dict[str, Any]) -> bool:
        """Saves a patch or effect configuration as a JSON file in the presets directory."""
        try:
            safe_filename = "".join(c if c.isalnum() or c in ("_", "-") else "_" for c in preset_name).lower()
            filepath = os.path.join(self.preset_dir, f"{category}_{safe_filename}.json")

            payload = {
                "preset_name": preset_name,
                "category": category, # 'synth', 'fx', or 'master'
                "parameters": patch_data
            }

            with open(filepath, 'w') as f:
                json.dump(payload, f, indent=4)

            print(f"[+] Preset saved successfully: {filepath}")
            return True
        except Exception as e:
            print(f"[-] Error saving preset '{preset_name}': {e}")
            return False

    def load_preset(self, filepath: str) -> Dict[str, Any]:
        """Loads a patch JSON file from disk."""
        try:
            if not os.path.exists(filepath):
                print(f"[-] Preset file not found: {filepath}")
                return {}

            with open(filepath, 'r') as f:
                data = json.load(f)

            print(f"[+] Loaded preset: '{data.get('preset_name')}' ({data.get('category')})")
            return data.get("parameters", {})
        except Exception as e:
            print(f"[-] Error loading preset from '{filepath}': {e}")
            return {}

    def list_presets(self, category_filter: str = "") -> List[str]:
        """Lists all saved presets, optionally filtered by category (synth/fx)."""
        if not os.path.exists(self.preset_dir):
            return []

        files = os.listdir(self.preset_dir)
        matching = []
        for f in files:
            if f.endswith(".json"):
                if not category_filter or f.startswith(f"{category_filter}_"):
                    matching.append(os.path.join(self.preset_dir, f))
        return sorted(matching)

    @staticmethod
    def get_factory_presets() -> Dict[str, Dict[str, Any]]:
        """Provides built-in factory patches for immediate synth sound design."""
        return {
            "Warm Saw Lead": {
                "wave_type": "saw",
                "cutoff_hz": 2500,
                "resonance_q": 4.5,
                "attack_sec": 0.02,
                "decay_sec": 0.3,
                "sustain_level": 0.7,
                "release_sec": 0.4,
                "use_lfo": True,
                "lfo_rate_hz": 2.5
            },
            "Lo-Fi Acid Bass": {
                "wave_type": "square",
                "cutoff_hz": 800,
                "resonance_q": 8.0,
                "attack_sec": 0.005,
                "decay_sec": 0.15,
                "sustain_level": 0.2,
                "release_sec": 0.1,
                "use_lfo": False,
                "drive": 3.5,
                "bit_depth": 6
            },
            "Lush Ambient Pad": {
                "wave_type": "triangle",
                "cutoff_hz": 1200,
                "resonance_q": 2.0,
                "attack_sec": 0.8,
                "decay_sec": 1.2,
                "sustain_level": 0.85,
                "release_sec": 1.5,
                "use_lfo": True,
                "lfo_rate_hz": 0.5,
                "reverb_mix": 0.5,
                "chorus_mix": 0.4
            }
        }


# ==========================================
# VERIFICATION TEST
# ==========================================
if __name__ == "__main__":
    print("--- Testing S.M.U.V.E- Preset Management Engine ---")
    pm = PresetManager()

    # 1. Test saving a factory preset to disk
    factory = PresetManager.get_factory_presets()
    acid_patch = factory["Lo-Fi Acid Bass"]
    pm.save_preset("Lo-Fi Acid Bass", "synth", acid_patch)

    # 2. Test listing presets
    available = pm.list_presets(category_filter="synth")
    print(f"[+] Found {len(available)} synth presets on disk: {available}")

    # 3. Test loading preset back
    if available:
        loaded_params = pm.load_preset(available[0])
        print(f"[+] Successfully loaded parameters: {loaded_params}")

    print("--- Preset Management Engine Ready ---")

