import { Injectable, inject, signal, computed } from '@angular/core';
import { AudioEngineService } from '../services/audio-engine.service';
import { LoggingService } from '../services/logging.service';
import { RecordingStatusService } from './recording-status.service';
import { LocalStorageService } from '../services/local-storage.service';

/** A single recorded take within a comp group */
export interface CompTake {
  id: string;
  takeNumber: number;
  label: string;
  blob: Blob | null;
  url: string;
  durationMs: number;
  recordedAt: number;
  /** Region within the full timeline (bar-start / bar-end) */
  regionStartBar: number;
  regionEndBar: number;
  isMuted: boolean;
  /** Whether this take is the 'comp' (selected for final mix) */
  isCompSelection: boolean;
  peakDbL: number;
  peakDbR: number;
}

/** A comp group collects takes recorded for the same section */
export interface CompGroup {
  id: string;
  trackId: string;
  trackName: string;
  sectionLabel: string; // e.g., "Verse 1", "Chorus"
  takes: CompTake[];
  /** Which take ID is currently selected as the comp */
  selectedTakeId: string | null;
  createdAt: number;
}

@Injectable({ providedIn: 'root' })
export class SmartRecordingService {
  private readonly audioEngine = inject(AudioEngineService);
  private readonly logger = inject(LoggingService);
  private readonly recordingStatus = inject(RecordingStatusService);
  private readonly storage = inject(LocalStorageService);

  // ── Recording mode ────────────────────────────────────────
  /** 'normal' = standard recording, 'punch' = punch-in/out, 'comp' = comp takes */
  recordingMode = signal<'normal' | 'punch' | 'comp'>('normal');

  /** Punch-in punch-out bar positions */
  punchInBar = signal<number | null>(null);
  punchOutBar = signal<number | null>(null);
  /** Whether we are currently inside a punch region (actively recording) */
  isPunching = signal(false);
  /** Arm punch recording — waits for playhead to reach punch-in bar */
  punchArmed = signal(false);

  // ── Comp groups ───────────────────────────────────────────
  compGroups = signal<CompGroup[]>([]);
  /** Current recording comp group ID (if in comp mode) */
  activeCompGroupId = signal<string | null>(null);
  /** Whether we are currently recording a comp take */
  isCompRecording = signal(false);
  /** Current comp take number in the active group */
  currentTakeNumber = signal(1);

  // ── Auto-split settings ───────────────────────────────────
  /** Auto-split on silence threshold (-dBFS) */
  autoSplitThreshold = signal(-45);
  /** Minimum silence duration (ms) to trigger split */
  autoSplitMinSilenceMs = signal(500);
  /** Whether auto-split is enabled */
  autoSplitEnabled = signal(true);

  // ── Computed utilities ────────────────────────────────────
  activeCompGroup = computed(() => {
    const id = this.activeCompGroupId();
    return this.compGroups().find((g) => g.id === id) || null;
  });

  activeCompGroupTakes = computed(() => this.activeCompGroup()?.takes || []);

  currentTakeLabel = computed(() => {
    if (this.recordingMode() === 'comp') {
      return `Take ${this.currentTakeNumber()}`;
    }
    return this.recordingMode() === 'punch' ? 'Punch Rec' : 'Rec';
  });

  punchStatusLabel = computed(() => {
    if (!this.punchArmed()) return '';
    const inBar = this.punchInBar();
    const outBar = this.punchOutBar();
    if (inBar !== null && outBar !== null) {
      return `PUNCH ${inBar}→${outBar}`;
    }
    if (inBar !== null) return `PUNCH IN at bar ${inBar}`;
    return 'PUNCH ARMED';
  });

  hasPunchRegion = computed(() =>
    this.punchInBar() !== null && this.punchOutBar() !== null
  );

  // ── Recording mode controls ───────────────────────────────

  setRecordingMode(mode: 'normal' | 'punch' | 'comp') {
    this.recordingMode.set(mode);
    if (mode === 'punch') {
      this.punchArmed.set(false);
      this.isPunching.set(false);
    }
    if (mode === 'comp') {
      this.startNewCompGroup();
    }
    this.logger.info(`SmartRecording: Mode set to ${mode}`);
  }

  // ── Punch-in/out controls ─────────────────────────────────

  setPunchIn(bar: number) {
    this.punchInBar.set(bar);
  }

  setPunchOut(bar: number) {
    this.punchOutBar.set(bar);
  }

  clearPunchRegion() {
    this.punchInBar.set(null);
    this.punchOutBar.set(null);
    this.punchArmed.set(false);
    this.isPunching.set(false);
  }

  /** Arm punch recording — recording starts when playhead reaches punch-in bar */
  armPunch() {
    this.punchArmed.set(true);
    this.isPunching.set(false);
  }

  /** Disarm without recording */
  disarmPunch() {
    this.punchArmed.set(false);
    this.isPunching.set(false);
  }

  /**
   * Called by the sequencer each bar — checks if we should start/stop punching.
   */
  onBarTick(bar: number) {
    if (this.recordingMode() !== 'punch' || !this.punchArmed()) return;

    const inBar = this.punchInBar();
    const outBar = this.punchOutBar();

    if (inBar !== null && bar >= inBar && !this.isPunching()) {
      // Enter punch region — start recording
      this.isPunching.set(true);
      this.recordingStatus.setRecordingSource({
        type: 'transport',
        trackId: 'punch',
        trackName: `Punch (bar ${inBar})`,
      });
      this.logger.info(`SmartRecording: Punch IN at bar ${bar}`);
    }

    if (outBar !== null && bar >= outBar && this.isPunching()) {
      // Exit punch region — stop recording
      this.isPunching.set(false);
      this.punchArmed.set(false);
      this.recordingStatus.clearRecordingSource();
      this.logger.info(`SmartRecording: Punch OUT at bar ${bar}`);
    }
  }

  // ── Comp recording controls ───────────────────────────────

  startNewCompGroup(trackId?: string, trackName?: string, sectionLabel?: string) {
    const group: CompGroup = {
      id: `comp_${Date.now()}`,
      trackId: trackId || 'comp-track',
      trackName: trackName || 'Comp Track',
      sectionLabel: sectionLabel || 'Section',
      takes: [],
      selectedTakeId: null,
      createdAt: Date.now(),
    };
    this.compGroups.update((groups) => [...groups, group]);
    this.activeCompGroupId.set(group.id);
    this.currentTakeNumber.set(1);
    this.logger.info(`SmartRecording: New comp group "${sectionLabel}" created`);
  }

  /** Start recording a new take in the active comp group */
  startCompTake() {
    const groupId = this.activeCompGroupId();
    if (!groupId) {
      this.startNewCompGroup();
    }
    this.isCompRecording.set(true);
    this.recordingStatus.setRecordingSource({
      type: 'transport',
      trackId: 'comp',
      trackName: `Take ${this.currentTakeNumber()}`,
    });
  }

  /** Finish current comp take and save it */
  async finishCompTake(): Promise<CompTake | null> {
    if (!this.isCompRecording()) return null;

    const takeNumber = this.currentTakeNumber();
    const now = Date.now();

    // Create a silent WAV stub as placeholder (replace with real capture)
    const blob = await this.synthesizeSilentWav(2000);
    const url = URL.createObjectURL(blob);

    const take: CompTake = {
      id: `take_${now}_${takeNumber}`,
      takeNumber,
      label: `Take ${takeNumber}`,
      blob,
      url,
      durationMs: 2000,
      recordedAt: now,
      regionStartBar: 1,
      regionEndBar: 5,
      isMuted: false,
      isCompSelection: false,
      peakDbL: -18,
      peakDbR: -18,
    };

    // Add to active comp group
    this.compGroups.update((groups) =>
      groups.map((g) => {
        if (g.id !== this.activeCompGroupId()) return g;
        const takes = [...g.takes, take];
        return { ...g, takes, selectedTakeId: take.id };
      })
    );

    this.currentTakeNumber.update((n) => n + 1);
    this.isCompRecording.set(false);
    this.recordingStatus.clearRecordingSource();

    // Persist
    try {
      await this.storage.saveItem('comp_groups', this.compGroups());
    } catch {
      // best-effort
    }

    this.logger.info(`SmartRecording: Take ${takeNumber} saved`);
    return take;
  }

  /** Select a take as the 'comp' (winner) in a comp group */
  selectCompTake(groupId: string, takeId: string) {
    this.compGroups.update((groups) =>
      groups.map((g) => {
        if (g.id !== groupId) return g;
        return {
          ...g,
          selectedTakeId: takeId,
          takes: g.takes.map((t) => ({
            ...t,
            isCompSelection: t.id === takeId,
          })),
        };
      })
    );
  }

  /** Mute/unmute a take in its comp group */
  toggleTakeMute(groupId: string, takeId: string) {
    this.compGroups.update((groups) =>
      groups.map((g) => {
        if (g.id !== groupId) return g;
        return {
          ...g,
          takes: g.takes.map((t) =>
            t.id === takeId ? { ...t, isMuted: !t.isMuted } : t
          ),
        };
      })
    );
  }

  /** Delete a take from its comp group */
  deleteTake(groupId: string, takeId: string) {
    this.compGroups.update((groups) =>
      groups.map((g) => {
        if (g.id !== groupId) return g;
        const takes = g.takes.filter((t) => t.id !== takeId);
        return {
          ...g,
          takes,
          selectedTakeId: g.selectedTakeId === takeId ? null : g.selectedTakeId,
        };
      })
    );
  }

  /** Delete an entire comp group */
  deleteCompGroup(groupId: string) {
    this.compGroups.update((groups) =>
      groups.filter((g) => g.id !== groupId)
    );
    if (this.activeCompGroupId() === groupId) {
      this.activeCompGroupId.set(null);
    }
  }

  // ── Auto-split silence detection ─────────────────────────

  /**
   * Analyze audio data and return split points (silence boundaries).
   * Called from the audio input pipeline.
   */
  detectSilenceBoundaries(
    samples: Float32Array,
    sampleRate: number
  ): Array<{ startSample: number; endSample: number }> {
    if (!this.autoSplitEnabled()) return [];

    const threshold = this.autoSplitThreshold();
    const minSilenceSamples = Math.floor(
      (this.autoSplitMinSilenceMs() / 1000) * sampleRate
    );
    const thresholdLinear = Math.pow(10, threshold / 20);

    const boundaries: Array<{ startSample: number; endSample: number }> = [];
    let inSilence = false;
    let silenceStart = 0;

    for (let i = 0; i < samples.length; i++) {
      const amp = Math.abs(samples[i]);

      if (amp < thresholdLinear) {
        if (!inSilence) {
          inSilence = true;
          silenceStart = i;
        }
      } else {
        if (inSilence && i - silenceStart >= minSilenceSamples) {
          // This is a real silence gap — mark boundary
          const prevBoundary = boundaries[boundaries.length - 1];
          if (!prevBoundary || silenceStart - prevBoundary.endSample > sampleRate * 0.1) {
            boundaries.push({
              startSample: Math.max(0, silenceStart - Math.floor(sampleRate * 0.01)),
              endSample: i + Math.floor(sampleRate * 0.01),
            });
          }
        }
        inSilence = false;
      }
    }

    return boundaries;
  }

  // ── Utility ───────────────────────────────────────────────

  private async synthesizeSilentWav(durationMs: number): Promise<Blob> {
    const sampleRate = 48000;
    const numSamples = Math.max(1, Math.floor((durationMs / 1000) * sampleRate));
    const buffer = new ArrayBuffer(44 + numSamples * 2);
    const view = new DataView(buffer);
    
    const writeStr = (offset: number, str: string) => {
      for (let i = 0; i < str.length; i++) {
        view.setUint8(offset + i, str.charCodeAt(i));
      }
    };

    writeStr(0, 'RIFF');
    view.setUint32(4, 36 + numSamples * 2, true);
    writeStr(8, 'WAVE');
    writeStr(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeStr(36, 'data');
    view.setUint32(40, numSamples * 2, true);

    return new Blob([buffer], { type: 'audio/wav' });
  }
}
