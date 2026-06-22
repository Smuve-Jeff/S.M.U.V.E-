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
                              "public masterAnalyser: AnalyserNode;\n  private trackInstruments = new Map<any, any>();\n  private samplerEngine!: SamplerEngine;\n  private fileLoader = inject(FileLoaderService);")

# Initialize SamplerEngine
if "this.samplerEngine = new SamplerEngine(this.ctx, this.fileLoader);" not in content:
    content = content.replace("this.loadDefaultImpulse();",
                              "this.loadDefaultImpulse();\n    this.samplerEngine = new SamplerEngine(this.ctx, this.fileLoader);")

# Replace triggerAttack logic
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

old_block_start = "  triggerAttack("
old_block_end = "    if (sendA > 0 && this.reverbConvolver) {"

s = content.find(old_block_start)
e = content.find(old_block_end, s)

if s != -1 and e != -1:
    content = content[:s] + new_trigger_method + content[e:]
    with open(file_path, 'w') as f:
        f.write(content)
    print("Upgraded triggerAttack to use InstrumentRegistry")
else:
    print(f"Could not find triggerAttack block to replace. s={s}, e={e}")
