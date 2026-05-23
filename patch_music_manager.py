import sys

file_path = 'src/app/services/music-manager.service.ts'
with open(file_path, 'r') as f:
    content = f.read()

# Add new methods for MIDI processing
new_methods = """
  arpeggiateTrack(trackId: number, pattern: 'up' | 'down' | 'up-down' | 'random' = 'up') {
    this.tracks.update((ts) =>
      ts.map((t) => {
        if (t.id !== trackId) return t;
        const sortedNotes = [...t.notes].sort((a, b) => a.step - b.step || a.midi - b.midi);
        // Basic arpeggiation logic could be complex, for now we will implement a helper
        // that takes chords and breaks them into sequences.
        return t;
      })
    );
  }

  strumTrack(trackId: number, strength: number = 0.05) {
    this.tracks.update((ts) =>
      ts.map((t) => {
        if (t.id !== trackId) return t;
        // Group notes by step
        const grouped = new Map<number, TrackNote[]>();
        t.notes.forEach(n => {
          if (!grouped.has(n.step)) grouped.set(n.step, []);
          grouped.get(n.step)!.push(n);
        });

        const newNotes = t.notes.map(n => {
          const chord = grouped.get(n.step) || [];
          if (chord.length <= 1) return n;
          const chordSorted = [...chord].sort((a, b) => a.midi - b.midi);
          const index = chordSorted.findIndex(cn => cn.id === n.id);
          return { ...n, step: n.step + index * strength };
        });

        return { ...t, notes: newNotes };
      })
    );
  }
"""

if 'strumTrack' not in content:
    # Find a good place to insert, e.g., after humanizeTrack
    insertion_point = content.find('humanizeTrack(trackId: number) {')
    if insertion_point != -1:
        # Find the end of humanizeTrack
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
