import sys

file_path = 'src/app/services/music-manager.service.ts'
with open(file_path, 'r') as f:
    content = f.read()

new_methods = """
  generateChord(trackId: number, rootMidi: number, type: string, step: number) {
    const intervals: Record<string, number[]> = {
      'major': [0, 4, 7],
      'minor': [0, 3, 7],
      'maj7': [0, 4, 7, 11],
      'min7': [0, 3, 7, 10],
      'dom7': [0, 4, 7, 10],
      'sus2': [0, 2, 7],
      'sus4': [0, 5, 7],
      'dim': [0, 3, 6],
    };
    const chordNotes = (intervals[type] || [0]).map(interval => ({
      id: `note-${Date.now()}-${Math.random()}`,
      midi: rootMidi + interval,
      step: step,
      length: 1,
      velocity: 0.8
    }));

    this.tracks.update(ts => ts.map(t => {
      if (t.id !== trackId) return t;
      return { ...t, notes: [...t.notes, ...chordNotes] };
    }));
  }

  setNoteParam(trackId: number, noteId: string, param: string, value: any) {
    this.tracks.update(ts => ts.map(t => {
      if (t.id !== trackId) return t;
      return {
        ...t,
        notes: t.notes.map(n => n.id === noteId ? { ...n, [param]: value } : n)
      };
    }));
  }
"""

if 'generateChord' not in content:
    insertion_point = content.find('strumTrack(trackId: number, strength: number = 0.05) {')
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
