import sys

path = 'src/app/services/music-manager.service.ts'
with open(path, 'r') as f:
    content = f.read()

# Add missing signals for build compatibility
if 'public selectedTrackId = signal<string | null>(null);' not in content:
    content = content.replace('public activeTrackId = signal<string | null>(null);',
                              'public activeTrackId = signal<string | null>(null);\n  public selectedTrackId = signal<string | null>(null);\n  public performerScenes = signal<any[]>([]);')

# Add missing methods found in build errors
missing = """
  removeNotes(trackId: string, noteIds: string[]) {
    this.tracks.update(ts => ts.map(t => t.id === trackId ? { ...t, notes: t.notes.filter(n => !noteIds.includes(n.id)) } : t));
  }
  addNoteToTrack(trackId: string, note: any) {
    this.tracks.update(ts => ts.map(t => t.id === trackId ? { ...t, notes: [...t.notes, note] } : t));
  }
  updateNote(trackId: string, noteId: string, patch: any) {
    this.tracks.update(ts => ts.map(t => t.id === trackId ? { ...t, notes: t.notes.map(n => n.id === noteId ? { ...n, ...patch } : n) } : t));
  }
  ensureTrack(instrumentId: string) {
    const existing = this.tracks().find(t => t.instrumentId === instrumentId);
    if (existing) return existing.id;
    return this.addTrack('New ' + instrumentId, instrumentId);
  }
"""

if 'removeNotes(trackId: string' not in content:
    content = content.replace('  addTrack(name: string, instrumentId: string, type: TrackType = \'midi\') {',
                              missing + '  addTrack(name: string, instrumentId: string, type: TrackType = \'midi\') {')

with open(path, 'w') as f:
    f.write(content)
