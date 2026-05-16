import re

with open('src/app/services/music-manager.service.ts', 'r') as f:
    content = f.read()

missing_methods = """
  addTrack(name: string, instrumentId: string) {
    const id = Math.max(0, ...this.tracks().map(t => t.id)) + 1;
    const newTrack: TrackModel = {
      id,
      name,
      instrumentId,
      notes: [],
      steps: new Array(64).fill(false),
      gain: 0.8,
      pan: 0,
      sendA: 0,
      sendB: 0,
      mute: false,
      solo: false,
      clips: [],
      qualityMode: 'ultra',
      fxSlots: []
    };
    this.tracks.update(ts => [...ts, newTrack]);
    this.selectedTrackId.set(id);
    return id;
  }

  ensureTrack(instrumentId: string): number {
    const existing = this.tracks().find(t => t.instrumentId === instrumentId);
    if (existing) return existing.id;
    return this.addTrack(`Track ${instrumentId}`, instrumentId);
  }

  deleteNoteById(noteId: string) {
    this.tracks.update(ts => ts.map(t => ({
      ...t,
      notes: t.notes.filter(n => n.id !== noteId)
    })));
  }

  setInstrument(trackId: number, instrumentId: string) {
    this.tracks.update(ts => ts.map(t =>
      t.id === trackId ? { ...t, instrumentId } : t
    ));
  }

  removeTrack(trackId: number) {
    this.tracks.update(ts => ts.filter(t => t.id !== trackId));
    if (this.selectedTrackId() === trackId) {
      this.selectedTrackId.set(this.tracks()[0]?.id || null);
    }
  }
"""

# Insert before normalizeTrack or near other track methods
if 'addTrack(name: string' not in content:
    content = content.replace('  private normalizeTrack', missing_methods + '\n  private normalizeTrack')

with open('src/app/services/music-manager.service.ts', 'w') as f:
    f.write(content)

print("Updated MusicManagerService with missing methods.")
