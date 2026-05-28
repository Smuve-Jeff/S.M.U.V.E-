import os

def fix_component_file(path, component_name, imports_list, component_imports):
    with open(path, 'r') as f:
        content = f.read()

    # 1. Strip all imports at the top and class members that might conflict
    lines = content.splitlines()
    new_lines = []
    in_imports = True
    for line in lines:
        if line.startswith('import ') or line.startswith('} from '):
            continue
        if 'public readonly audioSession =' in line or 'public audioSession =' in line or 'private readonly audioSession =' in line:
            continue
        new_lines.append(line)

    # 2. Add correct imports at the top
    top_imports = "\n".join(imports_list)

    # 3. Add audioSession inside the class
    class_def = f'export class {component_name}'
    processed_content = top_imports + "\n" + "\n".join(new_lines)

    if class_def in processed_content:
        processed_content = processed_content.replace(class_def + ' {', class_def + ' {\n  public readonly audioSession = inject(AudioSessionService);')
        processed_content = processed_content.replace(class_def + '{', class_def + ' {\n  public readonly audioSession = inject(AudioSessionService);')

    # 4. Fix @Component imports
    if 'imports: [' in processed_content:
        # Replace the imports array content
        start = processed_content.find('imports: [') + 10
        end = processed_content.find(']', start)
        processed_content = processed_content[:start] + component_imports + processed_content[end:]

    with open(path, 'w') as f:
        f.write(processed_content)

# DrumMachine
fix_component_file('src/app/studio/drum-machine/drum-machine.component.ts', 'DrumMachineComponent', [
    "import { Component, inject, signal, computed, AfterViewInit, OnDestroy, EffectRef, effect } from '@angular/core';",
    "import { CommonModule } from '@angular/common';",
    "import { FormsModule } from '@angular/forms';",
    "import { AudioSessionService } from '../audio-session.service';",
    "import { KnobComponent } from '../shared/knob/knob.component';",
    "import { MusicManagerService, TrackNote } from '../../services/music-manager.service';",
    "import { AudioEngineService } from '../../services/audio-engine.service';",
    "import { InstrumentsService } from '../../services/instruments.service';",
    "import { AiService } from '../../services/ai.service';",
    "import { HapticService } from '../../services/haptic.service';"
], "CommonModule, FormsModule, KnobComponent")

# PianoRoll
fix_component_file('src/app/studio/piano-roll/piano-roll.component.ts', 'PianoRollComponent', [
    "import { Component, inject, signal, computed, OnInit, AfterViewInit, ViewChild, ElementRef, HostListener, Output, EventEmitter, ChangeDetectorRef } from '@angular/core';",
    "import { CommonModule } from '@angular/common';",
    "import { FormsModule } from '@angular/forms';",
    "import { AudioSessionService } from '../audio-session.service';",
    "import { KnobComponent } from '../shared/knob/knob.component';",
    "import { MusicManagerService, TrackNote, TrackModel } from '../../services/music-manager.service';",
    "import { AudioEngineService } from '../../services/audio-engine.service';",
    "import { InstrumentsService } from '../../services/instruments.service';",
    "import { HistoryService } from '../../services/history.service';",
    "import { AiService } from '../../services/ai.service';",
    "import { Router } from '@angular/router';",
    "import { TouchGestureService } from '../../services/touch-gesture.service';"
], "CommonModule, FormsModule, KnobComponent")

# Mixer
fix_component_file('src/app/studio/mixer/mixer.component.ts', 'MixerComponent', [
    "import { Component, Input, inject, signal, computed } from '@angular/core';",
    "import { CommonModule } from '@angular/common';",
    "import { FormsModule } from '@angular/forms';",
    "import { AudioSessionService } from '../audio-session.service';",
    "import { KnobComponent } from '../shared/knob/knob.component';",
    "import { MusicManagerService, TrackModel } from '../../services/music-manager.service';",
    "import { NeuralMixerService } from '../../services/neural-mixer.service';",
    "import { MixerService } from '../mixer.service';",
    "import { HapticService } from '../../services/haptic.service';",
    "import { Clip } from '../instrument.service';"
], "CommonModule, FormsModule, KnobComponent")

# ArrangementView
fix_component_file('src/app/studio/arrangement-view/arrangement-view.component.ts', 'ArrangementViewComponent', [
    "import { Component, signal, computed, inject, ElementRef, ViewChild, HostListener } from '@angular/core';",
    "import { CommonModule } from '@angular/common';",
    "import { FormsModule } from '@angular/forms';",
    "import { AudioSessionService } from '../audio-session.service';",
    "import { KnobComponent } from '../shared/knob/knob.component';",
    "import { MusicManagerService, ArrangementClip } from '../../services/music-manager.service';"
], "CommonModule, FormsModule, KnobComponent")

# Performer
fix_component_file('src/app/studio/performer/performer.component.ts', 'PerformerComponent', [
    "import { Component, inject, signal } from '@angular/core';",
    "import { CommonModule } from '@angular/common';",
    "import { FormsModule } from '@angular/forms';",
    "import { AudioSessionService } from '../audio-session.service';",
    "import { KnobComponent } from '../shared/knob/knob.component';",
    "import { MusicManagerService } from '../../services/music-manager.service';",
    "import { AudioEngineService } from '../../services/audio-engine.service';",
    "import { LiveEngineService } from '../../services/live-engine.service';",
    "import { HapticService } from '../../services/haptic.service';",
    "import { InstrumentsService, InstrumentPreset } from '../../services/instruments.service';"
], "CommonModule, FormsModule, KnobComponent")
