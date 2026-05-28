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
        content = f.read()

    if 'audioSession = inject(AudioSessionService)' not in content:
        # Simple injection after class opening brace
        lines = content.splitlines()
        new_lines = []
        injected = False
        for line in lines:
            new_lines.append(line)
            if 'export class' in line and '{' in line and not injected:
                new_lines.append('  public readonly audioSession = inject(AudioSessionService);')
                injected = True

        content = "\n".join(new_lines)

    with open(file_path, 'w') as f:
        f.write(content)
