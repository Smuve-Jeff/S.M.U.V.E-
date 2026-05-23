import sys

file_path = 'src/app/services/music-manager.service.ts'
with open(file_path, 'r') as f:
    content = f.read()

# Add setSidechain method to MusicManagerService as it is used in Mixer
new_method = """
  setSidechain(trackId: number, targetId: string | null) {
    this.tracks.update(ts => ts.map(t => {
      if (t.id !== trackId) return t;
      return { ...t, sidechainTargetTrackId: targetId };
    }));
    // Note: Audio engine would need to be updated to actually route the sidechain
    // In this upgraded version, we ensure the state is correctly managed.
    if (targetId) {
      this.engine.connectSidechain(targetId, trackId.toString());
    } else {
      // Logic for disconnecting would go here
    }
  }
"""

if 'setSidechain(trackId: number, targetId: string | null)' not in content:
    insertion_point = content.find('setActivePatternSlot(trackId: number, slotId: string) {')
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
