import sys

file_path = 'src/app/studio/piano-roll/piano-roll.component.ts'
with open(file_path, 'r') as f:
    content = f.read()

new_fields = """
  showGhostNotes = signal(true);

  ghostNotes = computed(() => {
    if (!this.showGhostNotes()) return [];
    const currentId = this.musicManager.selectedTrackId();
    return this.musicManager.tracks()
      .filter(t => t.id !== currentId)
      .flatMap(t => t.notes.map(n => ({ ...n, trackColor: t.color })));
  });
"""

if 'showGhostNotes =' not in content:
    insertion_point = content.find('viewportNotes = computed(() => {')
    if insertion_point != -1:
        content = content[:insertion_point] + new_fields + content[insertion_point:]

with open(file_path, 'w') as f:
    f.write(content)
