import sys

file_path = 'src/app/services/music-manager.service.ts'
with open(file_path, 'r') as f:
    content = f.read()

new_methods = """
  setActivePatternSlot(trackId: number, slotId: string) {
    this.tracks.update(ts => ts.map(t => {
      if (t.id !== trackId) return t;
      return { ...t, activePatternSlotId: slotId };
    }));
  }
"""

if 'setActivePatternSlot' not in content:
    insertion_point = content.find('recordLiveNote(note: string, velocity: number) {')
    if insertion_point != -1:
        bracket_count = 0
        started = False
        for i in range(insertion_point, len(content)):
            if content[i] == '{':
                bracket_count += 1
                started = True
            elif content[i] == '}':
                bracket_count -= 1
                if started and bracket_count == 0:
                    content = content[:i+1] + new_methods + content[i+1:]
                    break

with open(file_path, 'w') as f:
    f.write(content)
