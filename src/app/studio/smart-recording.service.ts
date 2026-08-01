import { Injectable, inject, signal, computed } from '@angular/core';
import { AudioEngineService } from '../services/audio-engine.service';
import { LoggingService } from '../services/logging.service';
import { RecordingStatusService } from './recording-status.service';
import { LocalStorageService } from '../services/local-storage.service';
import { StudioRecordingEngineService } from './studio-recording-engine.service';
import { WavEncoder } from './wav-encoder.util';

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
  /** Per-segment comp assignments (bar ranges → take). Empty = whole-take comp. */
  segments?: CompSegment[];
  createdAt: number;
}

/** A segment of the comp timeline; each segment plays its assigned take. */
export interface CompSegment {
  id: string;
  startBar: number;
  endBar: number;
  /** Take id assigned to this segment (null = fall back to group's comp take). */
  takeId: string | null;
}

@Injectable({ providedIn: 'root' })
export class SmartRecordingService {
  private readonly audioEngine = inject(AudioEngineService);
  private readonly logger = inject(LoggingService);
  private readonly recordingStatus = inject(RecordingStatusService);
  private readonly storage = inject(LocalStorageService);
  private readonly recordingEngine = inject(StudioRecordingEngineService);

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

  // ── Zero-crossing crossfade settings ──────────────────────
  /** Crossfade duration in milliseconds between adjacent comp takes */
  crossfadeMs = signal(10);
  /** Whether zero-crossing detection is enabled for seamless crossfades */
  zeroCrossingEnabled = signal(true);
  /** Lookahead window in samples for zero-crossing search */
  zeroCrossingLookahead = signal(256);

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

  hasPunchRegion = computed(
    () => this.punchInBar() !== null && this.punchOutBar() !== null
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
  async onBarTick(bar: number) {
    if (this.recordingMode() !== 'punch' || !this.punchArmed()) return;

    const inBar = this.punchInBar();
    const outBar = this.punchOutBar();

    if (inBar !== null && bar >= inBar && !this.isPunching()) {
      // Enter punch region — start actual recording
      this.isPunching.set(true);
      this.recordingStatus.setRecordingSource({
        type: 'transport',
        trackId: 'punch',
        trackName: `Punch (bar ${inBar})`,
      });
      // Initialize recording engine if needed and start capture
      const initialized = this.recordingEngine.isInitialized();
      if (!initialized) {
        await this.recordingEngine.initialize();
      }
      this.recordingEngine.startRecording();
      this.audioEngine.isRecording.set(true);
      this.logger.info(
        `SmartRecording: Punch IN at bar ${bar} — recording started`
      );
    }

    if (outBar !== null && bar >= outBar && this.isPunching()) {
      // Exit punch region — stop actual recording
      this.isPunching.set(false);
      this.punchArmed.set(false);
      await this.recordingEngine.stopRecording();
      this.audioEngine.isRecording.set(false);
      this.recordingStatus.clearRecordingSource();
      this.logger.info(
        `SmartRecording: Punch OUT at bar ${bar} — recording saved`
      );
    }
  }

  // ── Comp recording controls ───────────────────────────────

  startNewCompGroup(
    trackId?: string,
    trackName?: string,
    sectionLabel?: string
  ) {
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
    this.logger.info(
      `SmartRecording: New comp group "${sectionLabel}" created`
    );
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

    // Pull real recorded audio from the studio recording engine
    const { left, right } = this.recordingEngine.getRecordedBuffers();
    let blob: Blob;
    let durationMs = 2000;

    if (left.length > 0 && right.length > 0) {
      // Interleave left/right channel chunks and encode as WAV
      const interleaved = this.interleaveChannels(left, right);
      const sampleRate = this.audioEngine.ctx.sampleRate;
      blob = WavEncoder.encodeMultiChannel(
        [interleaved.slice(0, interleaved.length / 2), interleaved.slice(interleaved.length / 2)],
        'wav-16',
        sampleRate
      );
      durationMs = Math.round((interleaved.length / sampleRate) * 1000);
    } else {
      // Fallback: no recording was active — synthesize minimal silent WAV
      blob = await this.synthesizeSilentWav(2000);
    }

    const url = URL.createObjectURL(blob);
    const regionStartBar = 1;
    const regionEndBar = 5;

    const take: CompTake = {
      id: `take_${now}_${takeNumber}`,
      takeNumber,
      label: `Take ${takeNumber}`,
      blob,
      url,
      durationMs,
      recordedAt: now,
      regionStartBar,
      regionEndBar,
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
    this.compGroups.update((groups) => groups.filter((g) => g.id !== groupId));
    if (this.activeCompGroupId() === groupId) {
      this.activeCompGroupId.set(null);
    }
  }

  // ── Segment comping ──────────────────────────────────────
  /** Auto-record a fresh take on every loop pass (loop-recording comp). */
  autoTakeOnLoop = signal(false);

  /** Split the active comp group's region into fixed-length segments. */
  splitCompSegments(groupId: string, segmentBars: number) {
    const segBars = Math.max(1, segmentBars);
    this.compGroups.update((groups) =>
      groups.map((g) => {
        if (g.id !== groupId) return g;
        const start = Math.min(
          ...g.takes.map((t) => t.regionStartBar),
          1
        );
        const rawEnd = Math.max(
          ...g.takes.map((t) => t.regionEndBar),
          start + segBars
        );
        const end = Math.max(rawEnd, start + segBars);
        const segments: CompSegment[] = [];
        for (let bar = start; bar < end; bar += segBars) {
          segments.push({
            id: `${groupId}_seg_${bar}`,
            startBar: bar,
            endBar: Math.min(bar + segBars, end),
            takeId: g.selectedTakeId,
          });
        }
        return { ...g, segments };
      })
    );
  }

  /** Assign a take to a specific comp segment (null = use group comp take). */
  setSegmentTake(groupId: string, segmentId: string, takeId: string | null) {
    this.compGroups.update((groups) =>
      groups.map((g) => {
        if (g.id !== groupId || !g.segments) return g;
        return {
          ...g,
          segments: g.segments.map((s) =>
            s.id === segmentId ? { ...s, takeId } : s
          ),
        };
      })
    );
  }

  /** Comp segments for a group (empty when not split yet). */
  compSegmentsForGroup(groupId: string): CompSegment[] {
    return this.compGroups().find((g) => g.id === groupId)?.segments ?? [];
  }

  /** Which take should play at a given bar (segment assignment, else comp take). */
  activeTakeForBar(groupId: string, bar: number): string | null {
    const group = this.compGroups().find((g) => g.id === groupId);
    if (!group) return null;
    const seg = group.segments?.find(
      (s) => bar >= s.startBar && bar < s.endBar
    );
    return seg?.takeId ?? group.selectedTakeId;
  }

  setAutoTakeOnLoop(enabled: boolean) {
    this.autoTakeOnLoop.set(enabled);
  }

  /**
   * Called when the transport wraps around a loop in comp mode:
   * finalizes the current take and immediately arms the next one.
   */
  async onLoopPass(): Promise<CompTake | null> {
    if (!this.autoTakeOnLoop()) return null;
    if (this.recordingMode() !== 'comp') return null;
    if (!this.isCompRecording()) {
      // First loop pass — start take 1
      this.startCompTake();
      return null;
    }
    const finished = await this.finishCompTake();
    if (finished) {
      this.startCompTake();
    }
    return finished;
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
          if (
            !prevBoundary ||
            silenceStart - prevBoundary.endSample > sampleRate * 0.1
          ) {
            boundaries.push({
              startSample: Math.max(
                0,
                silenceStart - Math.floor(sampleRate * 0.01)
              ),
              endSample: i + Math.floor(sampleRate * 0.01),
            });
          }
        }
        inSilence = false;
      }
    }

    return boundaries;
  }

  // ── Zero-crossing crossfade engine ───────────────────────

  /**
   * Find the nearest zero-crossing sample index in the given buffer,
   * searching within a lookahead window from the target index.
   * Returns the adjusted splice index for pop-free editing.
   */
  findZeroCrossing(
    buffer: Float32Array,
    targetIndex: number,
    sampleRate: number
  ): number {
    if (!this.zeroCrossingEnabled()) return targetIndex;

    const lookahead = this.zeroCrossingLookahead();
    const start = Math.max(0, targetIndex - lookahead);
    const end = Math.min(buffer.length - 1, targetIndex + lookahead);

    let bestIdx = targetIndex;
    let bestDist = lookahead + 1;

    for (let i = start; i < end - 1; i++) {
      // Detect zero crossing: sign change between consecutive samples
      if (
        (buffer[i] <= 0 && buffer[i + 1] >= 0) ||
        (buffer[i] >= 0 && buffer[i + 1] <= 0)
      ) {
        // Use the closer-to-zero sample
        const idx = Math.abs(buffer[i]) < Math.abs(buffer[i + 1]) ? i : i + 1;
        const dist = Math.abs(idx - targetIndex);
        if (dist < bestDist) {
          bestDist = dist;
          bestIdx = idx;
        }
      }
    }

    return bestIdx;
  }

  /**
   * Apply a zero-crossing-aligned crossfade between two audio buffers.
   * Returns a new buffer with seamless transition at the splice point.
   *
   * @param bufferA First take buffer (plays first)
   * @param bufferB Second take buffer (plays after crossfade)
   * @param spliceSample The sample index in bufferA where the transition begins
   * @param sampleRate Audio sample rate
   * @returns Crossfaded interleaved result
   */
  applyCompCrossfade(
    bufferA: Float32Array,
    bufferB: Float32Array,
    spliceSample: number,
    sampleRate: number
  ): Float32Array {
    const crossfadeSamples = Math.floor(
      (this.crossfadeMs() / 1000) * sampleRate
    );

    // Align splice to nearest zero-crossing for pop-free edit
    const alignedSplice = this.findZeroCrossing(
      bufferA,
      spliceSample,
      sampleRate
    );

    // Calculate output length: A up to splice + crossfade region + remainder of B
    const fadeStart = alignedSplice;
    const fadeEnd = Math.min(
      alignedSplice + crossfadeSamples,
      bufferA.length,
      bufferB.length + alignedSplice
    );
    const fadeLength = fadeEnd - fadeStart;

    const totalLength = alignedSplice + fadeLength + (bufferB.length - crossfadeSamples);
    const result = new Float32Array(totalLength);

    // Copy bufferA up to the splice point
    for (let i = 0; i < alignedSplice; i++) {
      result[i] = bufferA[i];
    }

    // Crossfade region: equal-power fade A out, B in
    for (let i = 0; i < fadeLength; i++) {
      const t = i / Math.max(1, fadeLength);
      // Equal-power crossfade (constant power throughout transition)
      const gainA = Math.cos(t * Math.PI / 2);
      const gainB = Math.sin(t * Math.PI / 2);

      const sampleA = fadeStart + i < bufferA.length ? bufferA[fadeStart + i] : 0;
      const sampleB = i < bufferB.length ? bufferB[i] : 0;

      result[alignedSplice + i] = sampleA * gainA + sampleB * gainB;
    }

    // Copy remainder of bufferB
    for (let i = crossfadeSamples; i < bufferB.length; i++) {
      result[alignedSplice + i] = bufferB[i];
    }

    this.logger.info(
      `SmartRecording: Crossfade applied (${crossfadeSamples} samples, ` +
        `splice at zero-crossing offset ${alignedSplice - spliceSample})`
    );

    return result;
  }

  /**
   * Compile all selected takes in a comp group into a single
   * crossfaded buffer using zero-crossing-aligned transitions.
   *
   * @param buffers Map of takeId → mono audio buffer
   * @param sampleRate Audio sample rate
   * @returns Interleaved crossfaded result
   */
  compileComp(
    buffers: Map<string, Float32Array>,
    sampleRate: number
  ): Float32Array | null {
    const group = this.activeCompGroup();
    if (!group || group.takes.length === 0) return null;

    const nonMuted = group.takes.filter((t) => !t.isMuted);
    if (nonMuted.length === 0) return null;

    // If only one take, return it directly
    if (nonMuted.length === 1) {
      return buffers.get(nonMuted[0].id) ?? null;
    }

    // Crossfade consecutive takes
    let current = buffers.get(nonMuted[0].id);
    if (!current) return null;

    for (let i = 1; i < nonMuted.length; i++) {
      const next = buffers.get(nonMuted[i].id);
      if (!next) continue;

      // Crossfade at the boundary where current ends
      current = this.applyCompCrossfade(
        current,
        next,
        current.length - Math.floor((this.crossfadeMs() / 1000) * sampleRate),
        sampleRate
      );
    }

    return current;
  }

  // ── Utility ───────────────────────────────────────────────

  /** Interleave two arrays of Float32Array chunks into a single interleaved Float32Array */
  private interleaveChannels(
    leftChunks: Float32Array[],
    rightChunks: Float32Array[]
  ): Float32Array {
    let total = 0;
    for (const c of leftChunks) total += c.length;
    const result = new Float32Array(total * 2);
    let off = 0;
    for (let i = 0; i < leftChunks.length; i++) {
      const l = leftChunks[i];
      const r = rightChunks[i] ?? new Float32Array(l.length);
      for (let j = 0; j < l.length; j++) {
        result[off++] = l[j];
        result[off++] = r[j];
      }
    }
    return result;
  }

  private async synthesizeSilentWav(durationMs: number): Promise<Blob> {
    const sampleRate = 48000;
    const numSamples = Math.max(
      1,
      Math.floor((durationMs / 1000) * sampleRate)
    );
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
