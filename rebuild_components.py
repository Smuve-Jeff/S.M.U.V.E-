import re
import os

def rebuild_component(path, component_name, imports, component_imports, selector):
    if not os.path.exists(path):
        print(f"Skipping {path}, file not found.")
        return

    with open(path, 'r') as f:
        content = f.read()

    # Find the start of the class body
    # Search for 'export class ComponentName ... {'
    class_match = re.search(rf'export class\s+{component_name}.*?\{{(.*)', content, re.DOTALL)
    if not class_match:
        print(f"Could not find class body for {component_name} in {path}")
        return

    body = class_match.group(1)

    # Clean up common issues in the body
    # Remove any existing audioSession injections
    body = re.sub(r'^\s*(public|private|readonly)?\s*audioSession\s*=\s*inject\(AudioSessionService\);', '', body, flags=re.MULTILINE)
    # Remove any stray 'import {' or '}' lines that might have leaked into the body
    body = re.sub(r'^\s*import\s+\{.*$', '', body, flags=re.MULTILINE)
    body = re.sub(r'^\s*\}\s*from\s+.*$', '', body, flags=re.MULTILINE)
    # Remove any class metadata that might have leaked into the body
    body = re.sub(r'^\s*@Component\(\{.*?\}\)', '', body, flags=re.DOTALL | re.MULTILINE)

    # Ensure styleUrls/styleUrl consistency
    style_field = "styleUrl: './" + path.split('/')[-1].replace('.ts', '.css') + "'"
    if 'piano-roll' in path or 'arrangement-view' in path or 'performer' in path:
         style_field = "styleUrls: ['./" + path.split('/')[-1].replace('.ts', '.css') + "']"

    new_content = f"""{imports}

@Component({{
  selector: '{selector}',
  standalone: true,
  imports: [{component_imports}],
  templateUrl: './{path.split('/')[-1].replace('.ts', '.html')}',
  {style_field}
}})
export class {component_name} {{
  public readonly audioSession = inject(AudioSessionService);
{body.strip()}
"""
    # Ensure there is exactly one closing brace for the class at the end
    # body might contain the original closing brace
    if not new_content.strip().endswith('}'):
        new_content = new_content.strip() + "\n}\n"

    with open(path, 'w') as f:
        f.write(new_content)

# 1. DrumMachine
rebuild_component('src/app/studio/drum-machine/drum-machine.component.ts', 'DrumMachineComponent',
"""import { Component, inject, signal, computed, AfterViewInit, OnDestroy, EffectRef, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AudioSessionService } from '../audio-session.service';
import { KnobComponent } from '../shared/knob/knob.component';
import { MusicManagerService, TrackNote } from '../../services/music-manager.service';
import { AudioEngineService } from '../../services/audio-engine.service';
import { InstrumentsService } from '../../services/instruments.service';
import { AiService } from '../../services/ai.service';
import { HapticService } from '../../services/haptic.service';""",
"CommonModule, FormsModule, KnobComponent", "app-drum-machine")

# 2. PianoRoll
rebuild_component('src/app/studio/piano-roll/piano-roll.component.ts', 'PianoRollComponent',
"""import { Component, inject, signal, computed, OnInit, AfterViewInit, ViewChild, ElementRef, HostListener, Output, EventEmitter, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AudioSessionService } from '../audio-session.service';
import { KnobComponent } from '../shared/knob/knob.component';
import { MusicManagerService, TrackNote, TrackModel } from '../../services/music-manager.service';
import { AudioEngineService } from '../../services/audio-engine.service';
import { InstrumentsService } from '../../services/instruments.service';
import { HistoryService } from '../../services/history.service';
import { AiService } from '../../services/ai.service';
import { Router } from '@angular/router';
import { TouchGestureService } from '../../services/touch-gesture.service';""",
"CommonModule, FormsModule, KnobComponent", "app-piano-roll")

# 3. Mixer
rebuild_component('src/app/studio/mixer/mixer.component.ts', 'MixerComponent',
"""import { Component, Input, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AudioSessionService } from '../audio-session.service';
import { KnobComponent } from '../shared/knob/knob.component';
import { MusicManagerService, TrackModel } from '../../services/music-manager.service';
import { NeuralMixerService } from '../../services/neural-mixer.service';
import { MixerService } from '../mixer.service';
import { HapticService } from '../../services/haptic.service';
import { Clip } from '../instrument.service';""",
"CommonModule, FormsModule, KnobComponent", "app-mixer")

# 4. ArrangementView
rebuild_component('src/app/studio/arrangement-view/arrangement-view.component.ts', 'ArrangementViewComponent',
"""import { Component, signal, computed, inject, ElementRef, ViewChild, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AudioSessionService } from '../audio-session.service';
import { KnobComponent } from '../shared/knob/knob.component';
import { MusicManagerService, ArrangementClip } from '../../services/music-manager.service';""",
"CommonModule, FormsModule, KnobComponent", "app-arrangement-view")

# 5. Performer
rebuild_component('src/app/studio/performer/performer.component.ts', 'PerformerComponent',
"""import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AudioSessionService } from '../audio-session.service';
import { KnobComponent } from '../shared/knob/knob.component';
import { MusicManagerService } from '../../services/music-manager.service';
import { AudioEngineService } from '../../services/audio-engine.service';
import { LiveEngineService } from '../../services/live-engine.service';
import { HapticService } from '../../services/haptic.service';
import { InstrumentsService, InstrumentPreset } from '../../services/instruments.service';""",
"CommonModule, FormsModule, KnobComponent", "app-performer")
