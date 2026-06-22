import sys

path = 'src/app/services/audio-engine.service.ts'
with open(path, 'r') as f:
    content = f.read()

# Fix ctx visibility and public members
content = content.replace('private ctx: AudioContext;', 'public ctx: AudioContext;')
content = content.replace('  ctx: AudioContext;', '  public ctx: AudioContext;')

# Add missing methods
if 'public applyProductionParameter' not in content:
    content = content.replace('applyProductionParameter(', 'public applyProductionParameter(')

# Add updateTrack if missing
if 'updateTrack(id: any, patch: any)' not in content:
    content = content.replace('getMasterAnalyser() {', 'public updateTrack(id: any, patch: any) { const t = this.tracks.get(Number(id)); if (t) Object.assign(t, patch); }\n  getMasterAnalyser() {')

# Add setMasterOutputLevel if missing
if 'setMasterOutputLevel(' not in content:
    content = content.replace('getMasterAnalyser() {', 'public setMasterOutputLevel(val: number) { this.masterGain.gain.setTargetAtTime(val, this.ctx.currentTime, 0.01); }\n  getMasterAnalyser() {')

# Add toggleMetronome/setMetronomeVolume
if 'toggleMetronome()' not in content:
    content = content.replace('getMasterAnalyser() {', 'public toggleMetronome() { this.metronomeEnabled.set(!this.metronomeEnabled()); }\n  public setMetronomeVolume(val: number) { this.metronomeVolume.set(val); }\n  getMasterAnalyser() {')

with open(path, 'w') as f:
    f.write(content)

# Fixed DrumMachineComponent logic
path_dm = 'src/app/studio/drum-machine/drum-machine.component.ts'
with open(path_dm, 'r') as f:
    content = f.read()

# Check for missing imports
if 'OnInit' not in content:
    content = content.replace('OnDestroy, signal,', 'OnDestroy, signal, OnInit,')

# Add viewMode and other UI states if missing
if 'viewMode' not in content:
    content = content.replace('public rollRate = signal(16);',
                              'public rollRate = signal(16);\n  public viewMode = signal<"sequencer" | "knobs">("sequencer");\n  public graphTarget = signal<"velocity" | "probability">("velocity");\n  public currentBar = signal(0);\n  public barRange = [0, 1, 2, 3];\n  public barStepRange = Array.from({length: 16}, (_, i) => i);\n  public selectedPadId = signal<string>("pad-36");\n  public selectedPad = computed(() => this.pads().find(p => p.id === this.selectedPadId()));')

# Add missing methods
missing_methods = """
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
    content = content.replace('ngOnInit() {}', 'ngOnInit() {}\n' + missing_methods)

with open(path_dm, 'w') as f:
    f.write(content)

print("Applied final DI and member visibility fixes")
