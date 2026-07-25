import {
  Component,
  inject,
  signal,
  computed,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { AudioSessionService } from '../audio-session.service';
import { MusicManagerService } from '../../services/music-manager.service';
import { HapticService } from '../../services/haptic.service';
import { SnackbarService } from '../../services/snackbar.service';

interface SessionScene {
  id: string;
  name: string;
  color: string;
  index: number;
}

interface SessionClip {
  id: string;
  name: string;
  trackId: string;
  sceneId: string;
  isPlaying: boolean;
  color: string;
  duration?: string;
  /** Velocity 0-1 for dynamics-sensitive triggering */
  velocity?: number;
}

@Component({
  selector: 'app-session-view',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './session-view.component.html',
  styleUrls: ['./session-view.component.css'],
})
export class SessionViewComponent {
  private audioSession = inject(AudioSessionService);
  private musicManager = inject(MusicManagerService);
  private haptic = inject(HapticService);
  private snackbar = inject(SnackbarService);

  micChannels = this.audioSession.micChannels;

  // ── Scenes ───────────────────────────────────────────
  scenes = signal<SessionScene[]>([
    { id: 'intro',   name: 'Intro',    color: '#0E7C7B', index: 0 },
    { id: 'verse',   name: 'Verse',    color: '#2BA09C', index: 1 },
    { id: 'chorus',  name: 'Chorus',   color: '#5DC4C2', index: 2 },
    { id: 'bridge',  name: 'Bridge',   color: '#8B5CF6', index: 3 },
    { id: 'outro',   name: 'Outro',    color: '#FF1A8C', index: 4 },
  ]);

  activeSceneId = signal<string | null>(null);

  // ── Clip slots ───────────────────────────────────────
  clips = signal<SessionClip[]>([
    // Row: Intro
    { id: 'c1',  name: 'Kick Loop',   trackId: 't1', sceneId: 'intro',  isPlaying: false, color: '#FFB627', duration: '4 bars' },
    { id: 'c2',  name: 'Bass Line',   trackId: 't2', sceneId: 'intro',  isPlaying: false, color: '#00E5FF', duration: '8 bars' },
    { id: 'c3',  name: 'Pad Swell',   trackId: 't3', sceneId: 'intro',  isPlaying: false, color: '#A5F8FF', duration: '8 bars' },
    // Row: Verse
    { id: 'c4',  name: 'Kick Loop',   trackId: 't1', sceneId: 'verse',  isPlaying: false, color: '#FFB627', duration: '4 bars' },
    { id: 'c5',  name: 'Snare Roll',  trackId: 't4', sceneId: 'verse',  isPlaying: false, color: '#FF8A3D', duration: '2 bars' },
    { id: 'c6',  name: 'Bass Line',   trackId: 't2', sceneId: 'verse',  isPlaying: false, color: '#00E5FF', duration: '8 bars' },
    { id: 'c7',  name: 'Vocal Chops', trackId: 't5', sceneId: 'verse',  isPlaying: false, color: '#EC4899', duration: '4 bars' },
    // Row: Chorus
    { id: 'c8',  name: 'Full Beat',   trackId: 't1', sceneId: 'chorus', isPlaying: false, color: '#FFB627', duration: '8 bars' },
    { id: 'c9',  name: 'Bass Drop',   trackId: 't2', sceneId: 'chorus', isPlaying: false, color: '#00E5FF', duration: '8 bars' },
    { id: 'c10', name: 'Lead Synth',  trackId: 't6', sceneId: 'chorus', isPlaying: false, color: '#FF1A4D', duration: '8 bars' },
    { id: 'c11', name: 'FX Rise',     trackId: 't7', sceneId: 'chorus', isPlaying: false, color: '#8B5CF6', duration: '1 bar' },
    // Row: Bridge
    { id: 'c12', name: 'Ambient Pad', trackId: 't3', sceneId: 'bridge', isPlaying: false, color: '#A5F8FF', duration: '8 bars' },
    { id: 'c13', name: 'FX Wash',     trackId: 't7', sceneId: 'bridge', isPlaying: false, color: '#8B5CF6', duration: '4 bars' },
    // Row: Outro
    { id: 'c14', name: 'Fade Loop',   trackId: 't1', sceneId: 'outro',  isPlaying: false, color: '#FFB627', duration: '8 bars' },
    { id: 'c15', name: 'End Pad',     trackId: 't3', sceneId: 'outro',  isPlaying: false, color: '#A5F8FF', duration: '16 bars' },
  ]);

  // ── Tracks (derived from music manager) ─────────────
  tracks = this.musicManager.tracks;

  // Computed: unique track IDs from clips, mapped to track data
  clipTracks = computed(() => {
    const trackIds = [...new Set(this.clips().map((c) => c.trackId))];
    return trackIds.map((tid) => {
      const t = this.tracks().find((tr) => tr.id === tid);
      return {
        id: tid,
        name: t?.name ?? tid.toUpperCase(),
        type: t?.instrumentId ?? 'audio',
        isMuted: false,
      };
    });
  });

  // Computed: get clips for a scene row
  getClipsForScene(sceneId: string): SessionClip[] {
    return this.clips().filter((c) => c.sceneId === sceneId);
  }

  hasClipsForScene(sceneId: string): boolean {
    return this.getClipsForScene(sceneId).length > 0;
  }

  // ── Actions ─────────────────────────────────────────
  launchScene(scene: SessionScene): void {
    this.haptic.medium();
    this.activeSceneId.set(this.activeSceneId() === scene.id ? null : scene.id);

    // Simulate clip playback for this scene
    this.clips.update((list) =>
      list.map((c) => ({
        ...c,
        isPlaying: c.sceneId === scene.id && this.activeSceneId() === scene.id,
      }))
    );

    if (this.activeSceneId() === scene.id) {
      this.snackbar.info(`Scene "${scene.name}" launched`);
    } else {
      this.snackbar.info(`Scene "${scene.name}" stopped`);
    }
  }

  /** Trigger a clip with optional velocity (0-1) */
  triggerClip(clip: SessionClip, velocity: number = 0.85): void {
    this.haptic.light();
    const clampedVel = Math.max(0, Math.min(1, velocity));
    this.clips.update((list) =>
      list.map((c) =>
        c.id === clip.id ? { ...c, isPlaying: !c.isPlaying, velocity: clampedVel } : c
      )
    );
    this.snackbar.info(
      `${clip.name} ${clip.isPlaying ? 'playing' : 'paused'} · vel ${Math.round(clampedVel * 100)}%`
    );
  }

  addScene(): void {
    this.haptic.light();
    const idx = this.scenes().length;
    const colors = ['#0E7C7B', '#2BA09C', '#8B5CF6', '#FF1A8C', '#FFB627', '#00E5FF'];
    this.scenes.update((list) => [
      ...list,
      {
        id: `scene-${idx + 1}`,
        name: `Scene ${idx + 1}`,
        color: colors[idx % colors.length],
        index: idx,
      },
    ]);
    this.snackbar.success('New scene added');
  }

  // ── Drag-to-track drop zone ──────────────────────────
  dragOverTrackId = signal<string | null>(null);
  dragOverSlotKey = signal<string | null>(null);

  onDragOver(event: DragEvent, trackId: string): void {
    event.preventDefault();
    event.dataTransfer!.dropEffect = 'copy';
    this.dragOverTrackId.set(trackId);
  }

  onDragLeave(): void {
    this.dragOverTrackId.set(null);
  }

  onDrop(event: DragEvent, trackId: string): void {
    event.preventDefault();
    this.dragOverTrackId.set(null);
    const raw = event.dataTransfer?.getData('application/smuve-sample');
    if (!raw) return;
    try {
      const { id, name } = JSON.parse(raw);
      this.haptic.medium();
      this.musicManager.ensureTrack(id);
      this.snackbar.success(`${name} → track`);
    } catch {
      // invalid payload — ignore
    }
  }

  // ── Drag-to-clip-slot ─────────────────────────────────
  onSlotDragOver(event: DragEvent, sceneId: string, trackId: string): void {
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer!.dropEffect = 'copy';
    this.dragOverSlotKey.set(`${sceneId}|${trackId}`);
  }

  onSlotDragLeave(): void {
    this.dragOverSlotKey.set(null);
  }

  onSlotDrop(event: DragEvent, sceneId: string, trackId: string): void {
    event.preventDefault();
    event.stopPropagation();
    this.dragOverSlotKey.set(null);
    const raw = event.dataTransfer?.getData('application/smuve-sample');
    if (!raw) return;
    try {
      const { id, name } = JSON.parse(raw);
      this.haptic.medium();
      // Create a new clip in this slot
      this.clips.update((list) => [
        ...list,
        {
          id: `clip-${Date.now()}`,
          name,
          trackId,
          sceneId,
          isPlaying: false,
          color: '#5DC4C2',
          duration: '4 bars',
          velocity: 0.8,
        },
      ]);
      this.snackbar.success(`${name} → clip in ${sceneId}`);
    } catch {
      // invalid payload — ignore
    }
  }

  // ── Session Presets (Save/Load) ──────────────────────
  savedPresets = signal<Array<{ name: string; scenes: SessionScene[]; clips: SessionClip[] }>>([]);
  presetNameInput = signal('');
  presetLoadOpen = signal(false);

  ngOnInit_(): void {
    this.loadPresetList();
  }

  private loadPresetList(): void {
    try {
      const raw = localStorage.getItem('smuve_session_presets');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) this.savedPresets.set(parsed);
      }
    } catch {}
  }

  private savePresetList(): void {
    try {
      localStorage.setItem('smuve_session_presets', JSON.stringify(this.savedPresets()));
    } catch {}
  }

  savePreset(): void {
    const name = this.presetNameInput().trim() || `Preset ${this.savedPresets().length + 1}`;
    const preset = {
      name,
      scenes: this.scenes().map((s) => ({ ...s })),
      clips: this.clips().map((c) => ({ ...c, isPlaying: false })),
    };
    this.savedPresets.update((list) => {
      const filtered = list.filter((p) => p.name !== name);
      return [...filtered, preset];
    });
    this.savePresetList();
    this.presetNameInput.set('');
    this.haptic.medium();
    this.snackbar.success(`Preset "${name}" saved`);
  }

  loadPreset(name: string): void {
    const preset = this.savedPresets().find((p) => p.name === name);
    if (!preset) return;
    this.scenes.set(preset.scenes.map((s, i) => ({ ...s, index: i })));
    this.clips.set(preset.clips.map((c) => ({ ...c, isPlaying: false })));
    this.activeSceneId.set(null);
    this.presetLoadOpen.set(false);
    this.haptic.medium();
    this.snackbar.success(`Preset "${name}" loaded`);
  }

  deletePreset(name: string): void {
    this.savedPresets.update((list) => list.filter((p) => p.name !== name));
    this.savePresetList();
    this.snackbar.info(`Preset "${name}" deleted`);
  }

  muteTrack(trackId: string): void {
    this.haptic.light();
    this.snackbar.info(`Track ${trackId} muted`);
  }

  trackByScene = (_i: number, s: SessionScene) => s.id;
  trackByClip = (_i: number, c: SessionClip) => c.id;
  trackByTrackId = (_i: number, t: { id: string }) => t.id;
}
