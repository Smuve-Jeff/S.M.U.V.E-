import sys

file_path = 'src/app/studio/piano-roll/piano-roll.component.ts'
with open(file_path, 'r') as f:
    content = f.read()

new_methods = """
  addChordAt(midi: number, step: number) {
    const track = this.selectedTrack();
    if (!track) return;
    this.musicManager.generateChord(track.id, midi, 'major', step);
  }

  setNoteVelocity(note: TrackNote, velocity: number) {
    const track = this.selectedTrack();
    if (!track) return;
    this.musicManager.setNoteParam(track.id, note.id, 'velocity', velocity);
  }

  setNoteOffset(note: TrackNote, offset: number) {
    const track = this.selectedTrack();
    if (!track) return;
    this.musicManager.setNoteParam(track.id, note.id, 'offset', offset);
  }

  toggleNoteSlide(note: TrackNote) {
    const track = this.selectedTrack();
    if (!track) return;
    this.musicManager.setNoteParam(track.id, note.id, 'isSlide', !note.isSlide);
  }
"""

if 'addChordAt' not in content:
    insertion_point = content.find('arpeggiateSelected() {')
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
