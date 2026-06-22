import sys

def fix_audio_engine():
    path = 'src/app/services/audio-engine.service.ts'
    with open(path, 'r') as f:
        content = f.read()

    # Ensure ctx is public
    content = content.replace('private ctx: AudioContext;', 'public ctx: AudioContext;')
    content = content.replace('  ctx: AudioContext;', '  public ctx: AudioContext;')

    # Fix applyProductionParameter visibility or exists
    if 'public applyProductionParameter' not in content:
        content = content.replace('applyProductionParameter(', 'public applyProductionParameter(')

    with open(path, 'w') as f:
        f.write(content)

def fix_drum_machine_component():
    path = 'src/app/studio/drum-machine/drum-machine.component.ts'
    with open(path, 'r') as f:
        lines = f.readlines()

    # Add OnInit to imports
    new_lines = []
    for line in lines:
        if 'import { AfterViewInit, Component, computed, inject, OnDestroy, signal, } from \'@angular/core\';' in line:
            line = line.replace('OnDestroy, signal,', 'OnDestroy, signal, OnInit,')
        new_lines.append(line)

    # Add viewMode and selectedPad signals/methods
    # I will just replace the whole class with a fixed version based on previous attempt but with missing pieces.
    pass

# Simplified: Use a robust script to add missing members to DrumMachineComponent
def fix_dm():
    path = 'src/app/studio/drum-machine/drum-machine.component.ts'
    with open(path, 'r') as f:
        content = f.read()

    if 'public viewMode = signal' not in content:
        content = content.replace('public rollRate = signal(16);',
                                  'public rollRate = signal(16);\n  public viewMode = signal<"sequencer" | "knobs">("sequencer");\n  public graphTarget = signal<"velocity" | "probability">("velocity");\n  public currentBar = signal(0);\n  public barRange = [0, 1, 2, 3];\n  public barStepRange = Array.from({length: 16}, (_, i) => i);')

    if 'public selectedPadId = signal' not in content:
        content = content.replace('public viewMode = signal', 'public selectedPadId = signal<string>("pad-36");\n  public viewMode = signal')

    if 'public selectedPad = computed' not in content:
        content = content.replace('public pads = signal', 'public selectedPad = computed(() => this.pads().find(p => p.id === this.selectedPadId()));\n  public pads = signal')

    # Fix haptic calls
    content = content.replace('this.haptic.lightClick()', 'this.haptic.light()')
    content = content.replace('this.haptic.impact()', "this.haptic.impact('light')")

    # Add missing methods
    if 'selectPad(id: string)' not in content:
        content = content.replace('toggleStep(padIndex: number, stepIndex: number) {',
                                  'selectPad(id: string) { this.selectedPadId.set(id); }\n  getPadStep(padId: string, stepIdx: number) { return this.pads().find(p => p.id === padId)?.steps[stepIdx] || {active: false, velocity: 0}; }\n  isStepPlaying(pad: any) { return false; }\n  isGlobalStep(step: number) { return false; }\n  toggleStep(padIndex: any, stepIndex: number) {')

    with open(path, 'w') as f:
        f.write(content)

fix_audio_engine()
fix_dm()
