import os

def fix_file(path, required_imports, component_name):
    with open(path, 'r') as f:
        lines = f.readlines()

    # Filter out existing lines that might conflict or be duplicates
    new_lines = []
    for line in lines:
        if any(imp in line for imp in ["AudioSessionService", "KnobComponent", "MusicManagerService", "AudioEngineService"]):
            continue
        new_lines.append(line)

    # Add back the required imports at the top
    imports_to_add = []
    for imp_line in required_imports:
        imports_to_add.append(imp_line + "\n")

    # Prepend imports to the rest of the file
    content = "".join(imports_to_add) + "".join(new_lines)

    # Ensure KnobComponent is in the 'imports' array of the @Component decorator
    # This is a bit tricky with regex, so I'll just check if it's there
    if 'KnobComponent' not in content and '@Component' in content:
        # Simple string replacement for common patterns
        content = content.replace('imports: [', 'imports: [KnobComponent, ')
        content = content.replace('imports: [ ', 'imports: [KnobComponent, ')

    with open(path, 'w') as f:
        f.write(content)

# DrumMachine
fix_file('src/app/studio/drum-machine/drum-machine.component.ts', [
    "import { AudioSessionService } from '../audio-session.service';",
    "import { KnobComponent } from '../shared/knob/knob.component';",
    "import { MusicManagerService, TrackNote } from '../../services/music-manager.service';",
    "import { AudioEngineService } from '../../services/audio-engine.service';"
], 'DrumMachineComponent')

# PianoRoll
fix_file('src/app/studio/piano-roll/piano-roll.component.ts', [
    "import { AudioSessionService } from '../audio-session.service';",
    "import { KnobComponent } from '../shared/knob/knob.component';",
    "import { MusicManagerService, TrackNote, TrackModel } from '../../services/music-manager.service';",
    "import { AudioEngineService } from '../../services/audio-engine.service';"
], 'PianoRollComponent')

# Mixer
fix_file('src/app/studio/mixer/mixer.component.ts', [
    "import { AudioSessionService } from '../audio-session.service';",
    "import { KnobComponent } from '../shared/knob/knob.component';",
    "import { MusicManagerService, TrackModel } from '../../services/music-manager.service';",
], 'MixerComponent')

# ArrangementView
fix_file('src/app/studio/arrangement-view/arrangement-view.component.ts', [
    "import { AudioSessionService } from '../audio-session.service';",
    "import { KnobComponent } from '../shared/knob/knob.component';",
    "import { MusicManagerService, ArrangementClip } from '../../services/music-manager.service';",
], 'ArrangementViewComponent')

# Performer
fix_file('src/app/studio/performer/performer.component.ts', [
    "import { AudioSessionService } from '../audio-session.service';",
    "import { KnobComponent } from '../shared/knob/knob.component';",
    "import { MusicManagerService } from '../../services/music-manager.service';",
    "import { AudioEngineService } from '../../services/audio-engine.service';"
], 'PerformerComponent')
