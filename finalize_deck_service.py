import sys

file_path = 'src/app/services/deck.service.ts'
with open(file_path, 'r') as f:
    content = f.read()

# Update loadDeckBuffer to reset hotCues
old_load = """    if (deck === 'A') {
      this.deckA.update((d) => ({
        ...d,
        track: { ...d.track, name: fileName, url: '' },
        duration: buffer.duration,
      }));
    } else {
      this.deckB.update((d) => ({
        ...d,
        track: { ...d.track, name: fileName, url: '' },
        duration: buffer.duration,
      }));
    }"""

new_load = """    if (deck === 'A') {
      this.deckA.update((d) => ({
        ...d,
        track: { ...d.track, name: fileName, url: '' },
        duration: buffer.duration,
        hotCues: new Array(8).fill(null),
        progress: 0
      }));
    } else {
      this.deckB.update((d) => ({
        ...d,
        track: { ...d.track, name: fileName, url: '' },
        duration: buffer.duration,
        hotCues: new Array(8).fill(null),
        progress: 0
      }));
    }"""

content = content.replace(old_load, new_load)

# Add periodic progress sync
new_methods = """
  syncProgress() {
    const progA = this.engine.getDeckProgress('A');
    const progB = this.engine.getDeckProgress('B');
    this.deckA.update(d => ({ ...d, progress: progA.position, isPlaying: progA.isPlaying }));
    this.deckB.update(d => ({ ...d, progress: progB.position, isPlaying: progB.isPlaying }));
  }
"""

if content.endswith('}\n'):
    content = content[:-2] + new_methods + '}\n'
elif content.endswith('}'):
    content = content[:-1] + new_methods + '}\n'

with open(file_path, 'w') as f:
    f.write(content)
