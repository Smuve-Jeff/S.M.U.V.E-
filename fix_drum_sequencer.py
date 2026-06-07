import re

def patch_file(path, search_pattern, replace_content):
    with open(path, 'r') as f:
        content = f.read()
    new_content = re.sub(search_pattern, replace_content, content, flags=re.DOTALL)
    with open(path, 'w') as f:
        f.write(new_content)
    print(f"Patched {path}")

# Hook SequencerService to AudioEngineService
patch_file('src/app/studio/sequencer.service.ts',
    r'private aiService = inject\(AiService\);',
    r'private aiService = inject(AiService);\n\n  constructor() {\n    this.engine.onScheduleStep = (step, time, duration) => {\n      this.tick(step, time, duration);\n    };\n  }')

# In StudioComponent, ensure SequencerService is injected to trigger its constructor
patch_file('src/app/studio/studio.component.ts',
    r'public readonly touchGestures = inject\(TouchGestureService\);',
    r'public readonly touchGestures = inject(TouchGestureService);\n  private readonly sequencer = inject(SequencerService);')

patch_file('src/app/studio/studio.component.ts',
    r"import { TrackInspectorComponent } from './track-inspector/track-inspector.component';",
    r"import { TrackInspectorComponent } from './track-inspector/track-inspector.component';\nimport { SequencerService } from './sequencer.service';")

print("Sequencer hook-up patches applied.")
