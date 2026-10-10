import {
  Component,
  Input,
  inject,
  signal,
  computed,
  OnInit,
  OnDestroy,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { AudioSessionService } from "../audio-session.service";
import {
  MusicManagerService,
  TrackModel,
} from "../../services/music-manager.service";
import { NeuralMixerService } from "../../services/neural-mixer.service";
import { MixerService } from "../mixer.service";
import { VcaBusService } from "../vca-bus.service";
import { HapticService } from "../../services/haptic.service";
import { AiService } from "../../services/ai.service";
import { Clip } from "../instrument.service";
import { SnackbarService } from "../../services/snackbar.service";
import { RecordingStatusService } from "../recording-status.service";
import { StudioVisualSchedulerService } from "../shared/studio-visual-scheduler.service";
import { StudioMeterComponent } from "../shared/studio-meter/studio-meter.component";

interface MeterReadings {
  [trackId: string]: number;
}

@Component({
  selector: "app-mixer",
  standalone: true,
  imports: [CommonModule, FormsModule, StudioMeterComponent],
  templateUrl: "./mixer.component.html",
  styleUrls: [
    "./mixer.component.css",
    /* Console-grade mixer polish shared with the DJ booth. Registered
       here (not in studio.component.css): emulated encapsulation keeps
       parent styles out of child templates, so the old shell-level
       import never reached these elements. */
    "../subcomponent-refinement.css",
    "../shared/platform-ux.css",
  ],
})
export class MixerComponent implements OnInit, OnDestroy {
  public readonly audioSession = inject(AudioSessionService);
  public readonly musicManager = inject(MusicManagerService);
  private readonly neuralMixer = inject(NeuralMixerService);
  private readonly haptic = inject(HapticService);
  public readonly mixerService = inject(MixerService);
  public readonly vcaBuses = inject(VcaBusService);
  public readonly aiService = inject(AiService);
  private readonly snack = inject(SnackbarService);
  readonly recordingStatus = inject(RecordingStatusService);
  private readonly visualScheduler = inject(StudioVisualSchedulerService);

  @Input() activeClip: Clip | null = null;

  isPlaying = this.audioSession.isPlaying;
  isRecording = this.audioSession.isRecording;
  masterVolume = this.audioSession.masterVolume;
  masterMuted = signal(false);
  selectedTrackId = this.musicManager.selectedTrackId;
  tracks = this.musicManager.tracks;

  /**
   * Console view. The segmented control used to be decorative: "Strips" was
   * hard-coded active and the other two buttons had no handler, so a producer
   * could not reach the send or routing surfaces at all. Each mode now picks
   * exactly ONE send surface per strip (the compact AUX knobs for Strips, the
   * labelled SND A/B faders for Sends) instead of rendering both at once, and
   * Routing focuses the sidechain path.
   */
  mixerView = signal<"strips" | "sends" | "routing">("strips");
  mobileInspectorOpen = signal(true);

  setMixerView(view: "strips" | "sends" | "routing"): void {
    if (this.mixerView() === view) return;
    this.mixerView.set(view);
    this.haptic.light();
  }

  selectedTrack = computed(() =>
    this.tracks().find((t) => t.id === this.selectedTrackId()),
  );

  selectedTrackForMobile = computed(
    () => this.selectedTrack() ?? this.tracks()[0] ?? null,
  );

  toggleMobileInspector(): void {
    this.mobileInspectorOpen.update((open) => !open);
  }

  updatePanPercent(id: string, value: number): void {
    this.musicManager.updateTrackPan(id, Math.max(-100, Math.min(100, value)));
  }

  private analyserMap = new Map<string, AnalyserNode>();
  private analyserBuffers = new Map<string, Uint8Array<ArrayBuffer>>();
  private analyserSources = new Map<string, AudioNode>();
  private masterBuffer: Uint8Array<ArrayBuffer> | null = null;
  private dragCleanup: (() => void) | null = null;
  trackLevels = signal<MeterReadings>({});
  trackPeakHolds = signal<MeterReadings>({});
  masterPeakHold = signal(0);
  private masterAnalyser?: AnalyserNode;
  /**
   * Live L/R phase correlation in [-1, 1], measured by the engine's stereo
   * metering tap. This read "UNAVAILABLE" permanently because the engine used
   * to expose a single downmixed analyser — there were no L/R vectors to
   * compare. The metering tap now keeps the channels separate, so the meter is
   * real; the mastering suite reads the same signal.
   */
  phaseCorrelation = this.audioSession.engine.outputCorrelation;
  readonly phaseCorrelationAvailable = true;
  outputLufs = this.audioSession.engine.outputLufs;
  private stopMeteringTask: (() => void) | null = null;

  // ── Pro: Sidechain routing map ─────────────────────────────
  /** Map of destination trackId → sidechain source trackId */
  sidechainMap = signal<Record<string, string>>({});

  ngOnInit() {
    this.startMetering();
  }

  ngOnDestroy() {
    this.dragCleanup?.();
    this.onStripTouchEnd();
    this.stopMeteringTask?.();
    this.stopMeteringTask = null;
    for (const [id, analyser] of this.analyserMap) {
      try {
        this.analyserSources.get(id)?.disconnect(analyser);
        analyser.disconnect();
      } catch {
        // AnalyserNode may already be disconnected by the audio graph owner.
      }
    }
    this.analyserMap.clear();
    this.analyserSources.clear();
    this.analyserBuffers.clear();
    // The master analyser belongs to AudioEngineService, not this view.
    this.masterAnalyser = undefined;
    this.masterBuffer = null;
  }

  trackById = (_: number, t: TrackModel) => t.id;

  private startMetering() {
    this.stopMeteringTask?.();
    this.stopMeteringTask = this.visualScheduler.register(
      () => this.updateMeters(),
      { fps: 24, immediate: true },
    );
  }

  private updateMeters(): void {
    const levels: MeterReadings = {};
    const tracks = this.tracks();
    const activeIds = new Set(tracks.map((track) => track.id));
    for (const [id, analyser] of this.analyserMap) {
      if (activeIds.has(id)) continue;
      this.analyserSources.get(id)?.disconnect(analyser);
      analyser.disconnect();
      this.analyserMap.delete(id);
      this.analyserSources.delete(id);
      this.analyserBuffers.delete(id);
    }
    tracks.forEach((track) => {
      let analyser = this.analyserMap.get(track.id);
      if (!analyser) {
        analyser = this.audioSession.engine.ctx.createAnalyser();
        analyser.fftSize = 64;
        const out = this.audioSession.engine.getTrackOutput(track.id);
        if (out) {
          try {
            out.connect(analyser);
            this.analyserSources.set(track.id, out);
          } catch {
            /* already connected */
          }
        }
        this.analyserMap.set(track.id, analyser);
      }
      let data = this.analyserBuffers.get(track.id);
      if (!data || data.length !== analyser.frequencyBinCount) {
        data = new Uint8Array(analyser.frequencyBinCount);
        this.analyserBuffers.set(track.id, data);
      }
      analyser.getByteFrequencyData(data);
      const avg = data.length
        ? data.reduce((a, b) => a + b, 0) / data.length / 255
        : 0;
      levels[track.id] = Math.max(0, Math.min(1, avg));
    });
    this.trackLevels.set(levels);

    const DECAY = 0.015;
    this.trackPeakHolds.update((holds) => {
      const next: MeterReadings = {};
      for (const [id, lvl] of Object.entries(levels)) {
        next[id] = Math.max(lvl, (holds[id] ?? 0) - DECAY);
      }
      return next;
    });

    if (!this.masterAnalyser) {
      const master = (this.audioSession.engine as any).masterAnalyser;
      if (master) this.masterAnalyser = master;
    }
    const masterLvl = this.masterLevel();
    this.masterPeakHold.update((v) => Math.max(masterLvl, v - 0.015));
  }

  // ---- Meter helpers ----
  getTrackLevel(id: string): number {
    return Math.min(1, this.trackLevels()[id] || 0);
  }
  getTrackPeakHold(id: string): number {
    return Math.min(1, this.trackPeakHolds()[id] || 0);
  }
  masterLevel(): number {
    if (!this.masterAnalyser) return 0;
    if (!this.masterBuffer || this.masterBuffer.length !== this.masterAnalyser.frequencyBinCount) {
      this.masterBuffer = new Uint8Array(this.masterAnalyser.frequencyBinCount);
    }
    const data = this.masterBuffer;
    this.masterAnalyser.getByteFrequencyData(data);
    const avg = data.reduce((a, b) => a + b, 0) / data.length || 0;
    return Math.min(1, avg / 200);
  }

  // ---- Display helpers ----
  gainPercent(id: string): number {
    const t = this.tracks().find((x) => x.id === id);
    if (!t) return 0;
    return Math.round(Math.max(0, Math.min(1.5, t.gain)) * 100);
  }
  panPercent(id: string): number {
    const t = this.tracks().find((x) => x.id === id);
    if (!t) return 0;
    return Math.round((t.pan ?? 0) * 100);
  }
  faderBottomPct(id: string): number {
    const t = this.tracks().find((x) => x.id === id);
    if (!t) return 0;
    return (Math.max(0, Math.min(1.5, t.gain)) / 1.5) * 100;
  }
  masterFaderBottom(): number {
    return this.masterVolume();
  }
  isSelected(id: string): boolean {
    return this.selectedTrackId() === id;
  }

  // ---- Fader interactions (precision mobile) ----
  private faderFineMode = false;
  private faderPrevGain: Record<string, number> = {};

  onFaderPointerDown(ev: PointerEvent, trackId: string) {
    ev.stopPropagation();
    this.startFaderDrag(ev, trackId);
  }
  startFaderDrag(event: PointerEvent, trackId: string) {
    // Tap-to-position: pressing anywhere on the fader track jumps the fader
    // there (standard DAW behaviour) and the drag continues from that value.
    const rect = (event.currentTarget as HTMLElement)?.getBoundingClientRect?.();
    const fromPosition =
      rect && rect.height > 0
        ? Math.max(0, Math.min(1.5, ((rect.bottom - event.clientY) / rect.height) * 1.5))
        : null;
    let value = fromPosition ?? this.gainPercent(trackId) / 100;
    if (fromPosition !== null) this.musicManager.updateVolume(trackId, value);

    this.faderPrevGain[trackId] = value;
    let lastY = event.clientY;
    let lastTime = Date.now();
    this.faderFineMode = false;

    const onMove = (moveEvent: PointerEvent) => {
      const now = Date.now();
      const dt = Math.max(1, now - lastTime);
      const velocity = Math.abs(moveEvent.clientY - lastY) / dt;
      // Move by the DELTA since the last frame at the ratio active for that
      // frame. (The old code re-scaled the whole accumulated dy whenever
      // pointer velocity crossed the threshold, so a slow→fast transition
      // made the fader jump.)
      const dy = lastY - moveEvent.clientY;
      lastY = moveEvent.clientY;
      lastTime = now;

      // Precision mode: slow drags get finer control
      const isFine = velocity < 0.3 || moveEvent.shiftKey;
      const ratio = isFine ? 1 / 600 : 1 / 200;
      if (isFine && !this.faderFineMode) {
        this.faderFineMode = true;
        this.haptic.preset("detent");
      } else if (!isFine && this.faderFineMode) {
        this.faderFineMode = false;
      }

      value = Math.max(0, Math.min(1.5, value + dy * ratio));
      this.musicManager.updateVolume(trackId, value);

      // Haptic feedback at key levels
      this.checkFaderHaptics(trackId, value);
    };
    const onUp = () => {
      this.faderFineMode = false;
      // Snap to unity (1.0) if close
      const current = this.gainPercent(trackId) / 100;
      if (Math.abs(current - 1.0) < 0.03) {
        this.musicManager.updateVolume(trackId, 1.0);
        this.haptic.preset("faderUnity");
      }
    };
    this.installDrag(onMove, onUp);
  }

  /**
   * Keyboard control for the track fader. A `role="slider"` with tabindex but
   * no key handler is unreachable for keyboard users on desktop.
   */
  onFaderKeydown(event: KeyboardEvent, trackId: string): void {
    const step = event.shiftKey ? 5 : 1;
    const current = this.gainPercent(trackId);
    let next: number | null = null;
    switch (event.key) {
      case "ArrowUp":
      case "ArrowRight":
        next = current + step;
        break;
      case "ArrowDown":
      case "ArrowLeft":
        next = current - step;
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = 150;
        break;
      default:
        return;
    }
    event.preventDefault();
    this.updateTrackVolume(trackId, next);
  }

  private installDrag(onMove: (event: PointerEvent) => void, onUp: () => void): void {
    this.dragCleanup?.();
    const finish = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', finish);
      window.removeEventListener('blur', finish);
      this.dragCleanup = null;
      onUp();
    };
    this.dragCleanup = finish;
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', finish);
    window.addEventListener('blur', finish);
  }

  private checkFaderHaptics(trackId: string, v: number) {
    const prev = this.faderPrevGain[trackId] ?? v;
    // Unity crossing (1.0)
    if ((prev < 1.0 && v >= 1.0) || (prev > 1.0 && v <= 1.0)) {
      this.haptic.preset("faderUnity");
    }
    // Zero crossing
    if (prev > 0.02 && v <= 0.02) {
      this.haptic.preset("faderZero");
    }
    this.faderPrevGain[trackId] = v;
  }

  onMasterFaderPointerDown(event: PointerEvent) {
    event.stopPropagation();
    const rect = (event.currentTarget as HTMLElement)?.getBoundingClientRect?.();
    let value =
      rect && rect.height > 0
        ? Math.max(
            0,
            Math.min(100, ((rect.bottom - event.clientY) / rect.height) * 100),
          )
        : this.masterVolume();
    if (rect && rect.height > 0) this.audioSession.updateMasterVolume(value);

    let lastY = event.clientY;
    let lastTime = Date.now();

    const onMove = (moveEvent: PointerEvent) => {
      const now = Date.now();
      const dt = Math.max(1, now - lastTime);
      const velocity = Math.abs(moveEvent.clientY - lastY) / dt;
      // Delta-based like the track fader: switching into precision mode must
      // not re-scale movement that already happened.
      const dy = lastY - moveEvent.clientY;
      lastY = moveEvent.clientY;
      lastTime = now;

      const isFine = velocity < 0.3 || moveEvent.shiftKey;
      const scale = isFine ? 0.3 : 1.0;
      value = Math.max(0, Math.min(100, value + dy * scale));
      this.audioSession.updateMasterVolume(value);
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    this.installDrag(onMove, onUp);
  }

  /** Keyboard control for the master fader (role=slider reachability). */
  onMasterFaderKeydown(event: KeyboardEvent): void {
    const step = event.shiftKey ? 5 : 1;
    const current = this.masterVolume();
    let next: number | null = null;
    switch (event.key) {
      case "ArrowUp":
      case "ArrowRight":
        next = current + step;
        break;
      case "ArrowDown":
      case "ArrowLeft":
        next = current - step;
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = 100;
        break;
      default:
        return;
    }
    event.preventDefault();
    this.audioSession.updateMasterVolume(Math.max(0, Math.min(100, next)));
  }

  // ---- Pan ----
  onPanPointerDown(ev: PointerEvent, track: TrackModel) {
    ev.stopPropagation();
    const rect = (ev.currentTarget as HTMLElement).getBoundingClientRect();
    const ratio = (ev.clientX - rect.left) / rect.width;
    const pan = Math.max(-1, Math.min(1, (ratio - 0.5) * 2));
    this.musicManager.updateTrackPan(track.id, pan * 100);
    // Pass the pan we just set: reading track.pan inside the drag used the
    // pre-press value, so the first pointermove snapped the pan back to where
    // it was before the press.
    this.startPanDrag(ev, track, pan, rect.width);
  }
  onPanClick(ev: MouseEvent, track: TrackModel) {
    const rect = (ev.currentTarget as HTMLElement).getBoundingClientRect();
    const ratio = (ev.clientX - rect.left) / rect.width;
    const pan = Math.max(-1, Math.min(1, (ratio - 0.5) * 2));
    this.musicManager.updateTrackPan(track.id, pan * 100);
  }
  /** Keyboard control for the pan slider (role=slider reachability). */
  onPanKeydown(event: KeyboardEvent, track: TrackModel): void {
    const step = event.shiftKey ? 10 : 2;
    const current = this.panPercent(track.id);
    let next: number | null = null;
    switch (event.key) {
      case "ArrowLeft":
      case "ArrowDown":
        next = current - step;
        break;
      case "ArrowRight":
      case "ArrowUp":
        next = current + step;
        break;
      case "Home":
        next = -100;
        break;
      case "End":
        next = 100;
        break;
      default:
        return;
    }
    event.preventDefault();
    this.updatePanPercent(track.id, next);
  }
  private startPanDrag(
    event: PointerEvent,
    track: TrackModel,
    initialPan: number = track.pan ?? 0,
    trackWidth: number = 100,
  ) {
    const initialX = event.clientX;
    // Dragging across the slider's own width sweeps the full L↔R range; the
    // floor keeps the gesture usable on the narrow 84px strip.
    const span = Math.max(80, trackWidth);
    const perPx = 2 / span;
    const onMove = (moveEvent: PointerEvent) => {
      const dx = moveEvent.clientX - initialX;
      const newPan = Math.max(-1, Math.min(1, initialPan + dx * perPx));
      this.musicManager.updateTrackPan(track.id, newPan * 100);
    };
    this.installDrag(onMove, () => {});
  }

  // ---- Long-press for quick-solo ----
  private longPressTimer: ReturnType<typeof setTimeout> | null = null;
  private longPressTrackId: string | null = null;
  private longPressStart: { x: number; y: number } | null = null;

  onStripTouchStart(event: TouchEvent, trackId: string): void {
    this.longPressTrackId = trackId;
    const touch = event.touches[0];
    this.longPressStart = touch
      ? { x: touch.clientX, y: touch.clientY }
      : null;
    this.longPressTimer = setTimeout(() => {
      // Long press = quick solo
      this.toggleSolo(trackId);
      this.haptic.preset("soloFlash");
      this.longPressTrackId = null;
      this.longPressStart = null;
    }, 450);
  }

  /**
   * Scrolling the strip bank is a horizontal drag; without this the 450ms solo
   * timer kept running and a scroll gesture soloed whichever strip was held.
   */
  onStripTouchMove(event: TouchEvent): void {
    if (!this.longPressTimer || !this.longPressStart) return;
    const touch = event.touches[0];
    if (!touch) return;
    const dx = touch.clientX - this.longPressStart.x;
    const dy = touch.clientY - this.longPressStart.y;
    if (Math.hypot(dx, dy) > 10) this.onStripTouchEnd();
  }

  onStripTouchEnd(): void {
    if (this.longPressTimer) {
      clearTimeout(this.longPressTimer);
      this.longPressTimer = null;
    }
    this.longPressTrackId = null;
    this.longPressStart = null;
  }

  // ---- Selection / standard ops ----
  selectTrack(id: string): void {
    this.musicManager.selectedTrackId.set(id);
    this.haptic.preset("snap");
  }

  // ── VCA bus handlers (Sprint 2 starter) ───────────────────────────────
  /** Stable accessor so spec mocks without the audio-engine method still work. */
  private get engineApi(): any {
    return this.musicManager.engine;
  }

  /** Reapply every VCA bus's multiplier onto its assigned tracks. Idempotent. */
  private refreshAllVcas(): void {
    if (!this.vcaBuses) return;
    const buses = this.vcaBuses.buses();
    const fn = this.engineApi?.setVcaMultiplier;
    if (typeof fn !== "function") return;
    for (const bus of buses) {
      const value = bus.muted ? 0 : bus.faderValue;
      const trackIds = this.vcaBuses.trackIdsForBus(bus.id);
      for (const tid of trackIds) fn.call(this.engineApi, tid, value);
    }
    // Reset any unassigned tracks back to unity gain.
    const assignments = this.vcaBuses.assignments();
    for (const [tid, vcaId] of Object.entries(assignments)) {
      if (vcaId == null) fn.call(this.engineApi, tid, 1);
    }
  }

  createVcaBus(): void {
    if (!this.vcaBuses) return;
    this.vcaBuses.createBus(`VCA ${this.vcaBuses.busCount() + 1}`);
  }

  deleteVcaBus(busId: string): void {
    if (!this.vcaBuses) return;
    this.vcaBuses.deleteBus(busId);
    this.refreshAllVcas();
  }

  onVcaFaderInput(busId: string, evt: Event): void {
    if (!this.vcaBuses) return;
    const value = parseFloat((evt.target as HTMLInputElement).value);
    if (Number.isNaN(value)) return;
    this.vcaBuses.setBusFader(busId, value);
    this.refreshAllVcas();
  }

  toggleVcaMute(busId: string): void {
    if (!this.vcaBuses) return;
    this.vcaBuses.toggleBusMute(busId);
    this.refreshAllVcas();
  }

  onAssignTrackToVca(trackId: string, busId: string): void {
    if (!this.vcaBuses) return;
    const fn = this.engineApi?.setVcaMultiplier;
    if (busId === "" || busId === "none") {
      this.vcaBuses.unassignTrack(trackId);
      if (typeof fn === "function") fn.call(this.engineApi, trackId, 1);
    } else {
      this.vcaBuses.assignTrack(trackId, busId);
      const bus = this.vcaBuses.buses().find((b) => b.id === busId);
      const value = bus ? (bus.muted ? 0 : bus.faderValue) : 1;
      if (typeof fn === "function") fn.call(this.engineApi, trackId, value);
    }
  }
  toggleMute(id: string): void {
    this.haptic.preset("muteFlash");
    this.musicManager.toggleMute(id);
  }
  toggleSolo(id: string): void {
    this.haptic.preset("soloFlash");
    this.musicManager.toggleSolo(id);
  }
  togglePhase(id: string): void {
    this.haptic.light();
    this.musicManager.togglePhase(id);
  }
  /**
   * True when this track is armed for recording. Single source of truth is
   * RecordingStatusService.armedTrackIds — the same set that drives the
   * record-source flows and the R-button visuals — NOT a per-track field
   * (TrackModel has no `armed` member; keeping a parallel flag on the track
   * object let the R button and the actual armed state fall out of sync).
   */
  isArmed(id: string): boolean {
    return this.recordingStatus.isTrackArmed(id);
  }

  toggleArmTrack(id: string): void {
    this.haptic.medium();
    const track = this.tracks().find((t) => t.id === id);
    const trackName = track?.name || id;
    if (this.recordingStatus.isTrackArmed(id)) {
      this.recordingStatus.disarmTrack(id);
    } else {
      this.recordingStatus.armTrack(id);
      if (this.isRecording()) {
        this.recordingStatus.setRecordingSource({
          type: "mixer-strip",
          trackId: id,
          trackName,
        });
      }
    }
  }
  removeTrack(id: string, event: Event): void {
    event.stopPropagation();
    if (confirm("Permanently remove this mixer track?")) {
      this.musicManager.removeTrack(id);
    }
  }

  updateTrackVolume(id: string | number, value: number) {
    const gain = Math.max(0, Math.min(1.5, value / 100));
    // The mixer component drives the audio engine directly so the fader
    // response stays in lock-step with the AudioContext graph. The
    // companion `updateVolume` call still updates the in-memory track state
    // so the UI keeps the new fader position.
    (this.musicManager as any).engine?.updateTrack?.(id, { gain });
    this.musicManager.updateVolume(id as any, gain);
  }

  /**
   * Send level as a dB readout, so the Sends view shows what its tooltip
   * promises. The value is the real gain relationship — 1.0 is unity (0.0 dB),
   * 0 is silence — not an invented scale.
   */
  sendDb(value: number): string {
    const linear = Math.max(0, Number(value) || 0);
    if (linear <= 0) return "−∞ dB";
    const db = 20 * Math.log10(linear);
    // Typographic minus and explicit sign, matching the pan/fader scales that
    // already read "−0.5 / 0 / +1" elsewhere in the mixer.
    const sign = db > 0 ? "+" : db < 0 ? "−" : "";
    return `${sign}${Math.abs(db).toFixed(1)} dB`;
  }

  updateSend(id: string, send: "A" | "B", value: number) {
    // MusicManagerService.updateSend clamps at 1.0 (100%), so the UI must not
    // offer 150%: at 150 the engine would get 1.5 while the store held 1.0,
    // leaving the readout and the audible level permanently out of sync.
    const normalized = Math.max(0, Math.min(1, value / 100));
    this.musicManager.updateSend(id, send, normalized);
    // Also drive the AudioContext so the aux level is audible immediately.
    // Uses optional chaining — no-op in test environments without the method.
    (this.musicManager as any).engine?.setSendLevel?.(id, send, normalized);
  }

  // ── Pro: Sidechain routing ─────────────────────────────────
  /**
   * The sidechain chip used to be cosmetic: it toggled a local UI map while
   * the engine's real compressor routing (`connectSidechain` /
   * `disconnectSidechain` — worklet ducking of `target` by `trigger`) was
   * never called from anywhere in the app. Now every UI change drives the
   * actual audio path, and the UI state IS the engine's routing state.
   */
  toggleSidechain(trackId: string, sourceTrackId: string | null): void {
    this.haptic.medium();
    const engine =
      (this.musicManager as any).engine ?? this.audioSession.engine;
    const trigger = sourceTrackId;
    if (
      trigger == null ||
      trigger === "" ||
      this.sidechainMap()[trackId] === trigger
    ) {
      const prev = this.sidechainMap()[trackId];
      if (prev) {
        try {
          engine?.disconnectSidechain?.(prev, trackId);
        } catch {
          /* engine routing not available in lightweight test hosts */
        }
      }
      this.sidechainMap.update((m) => {
        const next = { ...m };
        delete next[trackId];
        return next;
      });
      this.snack.info(`Sidechain on ${this.findTrackName(trackId)} cleared`);
      return;
    }
    // Routing a new (or different) trigger → target pair.
    const prev = this.sidechainMap()[trackId];
    if (prev && prev !== trigger) {
      try {
        engine?.disconnectSidechain?.(prev, trackId);
      } catch {
        /* ignore */
      }
    }
    try {
      engine?.connectSidechain?.(trigger, trackId);
    } catch {
      /* engine routing not available in lightweight test hosts */
    }
    this.sidechainMap.update((m) => ({ ...m, [trackId]: trigger }));
    this.snack.success(
      `Sidechain: ${this.findTrackName(trigger)} → ${this.findTrackName(trackId)}`,
    );
  }
  hasSidechain(trackId: string): boolean {
    return !!this.sidechainMap()[trackId];
  }
  sidechainSourceFor(trackId: string): string {
    return this.sidechainMap()[trackId] ?? "";
  }
  sidechainSourceNameFor(trackId: string): string {
    const sourceId = this.sidechainMap()[trackId];
    return this.findTrackName(sourceId);
  }
  /** Build a list of candidate source tracks (excluding the track itself) */
  sidechainCandidates(trackId: string): TrackModel[] {
    return this.tracks().filter((t) => t.id !== trackId);
  }
  private findTrackName(id: string | null | undefined): string {
    if (!id) return "";
    return this.tracks().find((t) => t.id === id)?.name ?? "";
  }

  // ---- AI / Master strip ----
  /**
   * Routing view helper — the number of tracks with a sidechain feed, so the
   * console can tell the artist whether the routing page is worth opening.
   */
  sidechainCount = computed(
    () => this.tracks().filter((t) => this.hasSidechain(t.id)).length,
  );

  applyNeuralMix(): void {
    this.neuralMixer.applyNeuralMix();
    this.haptic.medium();
    this.snack.success("Neural mix applied");
  }

  /** Master level captured when mute engaged, so unmute restores it exactly. */
  private masterVolumeBeforeMute: number | null = null;

  toggleMasterMute(): void {
    if (!this.masterMuted()) {
      this.masterVolumeBeforeMute = this.masterVolume();
      this.masterMuted.set(true);
      this.audioSession.updateMasterVolume(0);
      return;
    }
    // Restore the pre-mute level — `masterVolume() || 80` always unmuted at
    // 80% because muting had just zeroed the stored value.
    const restore = this.masterVolumeBeforeMute ?? 80;
    this.masterVolumeBeforeMute = null;
    this.masterMuted.set(false);
    this.audioSession.updateMasterVolume(restore);
  }
  resetMaster(): void {
    this.masterMuted.set(false);
    this.masterVolumeBeforeMute = null;
    this.audioSession.updateMasterVolume(80);
    this.haptic.medium();
    this.snack.info("Master reset to 80%");
  }
  openSmartEq(): void {
    this.aiService.getSmartMixAdvice(this.tracks());
    this.snack.info("Smart EQ suggestions are in the AI Assistant");
  }

  // Color classifier for phase correlation readout
  phaseCorrelationColor(): string {
    if (!this.phaseCorrelationAvailable) return '#94a3b8';
    const p = this.phaseCorrelation();
    if (p < 0) return "#ff3d6e"; // red – out of phase
    if (p < 0.3) return "#ffb627"; // amber – wide
    return "#34f5c5"; // mint – mono-safe
  }
  phaseCorrelationLabel(): string {
    if (!this.phaseCorrelationAvailable) return 'UNAVAILABLE';
    const p = this.phaseCorrelation();
    if (p < 0) return "OUT OF PHASE";
    if (p < 0.3) return "WIDE";
    return "MONO SAFE";
  }
}
