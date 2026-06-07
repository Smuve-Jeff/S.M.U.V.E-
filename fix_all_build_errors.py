import re

def fix_html():
    with open('src/app/studio/studio.component.html', 'r') as f:
        content = f.read()
    # Remove all backslash-escaped quotes
    fixed = content.replace('\"', '"')
    with open('src/app/studio/studio.component.html', 'w') as f:
        f.write(fixed)
    print("Fixed StudioComponent HTML quotes.")

def fix_music_manager():
    with open('src/app/services/music-manager.service.ts', 'r') as f:
        lines = f.readlines()

    new_lines = []
    found_update_synth = False
    inside_duplicate = False

    for line in lines:
        if 'updateSynthParams(trackId: number, params: any) {' in line:
            if not found_update_synth:
                found_update_synth = True
                new_lines.append(line)
            else:
                inside_duplicate = True
                continue

        if inside_duplicate:
            if line.strip() == '    }));' or line.strip() == '  }':
                # Heuristic for end of method
                if line.strip() == '  }':
                   inside_duplicate = False
                continue
            continue

        new_lines.append(line)

    with open('src/app/services/music-manager.service.ts', 'w') as f:
        f.writelines(new_lines)
    print("Fixed MusicManager duplicate methods.")

fix_html()
fix_music_manager()
