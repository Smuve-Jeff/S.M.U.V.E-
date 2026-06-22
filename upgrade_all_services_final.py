import sys

# 1. Upgrade AudioEngineService
path_ae = 'src/app/services/audio-engine.service.ts'
with open(path_ae, 'r') as f:
    content = f.read()

imports = """import { InstrumentRegistryService } from '../studio/instrument-registry.service';
import { SamplerEngine } from '../studio/sampler-engine';
import { FileLoaderService } from './file-loader.service';
"""
if 'InstrumentRegistryService' not in content:
    content = content.replace("import { StemSeparationService, Stems } from './stem-separation.service';",
                              "import { StemSeparationService, Stems } from './stem-separation.service';\n" + imports)

if 'private samplerEngine!: SamplerEngine;' not in content:
    content = content.replace('public masterAnalyser: AnalyserNode;',
                              'public masterAnalyser: AnalyserNode;\n  private trackInstruments = new Map<any, any>();\n  private samplerEngine!: SamplerEngine;\n  private fileLoader = inject(FileLoaderService);')

if 'this.samplerEngine = new SamplerEngine(this.ctx, this.fileLoader);' not in content:
    content = content.replace('this.loadDefaultImpulse();',
                              'this.loadDefaultImpulse();\n    this.samplerEngine = new SamplerEngine(this.ctx, this.fileLoader);')

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
start_trigger = content.find('triggerAttack(')
next_func = content.find('setStemGain(', start_trigger)
if start_trigger != -1 and next_func != -1:
    content = content[:start_trigger] + new_trigger + content[next_func:]

with open(path_ae, 'w') as f:
    f.write(content)

# 2. Upgrade MusicManagerService
path_mm = 'src/app/services/music-manager.service.ts'
with open(path_mm, 'r') as f:
    content = f.read()

# Add Elite Instrumental Template usage logic if needed, but it's mainly in ProjectTemplateService.
# Ensure static DRUM_TRACK_ID
content = content.replace("public static readonly DRUM_TRACK_ID = '100';", "public static readonly DRUM_TRACK_ID = 'DRUM_TRACK';")

with open(path_mm, 'w') as f:
    f.write(content)

# 3. Fix Sequencer Swing
path_seq = 'src/app/studio/sequencer.service.ts'
with open(path_seq, 'r') as f:
    content = f.read()
if 'swingAmount' not in content:
    content = content.replace('private aiService = inject(AiService);',
                              'private aiService = inject(AiService);\n  public swingAmount = signal(0);')
    content = content.replace('tick(stepIndex: number, time: number, duration: number) {',
                              'tick(stepIndex: number, time: number, duration: number) {\n    let playTime = time;\n    if (stepIndex % 2 === 1) {\n      playTime += (this.swingAmount() / 100) * (duration / 2);\n    }')
    content = content.replace('this.musicManager.playStep(stepIndex, time, duration);', 'this.musicManager.playStep(stepIndex, playTime, duration);')
    with open(path_seq, 'w') as f:
        f.write(content)

print("Upgraded services successfully")
