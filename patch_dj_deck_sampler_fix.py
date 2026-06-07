import os
import re

file_path = 'src/app/studio/dj-deck/dj-deck.component.ts'
with open(file_path, 'r') as f:
    content = f.read()

# Update clearPad to pass category
content = content.replace("this.deckService.clearSamplerPad(deck, index);", "this.deckService.clearSamplerPad(deck, index, this.samplerCategory());")

# Update handlePadPress to pass category to setSamplerPad
content = content.replace("this.deckService.setSamplerPad(deck, index);", "this.deckService.setSamplerPad(deck, index, this.samplerCategory());")

# Update triggerSamplerPad to use categorized samplerPads
trigger_pattern = r'const\ cuePosition\ =\ deckState\.samplerPads\[index\];'
new_trigger = "const cuePosition = deckState.samplerPads[this.samplerCategory()][index];"
content = re.sub(trigger_pattern, new_trigger, content)

# Update buildSessionSnapshot for categorized samplerPads
snapshot_pattern = r'samplerPads:\ \[\.\.\.deck\.samplerPads\],'
new_snapshot = "samplerPads: { ...deck.samplerPads },"
content = re.sub(snapshot_pattern, new_snapshot, content)

with open(file_path, 'w') as f:
    f.write(content)
