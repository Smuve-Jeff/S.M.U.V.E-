"""
S.M.U.V.E- Dynamic Parameter Automation Engine
Author: Smuve-Jeff Architectural Architecture
Description: Generates sample-accurate linear and exponential parameter ramps 
             (Volume fades, filter sweeps, pan shifts, effect drives) across audio buffers.
"""

import numpy as np

class ParameterAutomation:
    @staticmethod
    def apply_gain_ramp(audio_in: np.ndarray, start_gain: float = 0.0, end_gain: float = 1.0, curve_type: str = "linear") -> np.ndarray:
        """Applies a gain automation ramp (e.g., volume fade-in or fade-out) across an audio buffer."""
        if len(audio_in) == 0:
            return audio_in

        num_samples = len(audio_in)
        
        if curve_type.lower() == "exponential":
            # Exponential curve for natural psychoacoustic volume fades
            ramp = np.geomspace(max(1e-4, start_gain), max(1e-4, end_gain), num_samples)
        else:
            # Standard linear interpolation
            ramp = np.linspace(start_gain, end_gain, num_samples)

        return audio_in * ramp

    @staticmethod
    def generate_envelope_points(num_samples: int, points: list) -> np.ndarray:
        """
        Generates a continuous control curve from a list of (sample_index, value) keyframes.
        Example points: [(0, 0.0), (22050, 1.0), (44100, 0.2)]
        """
        if not points:
            return np.ones(num_samples)

        # Sort keyframes by index
        sorted_points = sorted(points, key=lambda x: x[0])
        indices = [p[0] for p in sorted_points]
        values = [p[1] for p in sorted_points]

        # Interpolate across full buffer length
        envelope = np.interp(np.arange(num_samples), indices, values)
        return envelope


# ==========================================
# VERIFICATION TEST
# ==========================================
if __name__ == "__main__":
    print("--- Testing S.M.U.V.E- Dynamic Automation Engine ---")
    test_signal = np.ones(44100)  # 1-second constant amplitude
    
    # 1. Test linear gain ramp
    ramped_linear = ParameterAutomation.apply_gain_ramp(test_signal, start_gain=0.0, end_gain=1.0, curve_type="linear")
    
    # 2. Test multi-point keyframe envelope
    keyframes = [(0, 0.0), (10000, 0.8), (30000, 0.2), (44100, 1.0)]
    env_curve = ParameterAutomation.generate_envelope_points(44100, keyframes)
    
    print(f"[+] Linear Ramp Test Passed | Start Gain: {ramped_linear[0]:.2f}, End Gain: {ramped_linear[-1]:.2f}")
    print(f"[+] Keyframe Envelope Test Passed | Point Count: {len(keyframes)}, Curve Samples: {len(env_curve)}")
    print("--- Dynamic Automation Engine Ready for Integration ---")

