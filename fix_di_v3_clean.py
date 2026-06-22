import sys
import re

# DrumMachineComponent
path_dm = 'src/app/studio/drum-machine/drum-machine.component.ts'
with open(path_dm, 'r') as f:
    content = f.read()

# Add missing members
if 'viewMode' not in content:
    content = re.sub(
        r'public\s+pads\s*=\s*signal',
        'public viewMode = signal<"sequencer" | "knobs">("sequencer");\n  public graphTarget = signal<"velocity" | "probability">("velocity");\n  public currentBar = signal(0);\n  public barRange = [0, 1, 2, 3];\n  public barStepRange = Array.from({length: 16}, (_, i) => i);\n  public selectedPadId = signal<string>("pad-36");\n  public selectedPad = computed(() => this.pads().find(p => p.id === this.selectedPadId()));\n  public pads = signal',
        content,
        count=1
    )

# Add missing methods
methods = """
  evolveRhythm() {}
  generateGenre(genre: string) {}
  randomizeAll() {}
  selectPad(id: string) { this.selectedPadId.set(id); }
  getPadStep(padId: string, stepIdx: number) {
    return this.pads().find(p => p.id === padId)?.steps[stepIdx] || {active: false, velocity: 1};
  }
  isStepPlaying(pad: any) { return false; }
  isGlobalStep(step: number) { return false; }
"""
if 'evolveRhythm' not in content:
    content = content.replace('constructor() {', methods + '\n  constructor() {')

with open(path_dm, 'w') as f:
    f.write(content)

# Fix haptic.impact call in DrumMachineComponent
content = content.replace("this.haptic.impact()", "this.haptic.impact('light')")
with open(path_dm, 'w') as f:
    f.write(content)

# AudioEngineService - Ensure ctx is public
path_ae = 'src/app/services/audio-engine.service.ts'
with open(path_ae, 'r') as f:
    content = f.read()
content = content.replace('private ctx: AudioContext;', 'public ctx: AudioContext;')
content = content.replace('  ctx: AudioContext;', '  public ctx: AudioContext;')
with open(path_ae, 'w') as f:
    f.write(content)

print("Cleaned up DrumMachineComponent and AudioEngineService")
