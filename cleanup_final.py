import os

files = [
    'src/app/studio/drum-machine/drum-machine.component.ts',
    'src/app/studio/piano-roll/piano-roll.component.ts',
    'src/app/studio/mixer/mixer.component.ts',
    'src/app/studio/arrangement-view/arrangement-view.component.ts',
    'src/app/studio/performer/performer.component.ts'
]

for file_path in files:
    with open(file_path, 'r') as f:
        lines = f.readlines()

    new_lines = []
    seen_audio_session = False
    for line in lines:
        if "audioSession = inject(AudioSessionService)" in line:
            if seen_audio_session:
                continue
            seen_audio_session = True
        new_lines.append(line)

    with open(file_path, 'w') as f:
        f.writelines(new_lines)
