import sys

file_path = 'src/app/services/audio-engine.service.ts'
with open(file_path, 'r') as f:
    content = f.read()

# Add SamplerEngine and InstrumentRegistryService imports
import_lines = "import { InstrumentRegistryService } from '../studio/instrument-registry.service';\nimport { SamplerEngine } from '../studio/sampler-engine';\nimport { FileLoaderService } from './file-loader.service';\n"
if "import { InstrumentRegistryService }" not in content:
    # insert after standard imports
    content = content.replace("import { StemSeparationService, Stems } from './stem-separation.service';",
                              "import { StemSeparationService, Stems } from './stem-separation.service';\n" + import_lines)

# Define properties
if "private samplerEngine!: SamplerEngine;" not in content:
    content = content.replace("public masterAnalyser: AnalyserNode;",
                              "public masterAnalyser: AnalyserNode;\n  private samplerEngine!: SamplerEngine;\n  private fileLoader = inject(FileLoaderService);")

# Initialize SamplerEngine
if "this.samplerEngine = new SamplerEngine(this.ctx, this.fileLoader);" not in content:
    content = content.replace("this.loadDefaultImpulse();",
                              "this.loadDefaultImpulse();\n    this.samplerEngine = new SamplerEngine(this.ctx, this.fileLoader);")

# Replace triggerAttack logic
import re
pattern = r"triggerAttack\(\s*trackId: number,[\s\S]+?\)\s*\{[\s\S]+?\}\n\s+if \(sendA > 0"
# That's too specific. Let's try replacing from triggerAttack( to the end of the block.

old_trigger_start = "triggerAttack("
# Find the specific block
start_idx = content.find("triggerAttack(")
# We know it starts at 504 roughly.
# Let's replace the whole method body.

new_trigger_method = """  triggerAttack(
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
        inst.stop(midi);
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

# Simple replacement for the first occurrence of triggerAttack
# I will use a marker to identify the start and a known line after the function to find the end.
# Actually, the backup has multiple triggerAttacks or I might have messed up.
# Let's just use string replace for the whole section I saw in sed.

old_block_start = """  triggerAttack(
    trackId: number,"""
old_block_end = """    if (sendA > 0 && this.reverbConvolver) {"""

# Find the start of the block and the start of the next section
s = content.find(old_block_start)
e = content.find(old_block_end, s)

if s != -1 and e != -1:
    content = content[:s] + new_trigger_method + content[e:]
    with open(file_path, 'w') as f:
        f.write(content)
    print("Upgraded triggerAttack to use InstrumentRegistry")
else:
    print(f"Could not find triggerAttack block to replace. s={s}, e={e}")
