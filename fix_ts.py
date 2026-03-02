import sys

file_path = 'src/app/components/dj-deck/dj-deck.component.ts'
with open(file_path, 'r') as f:
    content = f.read()

new_properties = """
  pitchAPercentage = computed(
    () => `${(this.deckService.deckA().playbackRate * 100).toFixed(1)}%`
  );
  pitchBPercentage = computed(
    () => `${(this.deckService.deckB().playbackRate * 100).toFixed(1)}%`
  );
"""

# Insert before constructor
content = content.replace("constructor(", new_properties + "\\n  constructor(")

with open(file_path, 'w') as f:
    f.write(content)
