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

    if 'audioSession = inject(AudioSessionService);' not in content and 'public audioSession = inject(AudioSessionService);' not in content and 'private readonly audioSession = inject(AudioSessionService);' not in content:
        # Insert after the class declaration
        insertion = "  public readonly audioSession = inject(AudioSessionService);\n"
        content = content.replace('export class ' + file_path.split('/')[-1].split('.')[0].title().replace('-', '') + ' {', 'export class ' + file_path.split('/')[-1].split('.')[0].title().replace('-', '') + ' {\n' + insertion)

    with open(file_path, 'w') as f:
        f.write(content)
