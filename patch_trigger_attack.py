import sys

file_path = 'src/app/services/audio-engine.service.ts'
with open(file_path, 'r') as f:
    content = f.read()

# Add sub oscillator to triggerAttack
old_code = """    osc.connect(filter).connect(vca).connect(panner).connect(this.masterGain);"""
new_code = """    // Add Sub-Oscillator for extra fidelity/weight if requested or for specific types
    let subOsc: OscillatorNode | null = null;
    if (this.performanceTier() === 'ultra' && (osc.type === 'sawtooth' || osc.type === 'square')) {
      subOsc = this.ctx.createOscillator();
      subOsc.type = 'sine';
      subOsc.frequency.setValueAtTime(freq / 2, when);
      const subGain = this.ctx.createGain();
      subGain.gain.setValueAtTime(actualVel * gain * 0.3, when);
      subOsc.connect(subGain).connect(vca);
      subOsc.start(when);
      subOsc.stop(when + duration + release + 0.1);
    }

    osc.connect(filter).connect(vca).connect(panner).connect(this.masterGain);"""

if old_code in content:
    content = content.replace(old_code, new_code)

with open(file_path, 'w') as f:
    f.write(content)
