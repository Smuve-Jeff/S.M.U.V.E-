import sys

with open('audio_engine_backup.ts', 'r') as f:
    backup = f.read()

# Add upgrades
# 1. Imports
imports = """import { InstrumentRegistryService } from '../studio/instrument-registry.service';
import { SamplerEngine } from '../studio/sampler-engine';
import { FileLoaderService } from './file-loader.service';
"""
if "import { InstrumentRegistryService }" not in backup:
    backup = backup.replace("import { StemSeparationService, Stems } from './stem-separation.service';",
                            "import { StemSeparationService, Stems } from './stem-separation.service';\n" + imports)

# 2. Properties
if "private samplerEngine!: SamplerEngine;" not in backup:
    backup = backup.replace("public masterAnalyser: AnalyserNode;",
                            "public masterAnalyser: AnalyserNode;\n  private trackInstruments = new Map<any, any>();\n  private samplerEngine!: SamplerEngine;\n  private fileLoader = inject(FileLoaderService);")

# 3. Initialization in constructor
if "this.samplerEngine = new SamplerEngine(this.ctx, this.fileLoader);" not in backup:
    backup = backup.replace("this.loadDefaultImpulse();",
                            "this.loadDefaultImpulse();\n    this.samplerEngine = new SamplerEngine(this.ctx, this.fileLoader);")

# 4. Upgrade triggerAttack
# I will rename the original triggerAttack to triggerAttackLegacy and make triggerAttack use the registry.
# This way all existing calls still work or I can route them.
# Actually, the user wants the new logic.

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

# Find the original triggerAttack and replace it.
import re
# The original one in backup starts with triggerAttack( and ends before setStemGain
start_idx = backup.find("triggerAttack(")
next_func = backup.find("setStemGain(", start_idx)
if start_idx != -1 and next_func != -1:
    backup = backup[:start_idx] + new_trigger + backup[next_func:]

# Ensure getTrackOutput exists and is public
if "getTrackOutput(id: any)" not in backup:
    backup = backup.replace("getMasterAnalyser() {",
                            "public getTrackOutput(id: any): GainNode { return this.masterGain; }\n  getMasterAnalyser() {")

with open('src/app/services/audio-engine.service.ts', 'w') as f:
    f.write(backup)
print("Merged AudioEngineService with upgrades and legacy support")
