import sys

file_path = 'src/app/studio/piano-roll/piano-roll.component.ts'
with open(file_path, 'r') as f:
    content = f.read()

new_methods = """
  toggleGhostNotes() {
    this.showGhostNotes.update(v => !v);
  }

  setScale(scaleName: string) {
    const scales: Record<string, number[]> = {
      'C Major': [0, 2, 4, 5, 7, 9, 11],
      'C Minor': [0, 2, 3, 5, 7, 8, 10],
      'Pentatonic': [0, 2, 4, 7, 9],
      'Blues': [0, 3, 5, 6, 7, 10]
    };
    if (scales[scaleName]) {
      this.selectedScale.set({ name: scaleName, notes: scales[scaleName] });
    }
  }
"""

if 'toggleGhostNotes' not in content:
    insertion_point = content.find('generateSequence(type: string) {')
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
