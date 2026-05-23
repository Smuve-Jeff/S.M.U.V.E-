import sys

file_path = 'src/app/services/audio-engine.service.ts'
with open(file_path, 'r') as f:
    lines = f.readlines()

new_lines = []
for line in lines:
    if 'public limiter: DynamicsCompressorNode;' in line:
        new_lines.append(line)
        new_lines.append('  public masterEQ: BiquadFilterNode;\n')
    elif 'this.limiter = this.ctx.createDynamicsCompressor();' in line:
        new_lines.append(line)
        new_lines.append('    this.masterEQ = this.ctx.createBiquadFilter();\n')
    elif 'this.saturationNode.connect(this.limiter);' in line:
        new_lines.append('    this.saturationNode.connect(this.masterEQ);\n')
        new_lines.append('    this.masterEQ.connect(this.limiter);\n')
    elif 'this.masterEQ = this.ctx.createBiquadFilter();' in line:
        new_lines.append(line)
        new_lines.append('    this.masterEQ.type = "highpass";\n')
        new_lines.append('    this.masterEQ.frequency.value = 20; \/\/ DC Offset removal / Low cut\n')
    elif 'curve[i] = ((3 + k) * x * 20 * deg) / (Math.PI + k * Math.abs(x));' in line:
        # Improved soft clipping saturation curve
        new_lines.append('      const absX = Math.abs(x);\n')
        new_lines.append('      if (absX < 0.33) {\n')
        new_lines.append('        curve[i] = 2 * x;\n')
        new_lines.append('      } else if (absX < 0.66) {\n')
        new_lines.append('        curve[i] = (3 - (2 - 3 * x) ** 2) / 3 * (x > 0 ? 1 : -1);\n')
        new_lines.append('      } else {\n')
        new_lines.append('        curve[i] = x > 0 ? 1 : -1;\n')
        new_lines.append('      }\n')
        new_lines.append('      curve[i] *= amount; \/\/ Scale by amount\n')
    else:
        new_lines.append(line)

with open(file_path, 'w') as f:
    f.writelines(new_lines)
