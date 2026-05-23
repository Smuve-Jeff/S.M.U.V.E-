import sys

file_path = 'src/app/studio/drum-machine/drum-machine.component.ts'
with open(file_path, 'r') as f:
    content = f.read()

new_method = """
  addAutomation(param: string) {
    const trackId = this.selectedTrackId();
    if (trackId) {
      this.musicManager.addAutomationLane(trackId, param);
    }
  }
"""

if 'addAutomation(param: string)' not in content:
    insertion_point = content.find('selectPad(pad: DrumPad) {')
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
                    content = content[:i+1] + new_method + content[i+1:]
                    break

with open(file_path, 'w') as f:
    f.write(content)
