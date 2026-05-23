import sys

file_path = 'src/app/studio/piano-roll/piano-roll.component.ts'
with open(file_path, 'r') as f:
    content = f.read()

new_methods = """
  strumSelected() {
    const track = this.selectedTrack();
    if (!track) return;
    this.musicManager.strumTrack(track.id, 0.05);
  }

  arpeggiateSelected() {
    const track = this.selectedTrack();
    if (!track) return;
    this.musicManager.arpeggiateTrack(track.id);
  }
"""

if 'strumSelected' not in content:
    insertion_point = content.find('humanizeSelected() {')
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
