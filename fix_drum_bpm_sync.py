import re

def patch_file(path, search_pattern, replace_content):
    with open(path, 'r') as f:
        content = f.read()
    new_content = re.sub(search_pattern, replace_content, content, flags=re.DOTALL)
    with open(path, 'w') as f:
        f.write(new_content)
    print(f"Patched {path}")

# AudioEngineService: Add visualStep signal for smoother UI playhead
patch_file('src/app/services/audio-engine.service.ts',
    r'public isPlaying = signal\(false\);',
    r'public isPlaying = signal(false);\n  public visualStep = signal(0);')

patch_file('src/app/services/audio-engine.service.ts',
    r'this\.currentBeat\.set\(step / this\.stepsPerBeat\(\)\);',
    r'this.currentBeat.set(step / this.stepsPerBeat());\n      this.visualStep.set(step);')

# DrumMachineComponent: Use visualStep for playhead
patch_file('src/app/studio/drum-machine/drum-machine.component.ts',
    r'readonly currentStep = this\.musicManager\.currentStep;',
    r'readonly currentStep = this.engine.visualStep;')

# MusicManager: Also use visualStep for currentStep if possible, or keep as is.
# Drum Machine visual timing is most important.

print("Drum Machine BPM/Playhead sync patches applied.")
