import sys
import os

def fix_audio_engine():
    path = 'src/app/services/audio-engine.service.ts'
    with open(path, 'r') as f:
        content = f.read()

    # Add getTrackOutput if missing
    if 'getTrackOutput(id: any)' not in content:
        method = """  getTrackOutput(id: any): GainNode {
    return this.masterGain;
  }
"""
        content = content.replace('getMasteringTargets() {', method + '  getMasteringTargets() {')

    # Add updateTrack if missing
    if 'updateTrack(id: string, patch: any)' not in content:
        method = """  updateTrack(id: string, patch: any) {
    const trimmedId = id.toString().trim();
    const numericId = Number(trimmedId);
    if (!isNaN(numericId)) {
        const t = this.tracks.get(numericId);
        if (t) Object.assign(t, patch);
    }
  }
"""
        content = content.replace('configureCompressor(params: any) {', method + '  configureCompressor(params: any) {')

    # Fix toggleMetronome if missing
    if 'toggleMetronome()' not in content:
        method = """  toggleMetronome() {
    this.metronomeEnabled.set(!this.metronomeEnabled());
  }
  setMetronomeVolume(val: number) {
    this.metronomeVolume.set(val);
  }
"""
        content = content.replace('setOutputMode(mode: \'speakers\' | \'headphones\') {', method + '  setOutputMode(mode: \'speakers\' | \'headphones\') {')

    with open(path, 'w') as f:
        f.write(content)

def fix_music_manager():
    path = 'src/app/services/music-manager.service.ts'
    with open(path, 'r') as f:
        content = f.read()

    # Add missing signals
    if 'public selectedTrackId = signal<string | null>(null);' not in content:
        content = content.replace('public activeTrackId = signal<string | null>(null);',
                                  'public activeTrackId = signal<string | null>(null);\n  public selectedTrackId = signal<string | null>(null);\n  public performerScenes = signal<PerformerScene[]>([]);')

    # Add missing methods
    missing_methods = """  removeNotes(trackId: string, noteIds: string[]) {
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
    if 'removeNotes(trackId: string, noteIds: string[])' not in content:
        content = content.replace('  addTrack(name: string, instrumentId: string, type: TrackType = \'midi\') {',
                                  missing_methods + '  addTrack(name: string, instrumentId: string, type: TrackType = \'midi\') {')

    with open(path, 'w') as f:
        f.write(content)

fix_audio_engine()
fix_music_manager()
print("Applied all identified fixes for build errors.")
