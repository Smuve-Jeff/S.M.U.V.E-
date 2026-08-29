import { Component, inject, signal, computed, OnInit, OnDestroy } from '@angular/core';
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

type AutomationCurveType = 'linear' | 'exponential' | 'step';

interface AutomationPoint {
  /** Bar position (e.g. 0.0, 1.5, 3.0) */
  position: number;
  /** Value 0-1 */
  value: number;
  /** Parameter target */
  target: string;
  /** Interpolation curve between this point and the next */
  curveType?: AutomationCurveType;
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
  /** Automation lanes for this clip */
  automation?: AutomationPoint[];
}

@Component({
  selector: 'app-session-view',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './session-view.component.html',
  styleUrls: ['./session-view.component.css'],
})
export class SessionViewComponent implements OnInit, OnDestroy {
  private audioSession = inject(AudioSessionService);
  private musicManager = inject(MusicManagerService);
  private haptic = inject(HapticService);
  private snackbar = inject(SnackbarService);

  // ── Song-mode transport ────────────────────────────────
  /** Launch quantization: snap scene/clip starts to the next bar boundary. */
  launchQuantize = signal<'none' | '1bar' | '2bar' | '4bar'>('none');
  quantizeOptions = ['none', '1bar', '2bar', '4bar'] as const;

  /** Follow-on: auto-advance to the next scene after the active one ends. */
  followOnEnabled = signal(false);

  /** Clips queued to start on the next quantized boundary. */
  queuedClipIds = signal<Set<string>>(new Set());

  private followTimer: ReturnType<typeof setTimeout> | null = null;
  private quantizeTimer: ReturnType<typeof setTimeout> | null = null;

  readonly transportPlaying = this.audioSession.isPlaying;

  ngOnInit(): void {
    this.loadPresetList();
    if (!this.restoreAutoSave()) {
      this.snackbar.info('New session — no auto-save found');
    }
  }

  ngOnDestroy(): void {
    if (this.followTimer) clearTimeout(this.followTimer);
    if (this.quantizeTimer) clearTimeout(this.quantizeTimer);
    if (this.autoSaveTimer) clearTimeout(this.autoSaveTimer);
  }

  /** Seconds until the next quantized bar boundary (0 when off/stopped). */
  private nextBarDelay(): number {
    if (this.launchQuantize() === 'none' || !this.audioSession.isPlaying()) {
      return 0;
    }
    const bars = this.launchQuantize() === '1bar' ? 1 : this.launchQuantize() === '2bar' ? 2 : 4;
    const tempo = this.audioSession.engine.tempo() || 120;
    const secondsPerBar = (60 / tempo) * 4;
    const step = this.audioSession.engine.visualStep?.() ?? 0;
    const stepsPerBar = 16;
    const stepsIntoBar = step % stepsPerBar;
    const stepsToNext = (bars * stepsPerBar - stepsIntoBar) % (bars * stepsPerBar) || bars * stepsPerBar;
    return Math.max(0.05, (stepsToNext / stepsPerBar) * secondsPerBar);
  }

  /** Stop everything — all clips, the queue, follow-on, and transport. */
  stopAll(): void {
    this.haptic.medium();
    this.clips.update((list) => list.map((c) => ({ ...c, isPlaying: false })));
    this.queuedClipIds.set(new Set());
    this.activeSceneId.set(null);
    if (this.quantizeTimer) clearTimeout(this.quantizeTimer);
    if (this.followTimer) clearTimeout(this.followTimer);
    if (this.audioSession.isPlaying()) {
      this.audioSession.togglePlay();
    }
    this.snackbar.info('Session stopped');
  }

  micChannels = this.audioSession.micChannels;

  // ── Scenes ───────────────────────────────────────────
  scenes = signal<SessionScene[]>([
    { id: 'intro', name: 'Intro', color: '#0E7C7B', index: 0 },
    { id: 'verse', name: 'Verse', color: '#2BA09C', index: 1 },
    { id: 'chorus', name: 'Chorus', color: '#5DC4C2', index: 2 },
    { id: 'bridge', name: 'Bridge', color: '#8B5CF6', index: 3 },
    { id: 'outro', name: 'Outro', color: '#FF1A8C', index: 4 },
  ]);

  activeSceneId = signal<string | null>(null);

  // ── Clip slots ───────────────────────────────────────
  clips = signal<SessionClip[]>([
    // Row: Intro
    {
      id: 'c1',
      name: 'Kick Loop',
      trackId: 't1',
      sceneId: 'intro',
      isPlaying: false,
      color: '#FFB627',
      duration: '4 bars',
    },
    {
      id: 'c2',
      name: 'Bass Line',
      trackId: 't2',
      sceneId: 'intro',
      isPlaying: false,
      color: '#00E5FF',
      duration: '8 bars',
    },
    {
      id: 'c3',
      name: 'Pad Swell',
      trackId: 't3',
      sceneId: 'intro',
      isPlaying: false,
      color: '#A5F8FF',
      duration: '8 bars',
    },
    // Row: Verse
    {
      id: 'c4',
      name: 'Kick Loop',
      trackId: 't1',
      sceneId: 'verse',
      isPlaying: false,
      color: '#FFB627',
      duration: '4 bars',
    },
    {
      id: 'c5',
      name: 'Snare Roll',
      trackId: 't4',
      sceneId: 'verse',
      isPlaying: false,
      color: '#FF8A3D',
      duration: '2 bars',
    },
    {
      id: 'c6',
      name: 'Bass Line',
      trackId: 't2',
      sceneId: 'verse',
      isPlaying: false,
      color: '#00E5FF',
      duration: '8 bars',
    },
    {
      id: 'c7',
      name: 'Vocal Chops',
      trackId: 't5',
      sceneId: 'verse',
      isPlaying: false,
      color: '#EC4899',
      duration: '4 bars',
    },
    // Row: Chorus
    {
      id: 'c8',
      name: 'Full Beat',
      trackId: 't1',
      sceneId: 'chorus',
      isPlaying: false,
      color: '#FFB627',
      duration: '8 bars',
    },
    {
      id: 'c9',
      name: 'Bass Drop',
      trackId: 't2',
      sceneId: 'chorus',
      isPlaying: false,
      color: '#00E5FF',
      duration: '8 bars',
    },
    {
      id: 'c10',
      name: 'Lead Synth',
      trackId: 't6',
      sceneId: 'chorus',
      isPlaying: false,
      color: '#FF1A4D',
      duration: '8 bars',
    },
    {
      id: 'c11',
      name: 'FX Rise',
      trackId: 't7',
      sceneId: 'chorus',
      isPlaying: false,
      color: '#8B5CF6',
      duration: '1 bar',
    },
    // Row: Bridge
    {
      id: 'c12',
      name: 'Ambient Pad',
      trackId: 't3',
      sceneId: 'bridge',
      isPlaying: false,
      color: '#A5F8FF',
      duration: '8 bars',
    },
    {
      id: 'c13',
      name: 'FX Wash',
      trackId: 't7',
      sceneId: 'bridge',
      isPlaying: false,
      color: '#8B5CF6',
      duration: '4 bars',
    },
    // Row: Outro
    {
      id: 'c14',
      name: 'Fade Loop',
      trackId: 't1',
      sceneId: 'outro',
      isPlaying: false,
      color: '#FFB627',
      duration: '8 bars',
    },
    {
      id: 'c15',
      name: 'End Pad',
      trackId: 't3',
      sceneId: 'outro',
      isPlaying: false,
      color: '#A5F8FF',
      duration: '16 bars',
    },
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
    const isTogglingOff = this.activeSceneId() === scene.id;
    if (isTogglingOff) {
      this.activeSceneId.set(null);
      this.clips.update((list) =>
        list.map((c) =>
          c.sceneId === scene.id ? { ...c, isPlaying: false } : c
        )
      );
      this.scheduleAutoSave();
      this.snackbar.info(`Scene "${scene.name}" stopped`);
      return;
    }

    // Quantized launch: queue the scene to start on the next bar boundary
    const delay = this.nextBarDelay();
    if (delay > 0) {
      const queued = new Set(
        this.clips()
          .filter((c) => c.sceneId === scene.id)
          .map((c) => c.id)
      );
      this.queuedClipIds.set(queued);
      this.snackbar.info(
        `Scene "${scene.name}" queued — starts in ${delay.toFixed(2)}s`
      );
      this.quantizeTimer = setTimeout(() => {
        this.queuedClipIds.set(new Set());
        this.commitSceneLaunch(scene);
      }, delay * 1000);
      return;
    }

    this.commitSceneLaunch(scene);
  }

  /** Actually start a scene's clips (called directly or after quantization). */
  private commitSceneLaunch(scene: SessionScene): void {
    this.activeSceneId.set(scene.id);
    this.clips.update((list) =>
      list.map((c) => ({
        ...c,
        isPlaying: c.sceneId === scene.id,
      }))
    );
    this.scheduleAutoSave();
    this.snackbar.info(`Scene "${scene.name}" launched`);
    this.scheduleFollowOn(scene);
  }

  /** Follow-on: auto-advance to the next scene when this one's longest clip ends. */
  private scheduleFollowOn(scene: SessionScene): void {
    if (!this.followOnEnabled()) return;
    if (this.followTimer) clearTimeout(this.followTimer);
    const sceneClips = this.clips().filter((c) => c.sceneId === scene.id);
    if (sceneClips.length === 0) return;
    const longestBars = Math.max(
      1,
      ...sceneClips.map((c) => parseFloat(c.duration ?? '1') || 1)
    );
    const tempo = this.audioSession.engine.tempo() || 120;
    const ms = longestBars * (60 / tempo) * 4 * 1000;
    this.followTimer = setTimeout(() => {
      const idx = this.scenes().findIndex((s) => s.id === scene.id);
      const next = this.scenes()[idx + 1];
      if (next) {
        this.snackbar.info(`Follow-on → "${next.name}"`);
        this.commitSceneLaunch(next);
      } else {
        this.stopAll();
      }
    }, ms);
  }

  /** Trigger a clip with optional velocity (0-1) */
  triggerClip(clip: SessionClip, velocity: number = 0.85): void {
    this.haptic.light();
    const clampedVel = Math.max(0, Math.min(1, velocity));
    this.clips.update((list) =>
      list.map((c) =>
        c.id === clip.id
          ? { ...c, isPlaying: !c.isPlaying, velocity: clampedVel }
          : c
      )
    );
    this.scheduleAutoSave();
    this.snackbar.info(
      `${clip.name} ${clip.isPlaying ? 'playing' : 'paused'} · vel ${Math.round(clampedVel * 100)}%`
    );
  }

  /**
   * Template-safe percentage rounding. Angular template expressions compile
   * identifiers as context property reads (ctx.Math), so the global Math is
   * NOT accessible from templates — `{{ Math.round(x) }}` throws. Use this
   * helper in the template instead.
   */
  roundPct(value: number): number {
    return Math.round(value * 100);
  }

  // ── Automation Lanes ────────────────────────────────
  selectedClipId = signal<string | null>(null);
  automationEditTarget = signal<string>('volume');
  automationTargets = ['volume', 'filter', 'pan', 'pitch', 'reverb', 'delay'];

  toggleAutomation(clipId: string): void {
    this.haptic.light();
    if (this.selectedClipId() === clipId) {
      this.selectedClipId.set(null);
    } else {
      this.selectedClipId.set(clipId);
      // Ensure clip has automation array
      this.clips.update((list) =>
        list.map((c) =>
          c.id === clipId && !c.automation ? { ...c, automation: [] } : c
        )
      );
    }
  }

  /** Default curve type when adding a new point */
  defaultCurveType = signal<AutomationCurveType>('linear');

  addAutomationPoint(clipId: string): void {
    const clip = this.clips().find((c) => c.id === clipId);
    if (!clip) return;
    const points =
      clip.automation?.filter(
        (a) => a.target === this.automationEditTarget()
      ) ?? [];
    const nextPos =
      points.length > 0
        ? Math.round((points[points.length - 1].position + 1) * 10) / 10
        : 0;
    const newPoint: AutomationPoint = {
      position: nextPos,
      value: 0.5,
      target: this.automationEditTarget(),
      curveType: this.defaultCurveType(),
    };
    this.clips.update((list) =>
      list.map((c) =>
        c.id === clipId
          ? { ...c, automation: [...(c.automation ?? []), newPoint] }
          : c
      )
    );
    this.haptic.light();
    this.scheduleAutoSave();
    this.snackbar.info(
      `Automation point added at ${nextPos} bars (${this.defaultCurveType()})`
    );
  }

  updateAutomationCurve(
    clipId: string,
    pointIdx: number,
    curve: AutomationCurveType
  ): void {
    this.updateAutomationPoint(clipId, pointIdx, (point) => ({
      ...point,
      curveType: curve,
    }));
  }

  /** Visual icon for curve type */
  curveIcon(curve?: AutomationCurveType): string {
    switch (curve) {
      case 'exponential':
        return '↗';
      case 'step':
        return '⏐';
      default:
        return '╱';
    }
  }

  deleteAutomationPoint(clipId: string, pointIdx: number): void {
    const clip = this.clips().find((candidate) => candidate.id === clipId);
    if (!clip?.automation) return;

    const target = this.visibleAutomationPoints(clip).find(
      (entry) => entry.index === pointIdx
    );
    if (!target) return;

    this.clips.update((list) =>
      list.map((candidate) =>
        candidate.id === clipId && candidate.automation
          ? {
              ...candidate,
              automation: candidate.automation.filter(
                (_, index) => index !== target.index
              ),
            }
          : candidate
      )
    );
    this.haptic.light();
    this.scheduleAutoSave();
  }

  updateAutomationValue(
    clipId: string,
    pointIdx: number,
    newValue: number
  ): void {
    const clamped = Math.max(0, Math.min(1, Math.round(newValue * 100) / 100));
    this.updateAutomationPoint(clipId, pointIdx, (point) => ({
      ...point,
      value: clamped,
    }));
  }

  updateAutomationPosition(
    clipId: string,
    pointIdx: number,
    newPos: number
  ): void {
    const clamped = Math.max(0, Math.round(newPos * 10) / 10);
    this.updateAutomationPoint(clipId, pointIdx, (point) => ({
      ...point,
      position: clamped,
    }));
  }

  /** Return visible automation points with their source-array index.
   * Keeping the index explicit prevents filtered lanes from editing the
   * wrong point when multiple targets share one clip. */
  visibleAutomationPoints(clip: SessionClip): Array<{ point: AutomationPoint; index: number }> {
    const target = this.automationEditTarget();
    return (clip.automation ?? [])
      .map((point, index) => ({ point, index }))
      .filter(({ point }) => point.target === target);
  }

  private updateAutomationPoint(
    clipId: string,
    visiblePointIndex: number,
    update: (point: AutomationPoint) => AutomationPoint
  ): void {
    const clip = this.clips().find((candidate) => candidate.id === clipId);
    if (!clip?.automation) return;
    const target = this.visibleAutomationPoints(clip)[visiblePointIndex];
    if (!target) return;

    this.clips.update((list) =>
      list.map((candidate) =>
        candidate.id === clipId && candidate.automation
          ? {
              ...candidate,
              automation: candidate.automation.map((point, index) =>
                index === target.index ? update(point) : point
              ),
            }
          : candidate
      )
    );
    this.scheduleAutoSave();
  }

  addScene(): void {
    this.haptic.light();
    const idx = this.scenes().length;
    const colors = [
      '#0E7C7B',
      '#2BA09C',
      '#8B5CF6',
      '#FF1A8C',
      '#FFB627',
      '#00E5FF',
    ];
    this.scenes.update((list) => [
      ...list,
      {
        id: `scene-${idx + 1}`,
        name: `Scene ${idx + 1}`,
        color: colors[idx % colors.length],
        index: idx,
      },
    ]);
    this.scheduleAutoSave();
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
      this.scheduleAutoSave();
      this.snackbar.success(`${name} → clip in ${sceneId}`);
    } catch {
      // invalid payload — ignore
    }
  }

  // ── Session Presets (Save/Load) ──────────────────────
  savedPresets = signal<
    Array<{ name: string; scenes: SessionScene[]; clips: SessionClip[] }>
  >([]);
  presetNameInput = signal('');
  presetLoadOpen = signal(false);

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
      localStorage.setItem(
        'smuve_session_presets',
        JSON.stringify(this.savedPresets())
      );
    } catch {}
  }

  savePreset(): void {
    const name =
      this.presetNameInput().trim() ||
      `Preset ${this.savedPresets().length + 1}`;
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

  mutedTrackIds = signal<Set<string>>(new Set());

  muteTrack(trackId: string): void {
    this.haptic.light();
    this.mutedTrackIds.update((muted) => {
      const next = new Set(muted);
      if (next.has(trackId)) next.delete(trackId);
      else next.add(trackId);
      return next;
    });
    this.scheduleAutoSave();
    const muted = this.mutedTrackIds().has(trackId);
    this.snackbar.info(`Track ${trackId} ${muted ? 'muted' : 'unmuted'}`);
  }

  // ── Auto-Save on Reload ────────────────────────────
  private autoSaveTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly AUTO_SAVE_KEY = 'smuve_session_autosave';
  private readonly AUTO_SAVE_DELAY = 2000; // 2s debounce

  /** Schedule an auto-save after scenes/clips change */
  private scheduleAutoSave(): void {
    if (this.autoSaveTimer) clearTimeout(this.autoSaveTimer);
    this.autoSaveTimer = setTimeout(() => {
      try {
        const data = {
          scenes: this.scenes().map((s) => ({
            id: s.id,
            name: s.name,
            color: s.color,
            index: s.index,
          })),
          clips: this.clips().map((c) => ({
            id: c.id,
            name: c.name,
            trackId: c.trackId,
            sceneId: c.sceneId,
            color: c.color,
            duration: c.duration,
            velocity: c.velocity,
            automation: c.automation?.map((a) => ({
              position: a.position,
              value: a.value,
              target: a.target,
              curveType: a.curveType,
            })),
          })),
          savedAt: Date.now(),
        };
        localStorage.setItem(this.AUTO_SAVE_KEY, JSON.stringify(data));
      } catch {}
    }, this.AUTO_SAVE_DELAY);
  }

  /** Restore from auto-save if available */
  private restoreAutoSave(): boolean {
    try {
      const raw = localStorage.getItem(this.AUTO_SAVE_KEY);
      if (!raw) return false;
      const data = JSON.parse(raw);
      if (!data.scenes || !data.clips) return false;
      // Check if auto-save is fresh enough (within last 24h)
      if (data.savedAt && Date.now() - data.savedAt > 24 * 60 * 60 * 1000) {
        localStorage.removeItem(this.AUTO_SAVE_KEY);
        return false;
      }
      this.scenes.set(
        data.scenes.map((s: any, i: number) => ({
          id: s.id,
          name: s.name,
          color: s.color,
          index: i,
        }))
      );
      this.clips.set(
        data.clips.map((c: any) => ({
          ...c,
          isPlaying: false,
          automation:
            c.automation?.map((a: any) => ({
              position: a.position,
              value: a.value,
              target: a.target,
              curveType: a.curveType || 'linear',
            })) || [],
        }))
      );
      this.snackbar.info('Session restored from auto-save');
      return true;
    } catch {
      localStorage.removeItem(this.AUTO_SAVE_KEY);
      return false;
    }
  }

  // ── Export / Import Project Bundles ──────────────────
  exportProject(): void {
    this.haptic.medium();
    const bundle = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      app: 'S.M.U.V.E. Composer',
      scenes: this.scenes().map((s) => ({
        id: s.id,
        name: s.name,
        color: s.color,
        index: s.index,
      })),
      clips: this.clips().map((c) => ({
        id: c.id,
        name: c.name,
        trackId: c.trackId,
        sceneId: c.sceneId,
        color: c.color,
        duration: c.duration,
        velocity: c.velocity,
        automation: c.automation,
      })),
    };
    const json = JSON.stringify(bundle, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `smuve-project-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    this.snackbar.success('Project exported');
  }

  importProject(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.haptic.medium();
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const bundle = JSON.parse(reader.result as string);
        if (!bundle.scenes || !bundle.clips) {
          this.snackbar.error('Invalid project file');
          return;
        }
        this.scenes.set(
          bundle.scenes.map((s: any, i: number) => ({
            id: s.id,
            name: s.name,
            color: s.color,
            index: i,
          }))
        );
        this.clips.set(
          bundle.clips.map((c: any) => ({
            id: c.id,
            name: c.name,
            trackId: c.trackId,
            sceneId: c.sceneId,
            isPlaying: false,
            color: c.color,
            duration: c.duration,
            velocity: c.velocity,
            automation: c.automation || [],
          }))
        );
        this.activeSceneId.set(null);
        this.snackbar.success(
          `Project imported: ${bundle.scenes.length} scenes, ${bundle.clips.length} clips`
        );
      } catch {
        this.snackbar.error('Failed to parse project file');
      }
    };
    reader.readAsText(file);
    // Reset input so re-importing the same file triggers change
    input.value = '';
  }

  /** Override ngOnInit_ to add auto-save restore */
  ngOnInit_(): void {
    this.loadPresetList();
    if (!this.restoreAutoSave()) {
      this.snackbar.info('New session — no auto-save found');
    }
  }

  /** Wrap list-modifying methods to trigger auto-save */
  private autoSaveWrap<T>(fn: () => T): T {
    const result = fn();
    this.scheduleAutoSave();
    return result;
  }

  trackByScene = (_i: number, s: SessionScene) => s.id;
  trackByClip = (_i: number, c: SessionClip) => c.id;
  trackByTrackId = (_i: number, t: { id: string }) => t.id;
  trackByPoint = (i: number, entry: { point: AutomationPoint; index: number }) =>
    `${entry.point.target}-${entry.index}-${i}`;
}
