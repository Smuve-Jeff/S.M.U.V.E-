import { Injectable, inject, signal, computed } from "@angular/core";
import { AudioEngineService } from "../services/audio-engine.service";
import { LoggingService } from "../services/logging.service";
import { RecordingStatusService } from "./recording-status.service";
import { LocalStorageService } from "../services/local-storage.service";
import { StudioRecordingEngineService } from "./studio-recording-engine.service";
import { WavEncoder } from "./wav-encoder.util";

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

/**
 * A finished recording handed to a comp group from another surface (Vocal
 * Suite, Audio Recorder, the studio recorder).
 */
export interface RecordingTakeInput {
  blob: Blob;
  /** Take name; defaults to `Take <n>` in the group's numbering. */
  label?: string;
  /** Wall-clock length, used when the blob cannot be decoded. */
  durationMs?: number;
  /** Labels for the group created when no comp group is active yet. */
  trackId?: string;
  trackName?: string;
  sectionLabel?: string;
  /** 1-based bar the take started on; defaults to bar 1. */
  regionStartBar?: number;
}

/** A segment of the comp timeline; each segment plays its assigned take. */
export interface CompSegment {
  id: string;
  startBar: number;
  endBar: number;
  /** Take id assigned to this segment (null = fall back to group's comp take). */
  takeId: string | null;
}

@Injectable({ providedIn: "root" })
export class SmartRecordingService {
  private readonly audioEngine = inject(AudioEngineService);
  private readonly logger = inject(LoggingService);
  private readonly recordingStatus = inject(RecordingStatusService);
  private readonly storage = inject(LocalStorageService);
  private readonly recordingEngine = inject(StudioRecordingEngineService);

  // ── Recording mode ────────────────────────────────────────
  /** 'normal' = standard recording, 'punch' = punch-in/out, 'comp' = comp takes */
  recordingMode = signal<"normal" | "punch" | "comp">("normal");

  /** Punch-in punch-out bar positions */
  punchInBar = signal<number | null>(null);
  punchOutBar = signal<number | null>(null);
  /** Whether we are currently inside a punch region (actively recording) */
  isPunching = signal(false);
  /** Arm punch recording — waits for playhead to reach punch-in bar */
  punchArmed = signal(false);

  // ── Comp groups ───────────────────────────────────────────
  compGroups = signal<CompGroup[]>([]);
  /** Last comp-capture problem, surfaced in the recording panel. */
  captureError = signal<string | null>(null);
  /** Current recording comp group ID (if in comp mode) */
  activeCompGroupId = signal<string | null>(null);
  /** Whether we are currently recording a comp take */
  isCompRecording = signal(false);
  /** Transport bar the current comp take started on (1-based). */
  private compTakeStartBar = 1;
  /** Last transport bar the sequencer reported, in any recording mode. */
  private lastObservedBar: number | null = null;
  /** Current comp take number in the active group */
  currentTakeNumber = signal(1);

  // ── Zero-crossing crossfade settings ──────────────────────
  /** Crossfade duration in milliseconds between adjacent comp takes */
  crossfadeMs = signal(10);
  /**
   * Milliseconds of extra capture kept past the end of a comp take. This tail
   * is the material a join crossfades with when the take's segment ends there,
   * so a pass stopped right on the bar line still has audio to blend.
   */
  postRollMs = signal(200);
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
    if (this.recordingMode() === "comp") {
      return `Take ${this.currentTakeNumber()}`;
    }
    return this.recordingMode() === "punch" ? "Punch Rec" : "Rec";
  });

  punchStatusLabel = computed(() => {
    if (!this.punchArmed()) return "";
    const inBar = this.punchInBar();
    const outBar = this.punchOutBar();
    if (inBar !== null && outBar !== null) {
      return `PUNCH ${inBar}→${outBar}`;
    }
    if (inBar !== null) return `PUNCH IN at bar ${inBar}`;
    return "PUNCH ARMED";
  });

  hasPunchRegion = computed(
    () => this.punchInBar() !== null && this.punchOutBar() !== null,
  );

  // ── Recording mode controls ───────────────────────────────

  setRecordingMode(mode: "normal" | "punch" | "comp") {
    this.recordingMode.set(mode);
    this.captureError.set(null);
    if (mode === "punch") {
      this.punchArmed.set(false);
      this.isPunching.set(false);
    }
    if (mode === "comp") {
      // Reuse the section already in progress. Entering comp mode used to
      // spawn an empty group every time, which split the artist's takes across
      // duplicate "Section" groups.
      const active = this.activeCompGroup();
      if (active) {
        this.currentTakeNumber.set(active.takes.length + 1);
      } else {
        this.startNewCompGroup();
      }
    }
    this.logger.info(`SmartRecording: Mode set to ${mode}`);
  }

  /**
   * Point recording at an existing comp group (the section the artist selected
   * in the comp view). Takes recorded anywhere then land in that section, and
   * numbering continues from the group's own takes so labels never collide.
   *
   * @returns false when the group no longer exists.
   */
  setActiveCompGroup(groupId: string): boolean {
    const group = this.compGroups().find((g) => g.id === groupId);
    if (!group) return false;

    this.activeCompGroupId.set(groupId);
    this.currentTakeNumber.set(group.takes.length + 1);
    this.captureError.set(null);
    this.logger.info(
      `SmartRecording: "${group.sectionLabel}" is the active comp group.`,
    );
    return true;
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
   *
   * The bar is tracked in every mode: comp takes record the span they actually
   * covered from it (they used to be stamped with a fixed 1–5 bar region).
   */
  async onBarTick(bar: number) {
    this.lastObservedBar = bar;
    if (this.recordingMode() !== "punch" || !this.punchArmed()) return;

    const inBar = this.punchInBar();
    const outBar = this.punchOutBar();

    if (inBar !== null && bar >= inBar && !this.isPunching()) {
      // Enter punch region — start actual recording
      this.isPunching.set(true);
      this.recordingStatus.setRecordingSource({
        type: "transport",
        trackId: "punch",
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
        `SmartRecording: Punch IN at bar ${bar} — recording started`,
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
        `SmartRecording: Punch OUT at bar ${bar} — recording saved`,
      );
    }
  }

  // ── Comp recording controls ───────────────────────────────

  startNewCompGroup(
    trackId?: string,
    trackName?: string,
    sectionLabel?: string,
  ) {
    const group: CompGroup = {
      // Timestamp + random suffix: two sections created in the same millisecond
      // (double-tapped "New Group", a mode switch right after) used to share an
      // id, which merged their takes and made lookups return the wrong section.
      id: `comp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      trackId: trackId || "comp-track",
      trackName: trackName || "Comp Track",
      sectionLabel: sectionLabel || "Section",
      takes: [],
      selectedTakeId: null,
      createdAt: Date.now(),
    };
    this.compGroups.update((groups) => [...groups, group]);
    this.activeCompGroupId.set(group.id);
    this.currentTakeNumber.set(1);
    this.logger.info(
      `SmartRecording: New comp group "${sectionLabel}" created`,
    );
  }

  /**
   * Start recording a new take in the active comp group.
   *
   * The capture engine is started here rather than assumed: the take used to be
   * announced while nothing was recording, so "FINISH TAKE" pulled an empty
   * buffer and stamped a silent take with invented peak readings.
   *
   * @returns true only when capture is genuinely running.
   */
  async startCompTake(): Promise<boolean> {
    if (this.isCompRecording()) return false;
    const groupId = this.activeCompGroupId();
    if (!groupId) {
      this.startNewCompGroup();
    }
    this.captureError.set(null);

    try {
      if (!this.recordingEngine.isInitialized()) {
        const ready = await this.recordingEngine.initialize();
        if (!ready) {
          this.captureError.set("Input unavailable — check the microphone");
          this.logger.warn(
            "SmartRecording: input unavailable; comp take not started.",
          );
          return false;
        }
      }
      this.recordingEngine.startRecording();
    } catch (error) {
      this.logger.error("SmartRecording: comp capture failed to start", error);
      this.captureError.set("Could not start the take");
      return false;
    }

    if (!this.recordingEngine.isRecording()) {
      this.captureError.set("Could not start the take");
      this.logger.warn("SmartRecording: engine refused to start comp capture.");
      return false;
    }

    this.isCompRecording.set(true);
    // The take is stamped with the span it covers, so comp segments and the
    // suggester's coverage scoring work off real bars.
    this.compTakeStartBar = Math.max(1, this.lastObservedBar ?? 1);
    this.recordingStatus.setRecordingSource({
      type: "transport",
      trackId: "comp",
      trackName: `Take ${this.currentTakeNumber()}`,
    });
    return true;
  }

  /**
   * Keep the input open for `postRollMs` so the take carries a crossfadeable
   * tail. Only worth waiting for when nothing follows this take: the next take
   * is stamped from the transport bar it starts on, so holding here would start
   * its audio late against its own stamp.
   */
  private async holdPostRoll(): Promise<void> {
    const ms = this.postRollMs();
    if (!(ms > 0)) return;
    try {
      if (!this.recordingEngine.isRecording()) return;
    } catch {
      return;
    }
    await new Promise<void>((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Finish current comp take and save it.
   *
   * @param holdPostRoll leave the capture running for the post-roll before
   *   stopping. Loop passes pass false (see `holdPostRoll`).
   */
  async finishCompTake(holdPostRoll = true): Promise<CompTake | null> {
    if (!this.isCompRecording()) return null;

    const takeNumber = this.currentTakeNumber();
    const now = Date.now();
    const sampleRate = this.audioEngine.ctx.sampleRate;

    if (holdPostRoll) {
      await this.holdPostRoll();
    }

    // Flush the engine before reading its buffers: the worklet only hands over
    // the final render quantum on stop, so reading first truncated the take.
    let left: Float32Array[] = [];
    let right: Float32Array[] = [];
    try {
      if (this.recordingEngine.isRecording()) {
        await this.recordingEngine.stopRecording();
      }
      const buffers = this.recordingEngine.getRecordedBuffers();
      left = buffers.left;
      right = buffers.right;
    } catch (error) {
      this.logger.warn(
        "SmartRecording: comp capture did not stop cleanly",
        error,
      );
    }

    if (left.length === 0 || right.length === 0) {
      // No PCM means the pass captured nothing. A fabricated silent take would
      // sit in the group looking real (and could be comped into the mix), so
      // report it and leave the group untouched instead.
      this.isCompRecording.set(false);
      this.captureError.set("Take discarded — no audio was captured");
      this.recordingStatus.clearRecordingSource();
      this.logger.warn(
        "SmartRecording: comp take discarded — capture produced no audio.",
      );
      return null;
    }

    // The recording engine already stores separate channel chunks. Keep them
    // separate for WAV encoding; splitting an interleaved buffer in half would
    // turn time-order data into two corrupted channels.
    const leftChannel = this.joinChunks(left);
    const rightChannel = this.joinChunks(right);
    const frameCount = Math.min(leftChannel.length, rightChannel.length);
    const alignedLeft = leftChannel.slice(0, frameCount);
    const alignedRight = rightChannel.slice(0, frameCount);
    const blob = WavEncoder.encodeMultiChannel(
      [alignedLeft, alignedRight],
      "wav-16",
      sampleRate,
    );
    const durationMs = Math.round((frameCount / sampleRate) * 1000);

    const url = URL.createObjectURL(blob);
    const regionStartBar = this.compTakeStartBar;
    const regionEndBar = Math.max(
      regionStartBar + 1,
      this.lastObservedBar ?? regionStartBar + 1,
    );

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
      // Measured from the captured samples — a hard-coded readout made every
      // take look identically levelled in the comp view.
      peakDbL: this.peakDbOf(alignedLeft),
      peakDbR: this.peakDbOf(alignedRight),
    };
    this.captureError.set(null);

    // Add to active comp group
    this.compGroups.update((groups) =>
      groups.map((g) => {
        if (g.id !== this.activeCompGroupId()) return g;
        const takes = [...g.takes, take];
        return { ...g, takes, selectedTakeId: take.id };
      }),
    );

    this.currentTakeNumber.update((n) => n + 1);
    this.isCompRecording.set(false);
    this.recordingStatus.clearRecordingSource();

    // Persist
    try {
      await this.storage.saveItem("comp_groups", this.compGroups());
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
      }),
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
            t.id === takeId ? { ...t, isMuted: !t.isMuted } : t,
          ),
        };
      }),
    );
  }

  /** Delete a take from its comp group */
  deleteTake(groupId: string, takeId: string) {
    const removed = this.compGroups()
      .find((g) => g.id === groupId)
      ?.takes.find((t) => t.id === takeId);
    // Release the object URL for takes this service created, otherwise every
    // deleted take leaks its audio for the life of the session.
    if (removed?.url && this.ownedTakeUrls.has(removed.url)) {
      try {
        URL.revokeObjectURL(removed.url);
      } catch {
        // best-effort
      }
      this.ownedTakeUrls.delete(removed.url);
    }
    this.compGroups.update((groups) =>
      groups.map((g) => {
        if (g.id !== groupId) return g;
        const takes = g.takes.filter((t) => t.id !== takeId);
        return {
          ...g,
          takes,
          selectedTakeId: g.selectedTakeId === takeId ? null : g.selectedTakeId,
        };
      }),
    );
  }

  /** Delete an entire comp group */
  deleteCompGroup(groupId: string) {
    this.compGroups.update((groups) => groups.filter((g) => g.id !== groupId));
    if (this.activeCompGroupId() === groupId) {
      this.activeCompGroupId.set(null);
    }
  }

  // ── Feeding comp groups from other recording surfaces ──────

  /** Object URLs this service created for comp takes (revoked on delete). */
  private readonly ownedTakeUrls = new Set<string>();

  /**
   * Attach a finished recording to the active comp group as a new take.
   *
   * The Vocal Suite and the Audio Recorder used to drop their takes on the
   * floor: comp groups could only ever be filled from the Comp-mode panel, so
   * the comp view's "record takes in the vocal suite, then comp them here"
   * promise was empty. A group is created on demand the first time a take
   * arrives, so the flow works without a manual setup step.
   *
   * @returns the take that was added, or null when there is no audio to add.
   */
  async addTakeFromRecording(
    input: RecordingTakeInput,
  ): Promise<CompTake | null> {
    if (!input.blob || input.blob.size === 0) return null;

    if (!this.activeCompGroup()) {
      this.startNewCompGroup(
        input.trackId,
        input.trackName,
        input.sectionLabel,
      );
    }
    const groupId = this.activeCompGroupId();
    if (!groupId) return null;

    const measured = await this.measureTake(input.blob, input.durationMs);
    const takeNumber = this.currentTakeNumber();
    const now = Date.now();
    const url = URL.createObjectURL(input.blob);
    this.ownedTakeUrls.add(url);

    // Bars are derived from the measured length at the current tempo so the
    // region is real rather than a placeholder span.
    const beatsPerBar = 4;
    const bpm = this.tempo() || 120;
    const secondsPerBar = (beatsPerBar * 60) / bpm;
    const bars = Math.max(
      1,
      Math.ceil(measured.durationMs / 1000 / secondsPerBar),
    );
    const regionStartBar = Math.max(1, input.regionStartBar ?? 1);

    const take: CompTake = {
      id: `take_${now}_${takeNumber}`,
      takeNumber,
      label: input.label || `Take ${takeNumber}`,
      blob: input.blob,
      url,
      durationMs: measured.durationMs,
      recordedAt: now,
      regionStartBar,
      regionEndBar: regionStartBar + bars,
      isMuted: false,
      isCompSelection: false,
      peakDbL: measured.peakDbL,
      peakDbR: measured.peakDbR,
    };

    this.compGroups.update((groups) =>
      groups.map((g) =>
        g.id === groupId
          ? { ...g, takes: [...g.takes, take], selectedTakeId: take.id }
          : g,
      ),
    );
    this.currentTakeNumber.update((n) => n + 1);

    try {
      await this.storage.saveItem("comp_groups", this.compGroups());
    } catch {
      // best-effort
    }

    this.logger.info(
      `SmartRecording: ${take.label} added to comp group "${input.sectionLabel ?? "active"}".`,
    );
    return take;
  }

  /** Current project tempo, defaulting to 120 when the engine cannot answer. */
  private tempo(): number {
    try {
      const bpm = this.audioEngine.tempo?.();
      return typeof bpm === "number" && isFinite(bpm) && bpm > 0 ? bpm : 120;
    } catch {
      return 120;
    }
  }

  /**
   * Measure a take's real length + peaks by decoding it once. Falls back to the
   * caller's wall-clock length (and silence) when the blob cannot be decoded.
   * The decoded buffer is not retained — only the derived numbers are.
   */
  private async measureTake(
    blob: Blob,
    fallbackDurationMs = 0,
  ): Promise<{ durationMs: number; peakDbL: number; peakDbR: number }> {
    const decoded = await this.decodeTake(blob);
    if (!decoded) {
      return {
        durationMs: Math.max(0, Math.round(fallbackDurationMs)),
        peakDbL: -60,
        peakDbR: -60,
      };
    }
    return {
      durationMs: Math.round(decoded.duration * 1000),
      peakDbL: this.peakDbOf(decoded.left),
      peakDbR: this.peakDbOf(decoded.right),
    };
  }

  /**
   * Decode a take blob into the per-channel samples a render reads from.
   * Returns null (with a warning) when the platform cannot decode it, so
   * callers can fall back instead of writing silence into a comp.
   */
  private async decodeTake(blob: Blob): Promise<{
    left: Float32Array;
    right: Float32Array;
    duration: number;
  } | null> {
    try {
      const decoded = await this.audioEngine.ctx.decodeAudioData(
        await blob.arrayBuffer(),
      );
      const left = decoded.getChannelData(0);
      return {
        left,
        right: decoded.numberOfChannels > 1 ? decoded.getChannelData(1) : left,
        duration: decoded.duration,
      };
    } catch (error) {
      this.logger.warn(
        "SmartRecording: could not decode the take; using the reported length.",
        error,
      );
      return null;
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
        // Segment the span the takes actually cover. `Math.min(…, 1)` used to
        // pin every segment grid to bar 1 even when the take rolled later.
        const start = g.takes.length
          ? Math.min(...g.takes.map((t) => t.regionStartBar))
          : 1;
        const end = Math.max(
          start + segBars,
          ...g.takes.map((t) => t.regionEndBar),
        );
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
      }),
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
            s.id === segmentId ? { ...s, takeId } : s,
          ),
        };
      }),
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
      (s) => bar >= s.startBar && bar < s.endBar,
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
    if (this.recordingMode() !== "comp") return null;
    if (!this.isCompRecording()) {
      // First loop pass — start take 1
      await this.startCompTake();
      return null;
    }
    // No post-roll hold here: the next take starts immediately so its audio
    // stays aligned with the bar it is stamped with.
    const finished = await this.finishCompTake(false);
    if (finished) {
      // Next take arms only after the previous one landed with real audio.
      await this.startCompTake();
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
    sampleRate: number,
  ): Array<{ startSample: number; endSample: number }> {
    if (!this.autoSplitEnabled()) return [];

    const threshold = this.autoSplitThreshold();
    const minSilenceSamples = Math.floor(
      (this.autoSplitMinSilenceMs() / 1000) * sampleRate,
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
                silenceStart - Math.floor(sampleRate * 0.01),
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
    sampleRate: number,
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
    sampleRate: number,
  ): Float32Array {
    const crossfadeSamples = Math.floor(
      (this.crossfadeMs() / 1000) * sampleRate,
    );

    // Align splice to nearest zero-crossing for pop-free edit
    const alignedSplice = this.findZeroCrossing(
      bufferA,
      spliceSample,
      sampleRate,
    );

    // A up to the splice, then all of B. The fade is clamped to whatever room
    // the two buffers leave (a take shorter than the crossfade, a splice close
    // to A's end); the output length and B's remainder must follow that clamped
    // length, or the tail of B is written past the end of the result and lost.
    const fadeStart = alignedSplice;
    const fadeEnd = Math.min(
      alignedSplice + crossfadeSamples,
      bufferA.length,
      bufferB.length + alignedSplice,
    );
    const fadeLength = Math.max(0, fadeEnd - fadeStart);

    const result = new Float32Array(alignedSplice + bufferB.length);

    // Copy bufferA up to the splice point
    for (let i = 0; i < alignedSplice; i++) {
      result[i] = bufferA[i];
    }

    // Crossfade region: equal-power fade A out, B in
    for (let i = 0; i < fadeLength; i++) {
      const t = i / Math.max(1, fadeLength);
      // Equal-power crossfade (constant power throughout transition)
      const gainA = Math.cos((t * Math.PI) / 2);
      const gainB = Math.sin((t * Math.PI) / 2);

      const sampleA =
        fadeStart + i < bufferA.length ? bufferA[fadeStart + i] : 0;
      const sampleB = i < bufferB.length ? bufferB[i] : 0;

      result[alignedSplice + i] = sampleA * gainA + sampleB * gainB;
    }

    // Copy the rest of bufferB contiguously after the (possibly short) fade.
    for (let i = Math.max(fadeLength, 0); i < bufferB.length; i++) {
      result[alignedSplice + i] = bufferB[i];
    }

    this.logger.info(
      `SmartRecording: Crossfade applied (${crossfadeSamples} samples, ` +
        `splice at zero-crossing offset ${alignedSplice - spliceSample})`,
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
    sampleRate: number,
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
        sampleRate,
      );
    }

    return current;
  }

  /**
   * Render the group's comp into one downloadable WAV.
   *
   * Each assigned segment is filled from the take that plays it, and every join
   * is an equal-power crossfade rather than a butt splice — which is what
   * "Export Comp" needs to bounce bar-by-bar comping instead of one take. The
   * overlap is built from whatever material the takes actually carry at the
   * join, in this order:
   *   1. the outgoing take's post-roll past its segment (it keeps playing while
   *      the incoming take fades up in place),
   *   2. the incoming take's pre-roll before its segment (it fades up early),
   *   3. a fade-out/fade-in pair in place, when neither side has any.
   * The incoming take's content always lands on its own bar either way.
   *
   * @returns null when the group has no audible take or nothing to decode.
   */
  async renderCompAssembly(groupId?: string): Promise<Blob | null> {
    const group = groupId
      ? this.compGroups().find((g) => g.id === groupId)
      : this.activeCompGroup();
    if (!group) return null;

    const audible = group.takes.filter((t) => !t.isMuted);
    if (audible.length === 0) return null;

    const plan = this.compPlanFor(group, audible);
    if (plan.length === 0) return null;

    const sampleRate = this.audioEngine.ctx.sampleRate;
    const framesPerBar = ((4 * 60) / this.tempo()) * sampleRate;

    // The render spans exactly what the plan plays: an unsplit group renders
    // its comp take over that take's own region, a split group over the
    // segments' span.
    const spanStartBar = Math.min(...plan.map((s) => s.startBar));
    const spanEndBar = Math.max(...plan.map((s) => s.endBar));
    const totalFrames = Math.max(
      1,
      Math.round((spanEndBar - spanStartBar) * framesPerBar),
    );

    const spans = plan.map((span) => ({
      span,
      start: Math.max(
        0,
        Math.round((span.startBar - spanStartBar) * framesPerBar),
      ),
      end: Math.min(
        totalFrames,
        Math.round((span.endBar - spanStartBar) * framesPerBar),
      ),
    }));

    // One fade length for every join, clamped to half the shortest segment so a
    // narrow segment never fades over its own content.
    const shortest = Math.max(
      1,
      Math.min(...spans.map((s) => s.end - s.start)),
    );
    const fade = Math.max(
      1,
      Math.min(
        Math.floor((this.crossfadeMs() / 1000) * sampleRate),
        Math.floor(shortest / 2),
      ),
    );

    // Decode each take once: a comp often reuses one take across segments, and
    // the join decision needs to know how much audio a take holds past the
    // segment it plays.
    const sources = new Map<
      string,
      { left: Float32Array; right: Float32Array }
    >();
    for (const span of plan) {
      if (!span.takeId || sources.has(span.takeId)) continue;
      const take = audible.find((t) => t.id === span.takeId);
      if (!take?.blob) continue;
      const decoded = await this.decodeTake(take.blob);
      if (decoded) {
        sources.set(take.id, { left: decoded.left, right: decoded.right });
      }
    }
    if (sources.size === 0) return null;

    // Resolve the playable segments and how much post-roll each one has.
    const segments: Array<{
      source: { left: Float32Array; right: Float32Array };
      base: number;
      start: number;
      end: number;
      postRoll: number;
    }> = [];
    for (const { span, start, end } of spans) {
      if (end <= start || !span.takeId) continue;
      const take = audible.find((t) => t.id === span.takeId);
      const source = take ? sources.get(take.id) : undefined;
      if (!take || !source) continue;

      // Where the segment's first frame comes from inside the take.
      const base = Math.round(
        (span.startBar - take.regionStartBar) * framesPerBar,
      );
      segments.push({
        source,
        base,
        start,
        end,
        postRoll: source.left.length - (base + (end - start)),
      });
    }
    if (segments.length === 0) return null;

    // Pick the join strategy between each pair: the outgoing take's post-roll
    // if it reaches through the crossfade, else the incoming take's pre-roll,
    // else fades in place.
    const joins = segments.map((segment, index) => {
      if (index === segments.length - 1) return "last" as const;
      if (segment.postRoll >= fade) return "post" as const;
      return segments[index + 1].base >= fade
        ? ("pre" as const)
        : ("none" as const);
    });

    const left = new Float32Array(totalFrames);
    const right = new Float32Array(totalFrames);

    for (let index = 0; index < segments.length; index++) {
      const { source, base, start, end } = segments[index];
      const join = joins[index];
      const incoming = index > 0 ? joins[index - 1] : null;

      const preRoll = incoming === "pre";
      const headFade = preRoll ? fade : 0;
      const inPlace = incoming !== null && !preRoll ? fade : 0;
      const extendTail = join === "post" ? fade : 0;
      // A post-roll join fades out past the boundary; the others fade out before
      // it (and must not double up with the extension).
      const tailFade = join === "pre" || join === "none" ? fade : 0;
      const writeStart = start - headFade;
      const writeEnd = end + extendTail;
      const readStart = base - headFade;

      for (let i = writeStart; i < writeEnd; i++) {
        if (i < 0 || i >= totalFrames) continue;
        const readIndex = readStart + (i - writeStart);
        if (readIndex < 0 || readIndex >= source.left.length) continue;

        let gain = 1;
        if (headFade > 0 && i < start) {
          gain = Math.sin(((i - writeStart) / headFade) * (Math.PI / 2));
        } else if (inPlace > 0 && i < start + inPlace) {
          gain = Math.sin(((i - start) / inPlace) * (Math.PI / 2));
        } else if (extendTail > 0 && i >= end) {
          gain = Math.cos(((i - end) / extendTail) * (Math.PI / 2));
        } else if (tailFade > 0 && i >= end - tailFade) {
          gain = Math.cos(((i - (end - tailFade)) / tailFade) * (Math.PI / 2));
        }

        left[i] += source.left[readIndex] * gain;
        right[i] += source.right[readIndex] * gain;
      }
    }

    const blob = WavEncoder.encodeMultiChannel(
      [left, right],
      "wav-16",
      sampleRate,
    );
    this.logger.info(
      `SmartRecording: rendered comp "${group.sectionLabel}" from ${plan.length} segment${
        plan.length === 1 ? "" : "s"
      } (${(totalFrames / sampleRate).toFixed(2)}s).`,
    );
    return blob;
  }

  /**
   * What to render, in bar order: the group's per-segment assignments when it
   * has them, otherwise one span across the takes' region using the comp take.
   */
  private compPlanFor(
    group: CompGroup,
    audible: CompTake[],
  ): Array<{ startBar: number; endBar: number; takeId: string | null }> {
    const segments = group.segments;
    if (segments && segments.length > 0) {
      return segments
        .map((s) => ({
          startBar: s.startBar,
          endBar: s.endBar,
          takeId: s.takeId ?? group.selectedTakeId,
        }))
        .filter((s) => s.endBar > s.startBar)
        .sort((a, b) => a.startBar - b.startBar);
    }

    // Unsplit: the comp *is* the selected take, so render that take over its
    // own recorded region.
    const take =
      audible.find((t) => t.id === group.selectedTakeId) ??
      audible[audible.length - 1];
    return [
      {
        startBar: take.regionStartBar,
        endBar: take.regionEndBar,
        takeId: take.id,
      },
    ];
  }

  // ── Utility ───────────────────────────────────────────────

  /** Join worklet chunks into one channel, padding a short companion channel. */
  private joinChunks(chunks: Float32Array[], minimumLength = 0): Float32Array {
    const length = Math.max(
      minimumLength,
      chunks.reduce((total, chunk) => total + chunk.length, 0),
    );
    const result = new Float32Array(length);
    let offset = 0;
    for (const chunk of chunks) {
      const writable = Math.min(chunk.length, result.length - offset);
      if (writable <= 0) break;
      result.set(chunk.subarray(0, writable), offset);
      offset += writable;
    }
    return result;
  }

  /** Peak level of a captured channel in dBFS, floored at -60. */
  private peakDbOf(samples: Float32Array): number {
    let peak = 0;
    for (let i = 0; i < samples.length; i++) {
      const abs = Math.abs(samples[i]);
      if (abs > peak) peak = abs;
    }
    if (!(peak > 0)) return -60;
    return Math.max(-60, Math.round(20 * Math.log10(peak) * 10) / 10);
  }
}
