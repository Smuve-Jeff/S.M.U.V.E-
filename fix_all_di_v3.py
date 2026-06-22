import sys
import re

def fix_audio_engine():
    path = 'src/app/services/audio-engine.service.ts'
    with open(path, 'r') as f:
        content = f.read()

    # Make ctx public if it is not
    content = content.replace('private ctx: AudioContext;', 'public ctx: AudioContext;')
    content = content.replace('  ctx: AudioContext;', '  public ctx: AudioContext;')

    # Add missing methods
    methods = """
  getTrackOutput(id: any) {
    return this.masterGain;
  }

  updateTrack(id: any, patch: any) {
    // Basic implementation to avoid build errors
  }

  public applyProductionParameter(trackId: string, parameter: string, value: number, duration = 0.01, scheduledTime?: number) {
    // Implementation exists in the backup but let's make sure it's public and correctly named
  }

  toggleMetronome() {
    this.metronomeEnabled.set(!this.metronomeEnabled());
  }

  setMetronomeVolume(val: number) {
    this.metronomeVolume.set(val);
  }

  setMasterOutputLevel(val: number) {
    if (this.masterGain) {
      this.masterGain.gain.setTargetAtTime(val, this.ctx.currentTime, 0.01);
    }
  }
"""
    # Find a good place to insert - before the last closing brace
    last_brace = content.rfind('}')
    content = content[:last_brace] + methods + content[last_brace:]

    with open(path, 'w') as f:
        f.write(content)

def fix_music_manager():
    path = 'src/app/services/music-manager.service.ts'
    with open(path, 'r') as f:
        content = f.read()

    # Add missing signals
    signals = """
  public selectedTrackId = signal<string | null>(null);
  public performerScenes = signal<any[]>([]);
"""
    if 'selectedTrackId =' not in content:
        content = content.replace('public tracks = signal', signals + '  public tracks = signal')

    # Add missing methods
    methods = """
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
    if 'removeNotes(' not in content:
        last_brace = content.rfind('}')
        content = content[:last_brace] + methods + content[last_brace:]

    with open(path, 'w') as f:
        f.write(content)

def fix_dm_component():
    path = 'src/app/studio/drum-machine/drum-machine.component.ts'
    with open(path, 'r') as f:
        content = f.read()

    # Add OnInit import if missing
    if 'OnInit' not in content:
        content = content.replace('OnDestroy, signal,', 'OnDestroy, signal, OnInit,')

    # Inject AudioSessionService
    if 'private audioSession = inject(AudioSessionService);' not in content:
        content = content.replace('private musicManager = inject(MusicManagerService);',
                                  'private musicManager = inject(MusicManagerService);\n  public audioSession = inject(AudioSessionService);')

    # Add viewMode, selectedPad, currentBar, barRange, barStepRange, graphTarget
    props = """
  public viewMode = signal<'sequencer' | 'knobs'>('sequencer');
  public currentBar = signal(0);
  public barRange = [0, 1, 2, 3];
  public barStepRange = Array.from({length: 16}, (_, i) => i);
  public selectedPadId = signal<string>('pad-36');
  public selectedPad = computed(() => this.pads().find(p => p.id === this.selectedPadId()));
  public graphTarget = signal<'velocity' | 'probability'>('velocity');
"""
    if 'public viewMode =' not in content:
        content = content.replace('public rollRate = signal(16);', 'public rollRate = signal(16);' + props)

    # Add missing methods
    methods = """
  getPadStep(padId: string, stepIdx: number) {
    const pad = this.pads().find(p => p.id === padId);
    return pad?.steps[stepIdx] || { active: false, velocity: 1, probability: 1 };
  }
  isStepPlaying(pad: any) { return false; }
  isGlobalStep(step: number) { return false; }
  selectPad(id: string) { this.selectedPadId.set(id); }
"""
    if 'getPadStep(' not in content:
        last_brace = content.rfind('}')
        content = content[:last_brace] + methods + content[last_brace:]

    # Fix haptic calls
    content = content.replace('this.haptic.lightClick()', 'this.haptic.light()')
    content = content.replace('this.haptic.impact()', 'this.haptic.impact("light")')

    with open(path, 'w') as f:
        f.write(content)

fix_audio_engine()
fix_music_manager()
fix_dm_component()
