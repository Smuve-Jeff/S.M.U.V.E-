import {
  Component,
  inject,
  signal,
  AfterViewInit,
  OnDestroy,
  ElementRef,
  ViewChild,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { AudioEngineService } from "../../services/audio-engine.service";
import { AiService } from "../../services/ai.service";
import { UIService } from "../../services/ui.service";
import { HapticService } from "../../services/haptic.service";
import { SnackbarService } from "../../services/snackbar.service";
import { AiMixAssistantService } from "../effects/ai-mix-assistant.service";
import { ExportService } from "../../services/export.service";
import { PluginStoreService } from "../../services/plugin-store.service";
import { MusicManagerService } from "../../services/music-manager.service";
import { ABSOLUTE_GATE_LUFS } from "../../services/loudness-meter";
import { SpectrumAnalyzerComponent } from "../spectrum-analyzer/spectrum-analyzer.component";

interface MasteringBand {
  id: number;
  name: string;
  range: string;
  gain: number;
  threshold: number;
  ratio: number;
}

interface MasteringPreset {
  id: string;
  label: string;
  emoji: string;
  tagline: string;
  targetLufs: number;
  safeCeiling: number;
  /** Per-band delta gains in dB applied to the pre-preset EQ anchor */
  bandDelta: Record<number, number>;
  /** Compressor / limiter setup hints */
  ratio: number;
  threshold: number;
  roastNote: string;
}

/** A measurable delivery destination (platform mastering guides). */
interface DeliveryTarget {
  id: string;
  platform: string;
  /** Integrated loudness the platform bills the master against, LUFS. */
  targetLufs: number;
  /** True-peak ceiling (dBTP) the delivery spec asks to stay under. */
  ceilingDbtp: number;
  /** One line of honest context for the artist. */
  note: string;
}

@Component({
  selector: "app-mastering-suite",
  standalone: true,
  imports: [CommonModule, FormsModule, SpectrumAnalyzerComponent],
  templateUrl: "./mastering-suite.component.html",
  styleUrls: ["./mastering-suite.component.css", "../shared/platform-ux.css"],
})
export class MasteringSuiteComponent implements AfterViewInit, OnDestroy {
  private audioEngine = inject(AudioEngineService);

  // ── Pro metering surface ──────────────────────────────
  /** The engine's master tap — the same node the LUFS meter reads. */
  readonly masterAnalyser = () => this.audioEngine?.masterAnalyser ?? null;
  /** Analyzer runs only while the transport rolls (and Stage FX is on). */
  readonly metering = () => !!this.audioEngine?.isPlaying?.();
  public aiService = inject(AiService);
  private haptic = inject(HapticService);
  private snack = inject(SnackbarService);
  private aiMix = inject(AiMixAssistantService);
  private exportService = inject(ExportService);
  private pluginStore = inject(PluginStoreService);
  private musicManager = inject(MusicManagerService);
  masteringRoast = signal<string>("Analyzing dynamics...");
  public uiService = inject(UIService);

  // ── Sprint B1 Phase 2 — real-render mastering meters ────────────
  /** Rendered true peak in dBFS (4x oversampled), not the sample peak. */
  renderedTruePeak = signal<number | null>(null);
  renderedLra = signal<number | null>(null);
  renderedCorrelation = signal<number | null>(null);
  renderedLufs = signal<number | null>(null);
  renderedRms = signal<number | null>(null);
  renderedDuration = signal<number | null>(null);
  renderedPluginCount = signal(0);
  isRendering = signal(false);

  /** Sprint B2 — the polished AudioBuffer is retained so the Audition
   *  button can replay it without re-bouncing the project. */
  renderedBufferRef: AudioBuffer | null = null;

  /** Toggle audition through the live ctx (bypasses master polish + limiter). */
  auditionToggle(): void {
    if (!this.renderedBufferRef) return;
    if (this.audioEngine.auditionPlaying()) {
      this.audioEngine.stopAudition();
      return;
    }
    this.audioEngine.playAudition(this.renderedBufferRef, () => undefined);
  }

  // ── Reference-track A/B matching (parity gap §14) ─────────────────────

  /** Name of the loaded commercial reference, or null while unloaded. */
  referenceName = signal<string | null>(null);
  /** BS.1770 stats measured from the reference with the same meter as the master. */
  referenceStats = signal<null | {
    peakDb: number;
    truePeakDb: number;
    rmsDb: number;
    lufs: number;
    lra: number;
    durationSec: number;
  }>(null);
  referenceBusy = signal(false);
  private referenceBuffer: AudioBuffer | null = null;

  isReferenceLoaded(): boolean {
    return this.referenceStats() !== null && this.referenceBuffer !== null;
  }

  /**
   * Decode and measure a picked reference track.
   *
   * The reference is measured with `ExportService.analyzeBuffer` — the same
   * BS.1770-4 meter that grades the mix — so the numbers an artist compares
   * come from one instrument rather than two that happen to share a label.
   */
  async onReferenceChosen(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    // Allow re-picking the same file after a fix without clearing the picker.
    input.value = "";
    if (!file) return;
    const ctx = this.audioEngine.ctx;
    if (!ctx || typeof ctx.decodeAudioData !== "function") {
      this.snack.error("Reference import unavailable in this browser");
      return;
    }
    this.referenceBusy.set(true);
    try {
      const bytes = await file.arrayBuffer();
      const buffer: AudioBuffer = await ctx.decodeAudioData(bytes);
      this.referenceBuffer = buffer;
      this.referenceName.set(file.name);
      const stats = this.exportService.analyzeBuffer(buffer);
      this.referenceStats.set({
        peakDb: stats.peakDb,
        truePeakDb: stats.truePeakDb,
        rmsDb: stats.rmsDb,
        lufs: stats.lufs,
        lra: stats.lra,
        durationSec: stats.durationSec,
      });
      this.snack.success(
        `Reference loaded · ${stats.lufs.toFixed(1)} LUFS · ${this.formatSeconds(stats.durationSec)}`,
      );
      this.haptic.medium();
    } catch (err) {
      this.referenceBuffer = null;
      this.referenceName.set(null);
      this.referenceStats.set(null);
      this.snack.error(
        "Reference import failed · " +
          (err instanceof Error ? err.message.toLowerCase() : "unsupported audio"),
      );
    } finally {
      this.referenceBusy.set(false);
    }
  }

  /**
   * dB the master needs to read the reference's integrated loudness.
   *
   * Null while either side is unmeasured (no reference, or the loudness meter
   * has not rolled through the mix yet), so the Match button cannot act on a
   * stale or fabricated number.
   */
  referenceDeltaDb(): number | null {
    const ref = this.referenceStats();
    const master = this.audioEngine.outputLufs();
    if (!ref || ref.lufs <= ABSOLUTE_GATE_LUFS) return null;
    if (!Number.isFinite(master) || master <= ABSOLUTE_GATE_LUFS) return null;
    return Math.round((ref.lufs - master) * 10) / 10;
  }

  /** Apply the reference delta as master makeup (post-limiter ceiling intact). */
  matchReferenceLoudness(): void {
    const delta = this.referenceDeltaDb();
    if (delta === null) {
      this.snack.info("Roll the transport so the meter measures your master");
      return;
    }
    if (delta === 0) {
      this.snack.success("Master already reads the reference loudness");
      return;
    }
    this.audioEngine.setMasterMakeupDb(delta);
    this.snack.success(
      `Loudness matched · ${Math.abs(delta).toFixed(1)} dB ${delta > 0 ? "up" : "down"}`,
    );
    this.haptic.medium();
  }

  /** A/B playhead: audition the reference without the master chain in the way. */
  toggleReferenceAudition(): void {
    const buffer = this.referenceBuffer;
    if (!buffer) return;
    if (this.audioEngine.auditionPlaying()) {
      this.audioEngine.stopAudition();
      return;
    }
    this.audioEngine.playAudition(buffer, () => undefined);
  }

  clearReference(): void {
    if (this.referenceBuffer && this.audioEngine.auditionPlaying()) {
      this.audioEngine.stopAudition();
    }
    this.referenceBuffer = null;
    this.referenceName.set(null);
    this.referenceStats.set(null);
    // A reference match without the reference is a leftover make-up skew.
    this.audioEngine.setMasterMakeupDb(0);
    this.snack.info("Reference cleared · makeup 0 dB");
  }

  // ── Streaming delivery targets + conform (parity gap §14) ─────────────

  /** Delivery target currently conformed to, for the chip highlight. */
  activeDeliveryTargetId = signal<string | null>(null);

  /**
   * Delivery specs from the platforms' published mastering guides. Values are
   * the numbers whose absence previously forced an artist to type targets by
   * hand; if a platform revises its spec, this is the one place to update.
   */
  readonly deliveryTargets: DeliveryTarget[] = [
    {
      id: "spotify",
      platform: "Spotify",
      targetLufs: -14,
      ceilingDbtp: -1,
      note: "Streamed loud masters are quietly turned down, not turned up",
    },
    {
      id: "apple",
      platform: "Apple Music",
      targetLufs: -16,
      ceilingDbtp: -1,
      note: "Tightest headroom on the big streamers — protects the Sound Check gain match",
    },
    {
      id: "youtube",
      platform: "YouTube",
      targetLufs: -14,
      ceilingDbtp: -1,
      note: "Same integrated target as Spotify, mono-fallback monitoring on phones",
    },
    {
      id: "podcast",
      platform: "Podcast / spoken",
      targetLufs: -16,
      ceilingDbtp: -1.5,
      note: "Speech-first spec; leave room for phone speaker intelligibility",
    },
    {
      id: "club",
      platform: "Club / loud",
      targetLufs: -9,
      ceilingDbtp: -0.3,
      note: "Deliberately hot: play systems, not streamers, hear this one",
    },
  ];

  /**
   * Conform the master to a platform's delivery spec.
   *
   * Sets the integrated-loudness target and the true-peak ceiling (which
   * routes to the live limiter), and — when the last Render &amp; Master pass
   * has measured the bounce — applies the shortfall as master makeup so the
   * next render lands on the target instead of just aiming at it.
   */
  applyDeliveryTarget(targetId: string): void {
    const target = this.deliveryTargets.find((t) => t.id === targetId);
    if (!target) return;

    this.targetLufs.set(target.targetLufs);
    this.safeCeiling.set(target.ceilingDbtp);
    this.audioEngine.setMasteringTargets({
      lufs: target.targetLufs,
      truePeak: target.ceilingDbtp,
    });
    this.activeDeliveryTargetId.set(target.id);
    this.activePresetId.set(null); // a platform spec beats a genre preset

    const rendered = this.renderedLufs();
    if (Number.isFinite(rendered) && rendered! > ABSOLUTE_GATE_LUFS) {
      const makeup = Math.round((target.targetLufs - rendered!) * 10) / 10;
      this.audioEngine.setMasterMakeupDb(Math.max(-12, Math.min(12, makeup)));
      this.snack.success(
        `${target.platform} conformed · target ${target.targetLufs} LUFS, ceiling ${target.ceilingDbtp} dBTP, makeup ${makeup > 0 ? "+" : ""}${makeup} dB`,
      );
    } else {
      this.snack.success(
        `${target.platform} conformed · target ${target.targetLufs} LUFS, ceiling ${target.ceilingDbtp} dBTP — render to measure the delta`,
      );
    }

    this.haptic.medium();
  }

  /** Render seconds into a mm:ss label for the audition progress read-out. */
  formatSeconds(s: number): string {
    if (!s || !isFinite(s)) return "0:00";
    const m = Math.floor(s / 60);
    const sec = Math.floor(s - m * 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  }

  /**
   * Sprint B1 Phase 2 — Render & Master: bounce the arrangement offline with
   * the REAL synth voice graph, run the enabled WASM plugin chain as polish,
   * then analyze the result into true meters (peak / LUFS / RMS / duration).
   */
  async renderAndMaster(): Promise<void> {
    if (this.isRendering()) return;
    this.isRendering.set(true);
    try {
      this.masteringRoast.set("Bouncing real synth voices offline…");
      const raw = await this.exportService.renderProjectOffline();
      this.masteringRoast.set("Applying WASM plugin chain…");
      const polished = await this.exportService.applySmuvePolish(raw);
      this.renderedBufferRef = polished;
      const stats = this.exportService.analyzeBuffer(polished);
      this.renderedTruePeak.set(stats.truePeakDb);
      this.renderedLufs.set(stats.lufs);
      this.renderedRms.set(stats.rmsDb);
      this.renderedLra.set(stats.lra);
      this.renderedCorrelation.set(stats.correlation);
      this.renderedDuration.set(stats.durationSec);
      const enabled = this.pluginStore.catalog
        .filter((p) => this.pluginStore.isEnabled(p.id))
        .map((p) => p.name);
      this.renderedPluginCount.set(enabled.length);
      this.masteringRoast.set(
        `Real render done · ${stats.durationSec}s · true peak ${stats.truePeakDb} dBFS · ${stats.lufs} LUFS · LRA ${stats.lra} LU · correlation ${stats.correlation}${enabled.length ? " · chain: " + enabled.join(" → ") : ""}`,
      );
      this.smartAssistSuggestion.set(
        enabled.length
          ? `Rendered with ${enabled.length} WASM plugin${enabled.length > 1 ? "s" : ""} in the polish chain`
          : "Rendered with real synth voices — enable WASM plugins in the Plugin Store to add polish",
      );
    } catch (err: any) {
      this.masteringRoast.set(
        "Render failed · " + (err?.message ?? "unknown error"),
      );
    } finally {
      this.isRendering.set(false);
    }
  }

  /** Selected genre for AI mastering (null = auto-detect) */
  readonly availableGenres = [
    { value: "", label: "Auto-Detect", emoji: "🤖" },
    { value: "trap", label: "Trap", emoji: "🔥" },
    { value: "house", label: "House", emoji: "🎵" },
    { value: "lo-fi", label: "Lo-Fi", emoji: "☕" },
    { value: "pop", label: "Pop", emoji: "⭐" },
    { value: "dubstep", label: "Dubstep", emoji: "💥" },
    { value: "reggaeton", label: "Reggaeton", emoji: "🎶" },
    { value: "ambient", label: "Ambient", emoji: "🌌" },
    { value: "jazz", label: "Jazz", emoji: "🎷" },
    { value: "rnb", label: "R&B", emoji: "🎸" },
  ];
  selectedGenre = signal<string>("");
  aiDetectedGenre = signal<string>("");

  /** Select a genre for AI mastering. */
  selectGenre(value: string): void {
    this.selectedGenre.set(value);
    this.haptic.light();
  }

  @ViewChild("spectrogram") spectrogramRef!: ElementRef<HTMLCanvasElement>;

  bands = signal<MasteringBand[]>([
    {
      id: 1,
      name: "SUB",
      range: "20Hz - 120Hz",
      gain: -1.2,
      threshold: -12.4,
      ratio: 4.1,
    },
    {
      id: 2,
      name: "LOW",
      range: "120Hz - 500Hz",
      gain: -0.5,
      threshold: -8.1,
      ratio: 2.5,
    },
    {
      id: 3,
      name: "MID",
      range: "500Hz - 2.5kHz",
      gain: 0,
      threshold: -2.4,
      ratio: 1.8,
    },
    {
      id: 4,
      name: "HIGH",
      range: "2.5kHz - 10kHz",
      gain: 0.8,
      threshold: -4.2,
      ratio: 2.1,
    },
    {
      id: 5,
      name: "AIR",
      range: "10kHz - 22kHz",
      gain: 1.5,
      threshold: -1.2,
      ratio: 1.5,
    },
  ]);

  // Every reading below is measured by the shared BS.1770 meter. They used to
  // be a fake pair of constants (LRA 6.2, correlation 0.82) and a sample peak
  // labelled "True Peak", which told the artist nothing about their master.
  lufsIntegrated = this.audioEngine.outputLufs;
  truePeak = this.audioEngine.outputTruePeak;
  lra = this.audioEngine.outputLra;
  correlation = this.audioEngine.outputCorrelation;
  targetLufs = signal(-14);
  safeCeiling = signal(-0.1);
  isProcessing = signal(false);
  smartAssistSuggestion = signal<string>("");
  eqMaskingHint = signal<string>("");

  /**
   * Meter-bar fills on a fixed scale, so the bar reflects the reading instead
   * of a hard-coded 70 / 90 that never moved.
   */
  lufsBarPercent = (lufs: number): number =>
    Number.isFinite(lufs)
      ? Math.max(0, Math.min(100, ((lufs + 40) / 40) * 100))
      : 0;

  peakBarPercent = (db: number): number =>
    Number.isFinite(db)
      ? Math.max(0, Math.min(100, ((db + 30) / 30) * 100))
      : 0;
  /** Track which preset is currently selected (for visual highlight). */
  activePresetId = signal<string | null>(null);

  /** True while a preset-shaped EQ can be returned to its captured anchor. */
  presetEqActive = signal(false);

  /**
   * Band gains, thresholds and ratios captured before the first preset. Every
   * preset shapes from this anchor instead of the current bands, so repeated
   * taps are idempotent and switching presets cannot stack two EQ curves.
   */
  private presetAnchorBands: Map<
    number,
    { gain: number; threshold: number; ratio: number }
  > | null = null;

  /** Master compressor threshold/ratio before the first preset shaped it. */
  private presetAnchorCompressor: {
    threshold: number;
    ratio: number;
  } | null = null;

  // ── Pro: AI mastering presets ───────────────────────────────────
  readonly presets: MasteringPreset[] = [
    {
      id: "streaming",
      label: "Streaming",
      emoji: "🎧",
      tagline: "Spotify · Apple · YouTube",
      targetLufs: -14,
      safeCeiling: -1,
      // Streaming keeps headroom; gentle low-shelf trim, slight air boost
      bandDelta: { 1: -0.6, 2: -0.3, 3: 0, 4: +0.4, 5: +0.6 },
      ratio: 2.5,
      threshold: -8,
      roastNote:
        "Streaming mastered · soft ceiling, plenty of headroom for codec transcoding",
    },
    {
      id: "club",
      label: "Club / Loud",
      emoji: "🔥",
      tagline: "Festival · Sound System",
      targetLufs: -9,
      safeCeiling: -0.3,
      // Aggressive limiting; tight low-mid, hard push on air
      bandDelta: { 1: +1.0, 2: 0, 3: -0.4, 4: +0.8, 5: +1.2 },
      ratio: 6,
      threshold: -6,
      roastNote:
        "Club mastered · -9 LUFS, tight driver-grade limiting, hits like a wall",
    },
    {
      id: "vinyl",
      label: "Vinyl / Warm",
      emoji: "🖤",
      tagline: "Pre-master analog feel",
      targetLufs: -16,
      safeCeiling: -2,
      // Soft highs, gentle low-mid warmth
      bandDelta: { 1: -0.2, 2: +0.3, 3: +0.1, 4: -0.4, 5: -0.8 },
      ratio: 1.8,
      threshold: -10,
      roastNote:
        "Vinyl warmed · gentle compression, soft highs, pre-cut headroom",
    },
    {
      id: "broadcast",
      label: "Broadcast",
      emoji: "📺",
      tagline: "TV · Radio · Podcast",
      targetLufs: -23,
      safeCeiling: -2,
      // Dialogue-friendly: gentle mid bump + rolled-off air
      bandDelta: { 1: -0.4, 2: 0, 3: +0.5, 4: -0.2, 5: -0.6 },
      ratio: 3,
      threshold: -8,
      roastNote:
        "Broadcast ready · -23 LUFS broadcast standard, dialog-preserving EQ",
    },
    {
      id: "mastered",
      label: "Mastered",
      emoji: "⚡",
      tagline: "Maximum loudness",
      targetLufs: -8,
      safeCeiling: -0.1,
      // Brick-wall master
      bandDelta: { 1: +0.8, 2: +0.2, 3: 0, 4: +1.0, 5: +1.4 },
      ratio: 8,
      threshold: -4,
      roastNote:
        "Mastered hot · -8 LUFS, brick-wall limiting, competitive loudness",
    },
  ];

  private animationId: number | null = null;

  ngAfterViewInit() {
    const targets = (this.audioEngine as any).getMasteringTargets();
    this.targetLufs.set(targets.lufs);
    this.safeCeiling.set(targets.truePeak);
    this.syncMasteringBands();
    this.startSpectrogram();
  }

  ngOnDestroy() {
    if (this.animationId !== null) {
      cancelAnimationFrame(this.animationId);
    }
  }

  // ── Pro: apply preset ───────────────────────────────────────
  applyPreset(preset: MasteringPreset): void {
    this.haptic.heavy();
    this.activePresetId.set(preset.id);
    this.presetEqActive.set(true);

    // Capture the pre-preset shape before any preset value reaches the bands
    // or the master compressor. A second preset must not replace this anchor.
    this.presetAnchorBands ??= new Map(
      this.bands().map((b) => [
        b.id,
        { gain: b.gain ?? 0, threshold: b.threshold, ratio: b.ratio },
      ]),
    );
    this.presetAnchorCompressor ??= (this.audioEngine as any)
      .getCompressorSettings?.() ?? null;

    // Update LUFS target + safe ceiling
    this.targetLufs.set(preset.targetLufs);
    this.safeCeiling.set(preset.safeCeiling);
    (this.audioEngine as any).setMasteringTargets?.({
      lufs: preset.targetLufs,
      truePeak: preset.safeCeiling,
    });
    (this.audioEngine as any).configureCompressor?.({
      threshold: preset.threshold,
      ratio: preset.ratio,
    });

    // Presets are absolute shapes measured from the artist's pre-preset EQ,
    // not additive deltas. Anchoring the first application keeps a second tap
    // of the same preset — or a switch to another preset — from drifting the
    // existing curve.
    this.bands.update((arr) =>
      arr.map((b) => ({
        ...b,
        gain: this.clampBandGain(
          (this.presetAnchorBands!.get(b.id)?.gain ?? 0) +
            (preset.bandDelta[b.id] ?? 0),
        ),
        ratio: preset.ratio,
        threshold: preset.threshold,
      })),
    );
    this.syncMasteringBands();

    // Presets set goals; the separate live meters remain measurements from the master tap.

    this.masteringRoast.set(preset.roastNote);
    this.smartAssistSuggestion.set(
      `${preset.emoji} ${preset.label} preset applied · target ${preset.targetLufs} LUFS`,
    );
    this.eqMaskingHint.set(
      `EQ shaped for ${preset.tagline} · AIR ${preset.bandDelta[5] >= 0 ? "+" : ""}${preset.bandDelta[5]?.toFixed(1)}dB, SUB ${preset.bandDelta[1] >= 0 ? "+" : ""}${preset.bandDelta[1]?.toFixed(1)}dB`,
    );

    this.snack.success(
      `${preset.emoji} ${preset.label} preset · target ${preset.targetLufs} LUFS, ceiling ${preset.safeCeiling} dBFS`,
    );
  }

  /**
   * Return the mastering EQ and master compressor to the settings captured
   * before the first preset. Loudness target and ceiling are left untouched.
   */
  resetPresetEq(): void {
    const anchor = this.presetAnchorBands;
    if (!anchor) return;
    this.bands.update((arr) =>
      arr.map((b) => {
        const original = anchor.get(b.id);
        return original ? { ...b, ...original } : b;
      }),
    );
    if (this.presetAnchorCompressor) {
      (this.audioEngine as any).configureCompressor?.(
        this.presetAnchorCompressor,
      );
    }
    // Push the per-band values last: the engine expands a global compressor
    // request across all bands, which must not overwrite the band anchor.
    this.syncMasteringBands();
    this.presetAnchorBands = null;
    this.presetAnchorCompressor = null;
    this.presetEqActive.set(false);
    this.activePresetId.set(null);
    this.eqMaskingHint.set("EQ and compressor reset to their pre-preset shape");
    this.smartAssistSuggestion.set(
      "EQ and compressor reset to your pre-preset shape",
    );
    this.snack.info(
      "Mastering EQ and compressor reset to pre-preset settings",
    );
    this.haptic.light();
  }

  /**
   * Apply a manual band compressor edit. Threshold and ratio use the same
   * ranges as the engine's compressor; blank or invalid input is ignored.
   */
  updateBandCompressor(
    bandId: number,
    field: "threshold" | "ratio",
    rawValue: string | number,
  ): void {
    const raw = String(rawValue).trim();
    if (!raw) return;
    const numeric = Number(raw);
    if (!Number.isFinite(numeric)) return;
    const clamped =
      field === "threshold"
        ? Math.max(-60, Math.min(0, numeric))
        : Math.max(1, Math.min(20, numeric));
    const value = Math.round(clamped * 10) / 10;
    this.bands.update((arr) =>
      arr.map((b) => (b.id === bandId ? { ...b, [field]: value } : b)),
    );
    this.syncMasteringBands();
    // The preset no longer describes the shape exactly, but its anchor still
    // lets the artist return to the pre-preset settings.
    this.activePresetId.set(null);
  }

  /** Commit an input edit and show the clamped value the model accepted. */
  onBandCompressorChange(
    bandId: number,
    field: "threshold" | "ratio",
    event: Event,
  ): void {
    const input = event.target as HTMLInputElement | null;
    if (!input) return;
    this.updateBandCompressor(bandId, field, input.value);
    const band = this.bands().find((b) => b.id === bandId);
    if (band) input.value = String(band[field]);
  }

  /** Push the visible five-band compressor state into the live master chain. */
  private syncMasteringBands(): void {
    (this.audioEngine as any).setMasteringBands?.(this.bands());
  }

  /** Clamp an EQ gain to the band range and round to the displayed 0.1 dB. */
  private clampBandGain(db: number): number {
    const clamped = Math.max(-12, Math.min(12, db));
    return Math.round(clamped * 10) / 10;
  }

  // ── Roast message generator ─────────────────────────────────
  refreshRoast(): void {
    const roast = this.aiService.getMasteringRoast?.() ?? null;
    this.masteringRoast.set(
      roast ||
        `Integrated ${this.lufsIntegrated().toFixed(1)} LUFS · peak ${this.truePeak().toFixed(1)} dBFS · ${this.activePresetId() ? "preset active" : "custom shape"}`,
    );
    this.haptic.medium();
  }

  async processMastering() {
    this.refreshRoast();
    this.isProcessing.set(true);
    try {
      // Auto-detect genre if none selected
      const genre = this.selectedGenre() || undefined;
      if (!genre) {
        this.aiDetectedGenre.set(this.aiMix.detectGenre());
      }

      // Run the full AI auto-master analysis chain with genre hint
      const report = this.aiMix.autoMaster(genre);

      // Update UI with mastering targets from the engine
      const targets = this.audioEngine.getMasteringTargets();
      this.targetLufs.set(targets.lufs);
      this.safeCeiling.set(targets.truePeak);

      // Build smart assist readout from the report
      const summaryLines = report.filter(
        (l) => l.startsWith("🎯") || l.startsWith("✅"),
      );
      this.smartAssistSuggestion.set(
        summaryLines.join(" · ") || "AI Master applied",
      );

      // Show EQ hint from the report
      const eqLine = report.find((l) => l.startsWith("📈"));
      this.eqMaskingHint.set(
        eqLine?.replace("📈 ", "") || "EQ optimized for mix density",
      );

      // Update roast with the analysis
      const detailLines = report.filter(
        (l) =>
          !l.startsWith("🎯") && !l.startsWith("✅") && !l.startsWith("📈"),
      );
      this.masteringRoast.set(detailLines.join(" | "));

      // Deactivate manual preset since AI chose optimal settings
      this.activePresetId.set(null);

      this.snack.success("AI Mastering complete — full chain optimized");
    } finally {
      this.isProcessing.set(false);
    }
  }

  updateTargetLufs(value: number) {
    const next = Math.max(-24, Math.min(-8, value));
    this.targetLufs.set(next);
    (this.audioEngine as any).setMasteringTargets?.({ lufs: next });
    this.activePresetId.set(null); // manually overridden
  }

  updateSafeCeiling(value: number) {
    const next = Math.max(-1.2, Math.min(-0.01, value));
    this.safeCeiling.set(next);
    (this.audioEngine as any).setMasteringTargets?.({ truePeak: next });
    this.activePresetId.set(null);
  }

  private startSpectrogram() {
    const canvas = this.spectrogramRef.nativeElement;
    const ctx = canvas.getContext("2d")!;
    const analyser = (this.audioEngine as any).getMasterAnalyser?.();
    if (!analyser) return;

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      this.animationId = requestAnimationFrame(draw);
      analyser.getByteFrequencyData(dataArray);

      const tempCanvas = document.createElement("canvas");
      tempCanvas.width = canvas.width;
      tempCanvas.height = canvas.height;
      const tempCtx = tempCanvas.getContext("2d");
      if (tempCtx) {
        tempCtx.drawImage(canvas, 0, 0);
        ctx.fillStyle = "#0d0d0d";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(tempCanvas, 0, 1);
      }

      for (let i = 0; i < bufferLength; i++) {
        const value = dataArray[i];
        const x = (i / bufferLength) * canvas.width;
        const hue = (value / 255) * 280;
        ctx.fillStyle = `hsla(${hue}, 80%, 50%, ${value / 255})`;
        ctx.fillRect(x, 0, canvas.width / bufferLength, 1);
      }
    };
    draw();
  }
}
