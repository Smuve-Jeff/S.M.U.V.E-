import re

def patch_file(path, search_pattern, replace_content):
    with open(path, 'r') as f:
        content = f.read()
    new_content = re.sub(search_pattern, replace_content, content, flags=re.DOTALL)
    with open(path, 'w') as f:
        f.write(new_content)
    print(f"Patched {path}")

# DrumMachineComponent: Make grid cells larger on mobile
patch_file('src/app/studio/drum-machine/drum-machine.component.css',
    r'\.step-box \{.*?min-width: 18px;.*?height: 28px;',
    r'.step-box {\n  min-width: 24px;\n  height: 36px;')

# Ensure viewport doesn't hide scrollbars and handles touch properly
patch_file('src/app/studio/drum-machine/drum-machine.component.css',
    r'\.sequencer-viewport \{.*?overflow: auto;.*?\}',
    r'.sequencer-viewport {\n  overflow: auto;\n  touch-action: pan-x pan-y;\n  -webkit-overflow-scrolling: touch;\n}')

# ArrangementViewComponent: Use larger lane height on mobile
patch_file('src/app/studio/arrangement-view/arrangement-view.component.ts',
    r'readonly laneHeight = 80;',
    r'readonly isMobile = window.innerWidth <= 1024;\n  readonly laneHeight = this.isMobile ? 110 : 80;')

print("Drum Machine and Arrangement mobile layouts refined.")
