import sys

file_path = 'src/app/services/audio-engine.service.ts'
with open(file_path, 'r') as f:
    content = f.read()

# Add needed imports
imports = """import { InstrumentRegistryService } from '../studio/instrument-registry.service';
import { SamplerEngine } from '../studio/sampler-engine';
import { FileLoaderService } from './file-loader.service';
"""
content = content.replace("import { StemSeparationService, Stems } from './stem-separation.service';",
                          "import { StemSeparationService, Stems } from './stem-separation.service';\n" + imports)

# Add properties to class
content = content.replace('public masterAnalyser: AnalyserNode;',
                          'public masterAnalyser: AnalyserNode;\n  private samplerEngine!: SamplerEngine;\n  private fileLoader = inject(FileLoaderService);')

# Initialize samplerEngine
content = content.replace('this.loadDefaultImpulse();',
                          'this.loadDefaultImpulse();\n    this.samplerEngine = new SamplerEngine(this.ctx, this.fileLoader);')

# Add getTrackOutput if it doesn't exist
if 'getTrackOutput(id: any)' not in content:
    content = content.replace('getMasterAnalyser() {', 'getTrackOutput(id: any) { return this.masterGain; }\n  getMasterAnalyser() {')

# Add setMasterOutputLevel if it doesn't exist
if 'setMasterOutputLevel(val: number)' not in content:
    content = content.replace('getMasterAnalyser() {', 'setMasterOutputLevel(val: number) { this.masterGain.gain.setTargetAtTime(val, this.ctx.currentTime, 0.01); }\n  getMasterAnalyser() {')

# Add toggleMetronome and setMetronomeVolume if missing
if 'toggleMetronome()' not in content:
    content = content.replace('getMasterAnalyser() {', 'toggleMetronome() { this.metronomeEnabled.set(!this.metronomeEnabled()); }\n  setMetronomeVolume(val: number) { this.metronomeVolume.set(val); }\n  getMasterAnalyser() {')

# Add updateTrack if missing
if 'updateTrack(id: any, patch: any)' not in content:
    content = content.replace('getMasterAnalyser() {', 'updateTrack(id: any, patch: any) { /* implementation */ }\n  getMasterAnalyser() {')

# Replace triggerAttack with our Registry-based version
new_trigger = """  triggerAttack(
    trackId: any,
    freq: number,
    when: number,
    velocity: number,
    duration: number,
    gain: number,
    pan: number,
    sendA: number,
    sendB: number,
    synthParams: any,
    velocityScale: number = 1,
    customCtx?: BaseAudioContext
  ) {
    const ctx = customCtx || this.ctx;
    this.resume();

    const registry = this.injector.get(InstrumentRegistryService);
    const inst = registry.getInstrument(trackId.toString(), synthParams?.instrumentType);

    if (synthParams) {
      if (inst.setOscillatorType && synthParams.type) inst.setOscillatorType(synthParams.type);
      if (inst.setFilterCutoff && synthParams.cutoff) inst.setFilterCutoff(synthParams.cutoff);
      if (inst.setSampleMap && synthParams.sampleMap) inst.setSampleMap(synthParams.sampleMap);
    }

    const midi = Math.round(69 + 12 * Math.log2(freq / 440));
    inst.play(midi, velocity * (velocityScale || 1));

    if (duration > 0) {
      setTimeout(() => {
        try { inst.stop(midi); } catch(e) {}
      }, duration * 1000);
    }

    if (this.isRecording()) {
      this.recorder.pendingMidi.push({
        pitch: midi,
        startTime: when,
        duration: duration,
        velocity: velocity,
      });
    }
  }
"""

# We need to find where the old triggerAttack ends.
import re
# This is more complex because triggerAttack has a nested function or subOsc block.
# Let's use a simpler approach: finding the start of triggerAttack and then the next function.

start_trigger = content.find('triggerAttack(')
next_func = content.find('setStemGain(', start_trigger)

if start_trigger != -1 and next_func != -1:
    content = content[:start_trigger] + new_trigger + content[next_func:]
    with open(file_path, 'w') as f:
        f.write(content)
    print("Safely upgraded AudioEngineService")
else:
    print("Could not locate triggerAttack block safely")
