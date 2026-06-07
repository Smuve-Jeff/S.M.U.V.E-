import re

file_path = 'src/app/studio/dj-deck/dj-deck.component.ts'
with open(file_path, 'r') as f:
    content = f.read()

# Fix handlePadPress sampler check
content = content.replace(
    "if (d.samplerPads[index] === null) {",
    "if (d.samplerPads[this.samplerCategory()][index] === null) {"
)
content = content.replace(
    "else this.triggerSamplerPad(deck, index);",
    "else this.triggerSamplerPad(deck, index);"
)

# Fix getPadLabel
content = content.replace(
    "if (this.performanceMode() === 'sampler') return `SMP ${index + 1}`;",
    "if (this.performanceMode() === 'sampler') return `${this.samplerCategory().substring(0, 3).toUpperCase()} ${index + 1}`;"
)

with open(file_path, 'w') as f:
    f.write(content)
