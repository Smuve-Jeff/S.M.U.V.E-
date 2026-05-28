import re

def fix_header(path, component_name, imports, component_imports):
    with open(path, 'r') as f:
        content = f.read()

    # Extract the class body (everything from the first '{' after 'export class ComponentName' to the end)
    match = re.search(rf'export class {component_name}.*?\{{(.*)', content, re.DOTALL)
    if not match:
        print(f"Could not find class {component_name} in {path}")
        return

    body = match.group(1)
    # Remove any existing audioSession injection at the top of the body to avoid duplicates
    body = re.sub(r'^\s*(public|private|readonly)?\s*audioSession\s*=\s*inject\(AudioSessionService\);', '', body, flags=re.MULTILINE)

    new_content = f"""{imports}

@Component({{
  selector: 'app-{path.split('/')[-2]}',
  standalone: true,
  imports: [{component_imports}],
  templateUrl: './{path.split('/')[-1].replace('.ts', '.html')}',
  styleUrls: ['./{path.split('/')[-1].replace('.ts', '.css')}']
}})
export class {component_name} {{
  public readonly audioSession = inject(AudioSessionService);
{body}
"""
    # Fix styleUrls vs styleUrl
    if 'drum-machine' in path or 'mixer' in path:
         new_content = new_content.replace('styleUrls: [', 'styleUrl: ')
         new_content = new_content.replace("['./" + path.split('/')[-1].replace('.ts', '.css') + "']", "'./" + path.split('/')[-1].replace('.ts', '.css') + "'")

    with open(path, 'w') as f:
        f.write(new_content)

# DrumMachine
fix_header('src/app/studio/drum-machine/drum-machine.component.ts', 'DrumMachineComponent',
"import { Component, inject, signal, computed, AfterViewInit, OnDestroy, EffectRef, effect } from '@angular/core';\nimport { CommonModule } from '@angular/common';\nimport { FormsModule } from '@angular/forms';\nimport { AudioSessionService } from '../audio-session.service';\nimport { KnobComponent } from '../shared/knob/knob.component';\nimport { MusicManagerService, TrackNote } from '../../services/music-manager.service';\nimport { AudioEngineService } from '../../services/audio-engine.service';\nimport { InstrumentsService } from '../../services/instruments.service';\nimport { AiService } from '../../services/ai.service';\nimport { HapticService } from '../../services/haptic.service';",
"CommonModule, FormsModule, KnobComponent")

# Mixer
fix_header('src/app/studio/mixer/mixer.component.ts', 'MixerComponent',
"import { Component, Input, inject, signal, computed } from '@angular/core';\nimport { CommonModule } from '@angular/common';\nimport { FormsModule } from '@angular/forms';\nimport { AudioSessionService } from '../audio-session.service';\nimport { KnobComponent } from '../shared/knob/knob.component';\nimport { MusicManagerService, TrackModel } from '../../services/music-manager.service';\nimport { NeuralMixerService } from '../../services/neural-mixer.service';\nimport { MixerService } from '../mixer.service';\nimport { HapticService } from '../../services/haptic.service';\nimport { Clip } from '../instrument.service';",
"CommonModule, FormsModule, KnobComponent")
