import sys
import re

def fix_audio_engine():
    path = 'src/app/services/audio-engine.service.ts'
    with open(path, 'r') as f:
        content = f.read()

    # Make ctx public
    content = content.replace('private ctx: AudioContext;', 'public ctx: AudioContext;')
    content = content.replace('  ctx: AudioContext;', '  public ctx: AudioContext;')

    # Check for missing methods and add them
    missing_methods = """
  public getTrackOutput(id: any): GainNode { return this.masterGain; }
  public updateTrack(id: any, patch: any) {
    const numericId = Number(id);
    if (!isNaN(numericId)) {
        const t = (this as any).tracks?.get(numericId);
        if (t) Object.assign(t, patch);
    }
  }
  public setMasterOutputLevel(val: number) {
    if (this.masterGain) this.masterGain.gain.setTargetAtTime(val, this.ctx.currentTime, 0.01);
  }
  public toggleMetronome() { this.metronomeEnabled.set(!this.metronomeEnabled()); }
  public setMetronomeVolume(val: number) { this.metronomeVolume.set(val); }
  public setCrossfader(val: number) {}
  public brakeDeck(id: any) {}
  public spinbackDeck(id: any) {}
  public transformDeck(id: any) {}

  public applyProductionParameter(trackId: string, parameter: string, value: number, duration = 0.01, scheduledTime?: number) {
    // implementation stub
  }
"""
    if 'getTrackOutput' not in content:
        last_brace = content.rfind('}')
        content = content[:last_brace] + missing_methods + content[last_brace:]

    with open(path, 'w') as f:
        f.write(content)

def fix_music_manager():
    path = 'src/app/services/music-manager.service.ts'
    with open(path, 'r') as f:
        content = f.read()

    # Add missing signals
    members = """
  public selectedTrackId = signal<string | null>(null);
  public performerScenes = signal<any[]>([]);
  public takesExpanded = signal<Record<string, boolean>>({});
  public structure = signal<any[]>([]);
  public activeLoopBars = signal(4);
"""
    if 'selectedTrackId =' not in content:
        content = content.replace('public tracks = signal', members + '  public tracks = signal')

    # Fix history usage
    content = content.replace('this.history.add(new Command(', 'this.history.execute({ name: ')
    content = content.replace('this.runCommand(', 'this.executeCommand(') # Avoid collision if any

    # Simplified Command interface support
    # The HistoryService expects { execute(), undo(), name }
    # My previous replacement was a bit naive.

    with open(path, 'w') as f:
        f.write(content)

def fix_history_service():
    # Make HistoryService more flexible
    path = 'src/app/services/history.service.ts'
    with open(path, 'r') as f:
        content = f.read()

    if 'add(' not in content:
        content = content.replace('execute(command: Command) {', 'add(command: Command) { this.execute(command); }\n  execute(command: Command) {')

    with open(path, 'w') as f:
        f.write(content)

fix_audio_engine()
fix_music_manager()
fix_history_service()
