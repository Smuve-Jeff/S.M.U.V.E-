import sys

file_path = 'src/app/services/audio-engine.service.ts'
with open(file_path, 'r') as f:
    lines = f.readlines()

new_lines = []
for line in lines:
    if 'public masterEQ: BiquadFilterNode;' in line:
        new_lines.append(line)
        new_lines.append('  public masterShelf: BiquadFilterNode;\n')
        new_lines.append('  public masterWidener: StereoPannerNode;\n')
    elif 'this.masterEQ = this.ctx.createBiquadFilter();' in line:
        new_lines.append(line)
        new_lines.append('    this.masterShelf = this.ctx.createBiquadFilter();\n')
        new_lines.append('    this.masterWidener = this.ctx.createStereoPanner();\n')
    elif 'this.masterEQ.connect(this.limiter);' in line:
        new_lines.append('    this.masterEQ.connect(this.masterShelf);\n')
        new_lines.append('    this.masterShelf.connect(this.limiter);\n')
    elif 'this.masterEQ.type = "highpass";' in line:
        new_lines.append(line)
        new_lines.append('    this.masterShelf.type = "highshelf";\n')
        new_lines.append('    this.masterShelf.frequency.value = 10000;\n')
        new_lines.append('    this.masterShelf.gain.value = 1.5; \/\/ Subtle air boost\n')
    else:
        new_lines.append(line)

with open(file_path, 'w') as f:
    f.writelines(new_lines)
