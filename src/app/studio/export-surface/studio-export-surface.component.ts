import { CommonModule } from "@angular/common";
import {
  Component,
  EventEmitter,
  Output,
  computed,
  inject,
  signal,
} from "@angular/core";

import { ProjectWorkspaceService } from "../project-workspace.service";
import {
  COMPRESSED_EXPORT_BITRATES,
  EXPORT_FORMATS,
  ExportService,
  defaultExportBitrate,
  exportSupportsBitrate,
} from "../../services/export.service";
import {
  DELIVERY_TARGETS,
  compareToDeliveryTarget,
  describeExportAnalysis,
  type DeliveryComparison,
  type ExportAnalysisVerdict,
} from "./export-analysis.util";
import {
  ExportReviewService,
  type PendingMixdown,
} from "./export-review.service";
import {
  ReleasePipelineService,
  type MasterDeliveryFiling,
} from "../../services/release-pipeline.service";
import {
  CollaborationService,
  type ProjectConflict,
} from "../../services/collaboration.service";
import { MusicManagerService } from "../../services/music-manager.service";

type ExportFeedback = { tone: "ok" | "error"; text: string };

/** A master that left the Studio, kept until the artist files or dismisses it. */
interface DeliveryReceipt {
  fileName: string;
  formatLabel: string;
  sampleRate: number;
  method: "download" | "share";
  deliveredAt: number;
  projectId: string;
  projectTitle: string;
  analysis: ExportAnalysisVerdict;
  /** Frozen at delivery: later target changes cannot rewrite this receipt. */
  comparison: DeliveryComparison;
}

/** A saved delivery setup: the same options a finished release needs twice. */
export interface ExportPreset {
  id: string;
  name: string;
  format: string;
  sampleRate: 44100 | 48000;
  stemBitDepth: 16 | 24;
  /** Lossy-codec bitrate in bits per second; absent on older presets. */
  bitrate?: number;
}

const EXPORT_PRESETS_KEY = "smuve_export_presets_v1";
const EXPORT_TARGET_KEY = "smuve_export_target_v1";

function loadDeliveryTargetId(): string {
  try {
    const stored = localStorage.getItem(EXPORT_TARGET_KEY);
    if (stored && DELIVERY_TARGETS.some((target) => target.id === stored)) {
      return stored;
    }
  } catch {
    // Storage may be blocked; fall back to the streaming target.
  }
  return DELIVERY_TARGETS[0].id;
}

function loadExportPresets(): ExportPreset[] {
  try {
    const raw = localStorage.getItem(EXPORT_PRESETS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (preset): preset is ExportPreset =>
        !!preset &&
        typeof preset.id === "string" &&
        typeof preset.name === "string" &&
        typeof preset.format === "string",
    );
  } catch {
    return [];
  }
}

/**
 * Export surface shared by the Export workspace and the export side panel.
 *
 * Everything here goes through ExportService / ProjectWorkspaceService, so the
 * files it produces are byte-for-byte what the studio's own transport export
 * writes. Options are real render properties: the sample rate is passed to the
 * OfflineAudioContext, and the format is the one handed to the encoder.
 */
@Component({
  selector: "app-studio-export-surface",
  standalone: true,
  imports: [CommonModule],
  templateUrl: "./studio-export-surface.component.html",
  // The platform layer gives the native selects a 16px minimum (Android Chrome
  // zooms the viewport on a smaller focused control) and the shared touch rules.
  styleUrls: [
    "./studio-export-surface.component.css",
    "../shared/platform-ux.css",
  ],
})
export class StudioExportSurfaceComponent {
  /** The shell owns navigation; the chosen target rides with the request. */
  @Output() openMastering = new EventEmitter<string>();

  /**
   * A real file finished leaving the Studio. The shell forwards audio
   * deliveries to the Masterclass auto-checker, so "export a WAV" ticks only
   * after the download/share actually completed.
   */
  @Output() delivered = new EventEmitter<string>();

  private readonly exportService = inject(ExportService);
  private readonly projectWorkspace = inject(ProjectWorkspaceService);
  private readonly exportReview = inject(ExportReviewService);
  private readonly releasePipeline = inject(ReleasePipelineService);
  private readonly collaboration = inject(CollaborationService);
  private readonly musicManager = inject(MusicManagerService);

  constructor() {
    // The Export view is recreated after a visit to Mastering. Pick the review
    // back up instead of asking the artist to render the project again.
    const review = this.exportReview.restore(this.projectBase());
    if (!review) return;
    this.format.set(review.pending.format);
    this.bitrate.set(review.pending.bitrate);
    this.sampleRate.set(review.pending.sampleRate);
    this.analysis.set(review.analysis);
    this.pendingExport.set(review.pending);
    this.reviewNeedsRefresh.set(review.needsRefresh);
    this.status.set("Master measured — choose Export Anyway or Open Mastering.");
  }

  readonly formats = EXPORT_FORMATS;
  readonly sampleRates = ExportService.SAMPLE_RATES;
  readonly bitrateOptions = COMPRESSED_EXPORT_BITRATES;

  /**
   * Delivery presets. The format/rate/depth triplet is what an artist sets the
   * same way for every release (streaming master, video deliverable, stems for
   * a mix engineer), so it can be saved by name and reapplied as one tap.
   */
  readonly presets = signal<ExportPreset[]>(loadExportPresets());
  readonly presetName = signal("");

  readonly format = signal(EXPORT_FORMATS[1].id);
  readonly sampleRate = signal<44100 | 48000>(44100);
  readonly stemBitDepth = signal<16 | 24>(24);
  readonly bitrate = signal(defaultExportBitrate(EXPORT_FORMATS[1].id));
  readonly supportsBitrate = computed(() =>
    exportSupportsBitrate(this.format()),
  );

  readonly busy = signal(false);
  /** Null while a render is in flight without discrete steps. */
  readonly progress = signal<number | null>(null);
  readonly eta = signal<string | null>(null);
  readonly canCancel = signal(false);
  readonly status = signal("");
  private exportStartedAt = 0;
  private exportController: AbortController | null = null;
  readonly feedback = signal<ExportFeedback | null>(null);
  /**
   * Measurements of the audio that was actually encoded. Null until a mixdown
   * completes; a rendered file should never be delivered without telling the
   * artist what it measures.
   */
  readonly analysis = signal<ExportAnalysisVerdict | null>(null);
  /** Holds the rendered master between the measurement and the download. */
  readonly pendingExport = signal<PendingMixdown | null>(null);
  /** Set when Mastering was opened after this render, so the master may differ. */
  readonly reviewNeedsRefresh = signal(false);
  /** The delivered master, so the next step can be a release rather than a note. */
  readonly deliveryReceipt = signal<DeliveryReceipt | null>(null);
  readonly releaseFiling = signal<MasterDeliveryFiling | null>(null);
  readonly filingRelease = signal(false);
  /** Lets the receipt label the action before it has been filed. */
  readonly activeRelease = this.releasePipeline.activeRelease;
  /**
   * Peer edits that collided with the local project. A master measured before
   * one of these is a different version from what the collaborators see.
   */
  readonly collaborationConflicts = this.collaboration.pendingConflicts.asReadonly();
  readonly collaborationConflictCount = computed(
    () => this.collaborationConflicts().length,
  );
  readonly collaborationBlocked = computed(
    () => this.collaborationConflictCount() > 0,
  );
  readonly trackConflict = (_: number, conflict: ProjectConflict) =>
    `${conflict.trackId}:${conflict.fieldKey}`;

  /** The destination this master is judged against; remembered across sessions. */
  readonly deliveryTargets = DELIVERY_TARGETS;
  readonly deliveryTargetId = signal(loadDeliveryTargetId());
  readonly deliveryTarget = computed(
    () =>
      this.deliveryTargets.find(
        (target) => target.id === this.deliveryTargetId(),
      ) ?? this.deliveryTargets[0],
  );
  readonly deliveryComparison = computed(() => {
    const analysis = this.analysis();
    return analysis
      ? compareToDeliveryTarget(analysis, this.deliveryTarget())
      : null;
  });

  readonly formatLabel = computed(() => {
    const info =
      this.formats.find((entry) => entry.id === this.format()) ??
      this.formats[0];
    const bitrate = this.supportsBitrate() ? this.bitrate() : 0;
    return bitrate
      ? `${info.label} ${Math.round(bitrate / 1000)}k`
      : info.label;
  });

  setFormat(event: Event) {
    const format = (event.target as HTMLSelectElement).value;
    this.format.set(format);
    this.bitrate.set(defaultExportBitrate(format));
  }

  setBitrate(event: Event) {
    const requested = Number((event.target as HTMLSelectElement).value);
    this.bitrate.set(
      this.bitrateOptions.includes(requested)
        ? requested
        : defaultExportBitrate(this.format()),
    );
  }

  setSampleRate(event: Event) {
    const rate = Number((event.target as HTMLSelectElement).value);
    this.sampleRate.set(rate === 48000 ? 48000 : 44100);
  }

  setStemBitDepth(event: Event) {
    this.stemBitDepth.set(
      Number((event.target as HTMLSelectElement).value) === 16 ? 16 : 24,
    );
  }

  setPresetName(value: string) {
    this.presetName.set(value);
  }

  /** Save the current options under a name (persisted across sessions). */
  savePreset() {
    const name =
      this.presetName().trim() ||
      `${this.formatLabel()} · ${this.rateLabel(this.sampleRate())}`;
    const preset: ExportPreset = {
      id: `preset-${Date.now().toString(36)}`,
      name: name.slice(0, 48),
      format: this.format(),
      sampleRate: this.sampleRate(),
      stemBitDepth: this.stemBitDepth(),
      bitrate: this.bitrate(),
    };
    // Same name overwrites instead of piling up duplicates.
    const next = [
      ...this.presets().filter(
        (entry) => entry.name.toLowerCase() !== preset.name.toLowerCase(),
      ),
      preset,
    ];
    this.presets.set(next);
    this.persistPresets();
    this.presetName.set("");
    this.feedback.set({ tone: "ok", text: `Preset “${preset.name}” saved` });
  }

  /** Apply a saved setup to the real options the export path reads. */
  applyPreset(preset: ExportPreset) {
    this.format.set(preset.format);
    this.sampleRate.set(preset.sampleRate === 48000 ? 48000 : 44100);
    this.stemBitDepth.set(preset.stemBitDepth === 16 ? 16 : 24);
    const savedBitrate = Number(preset.bitrate);
    this.bitrate.set(
      exportSupportsBitrate(preset.format) &&
        this.bitrateOptions.includes(savedBitrate)
        ? savedBitrate
        : defaultExportBitrate(preset.format),
    );
    this.feedback.set({ tone: "ok", text: `Preset “${preset.name}” applied` });
  }

  deletePreset(id: string) {
    this.presets.update((list) => list.filter((preset) => preset.id !== id));
    this.persistPresets();
  }

  private persistPresets() {
    try {
      localStorage.setItem(EXPORT_PRESETS_KEY, JSON.stringify(this.presets()));
    } catch {
      // Storage can be full or blocked; the presets still work this session.
    }
  }

  setDeliveryTarget(event: Event): void {
    const id = (event.target as HTMLSelectElement).value;
    if (!this.deliveryTargets.some((target) => target.id === id)) return;
    this.deliveryTargetId.set(id);
    try {
      localStorage.setItem(EXPORT_TARGET_KEY, id);
    } catch {
      // Remembering the choice is a convenience; the check still applies.
    }
  }

  rateLabel(rate: number): string {
    return rate === 48000 ? "48 kHz" : "44.1 kHz";
  }

  bitrateLabel(bitrate: number): string {
    return `${Math.round(bitrate / 1000)} kbps`;
  }

  /** Render → master polish → encode → download, at the chosen format/rate. */
  async exportMixdown() {
    if (this.busy() || this.pendingExport()) return;

    // A new render replaces the previous delivery; its receipt is not evidence
    // for the master that is about to be measured.
    this.deliveryReceipt.set(null);
    this.releaseFiling.set(null);
    this.begin("Rendering mixdown…", true);
    try {
      // Render the arrangement without the master chain. The mix is retained,
      // so a later Mastering change costs one master pass, not a full bounce.
      const preMaster = await this.exportService.renderProjectOffline({
        sampleRate: this.sampleRate(),
        preMaster: true,
        signal: this.exportController?.signal,
        onProgress: (percent) => {
          this.progress.set(percent);
          this.status.set(`Rendering mixdown… ${percent}%`);
          this.updateEta(percent);
        },
      });

      this.progress.set(94);
      this.status.set("Applying master chain…");
      const mastered = await this.exportService.masterRetainedMix(preMaster);
      this.progress.set(97);
      this.status.set("Applying master polish…");
      const polished = await this.exportService.applySmuvePolish(mastered);
      // Measure the exact audio that will be encoded, not a re-render or an
      // estimate from fader positions.
      const analysis = this.measureExport(polished);

      // Stop before encoding. The artist sees the measured master first and
      // decides whether it is ready to leave the browser.
      this.busy.set(false);
      this.canCancel.set(false);
      this.progress.set(null);
      this.eta.set(null);
      this.exportStartedAt = 0;
      const pending: PendingMixdown = {
        preMaster,
        format: this.format(),
        bitrate: this.bitrate(),
        supportsBitrate: this.supportsBitrate(),
        formatLabel: this.formatLabel(),
        sampleRate: this.sampleRate(),
      };
      this.analysis.set(analysis);
      this.pendingExport.set(pending);
      this.exportReview.keep(pending, analysis, this.projectBase());
      this.reviewNeedsRefresh.set(false);
      this.status.set("Master measured — choose Export Anyway or Open Mastering.");
    } catch (error) {
      if (this.isAbortError(error)) {
        this.finish("ok", "Export cancelled");
      } else {
        this.fail("Mixdown export failed", error);
      }
    }
  }

  /** Encode and download the mixdown the artist just reviewed. */
  async confirmExport(): Promise<void> {
    if (this.busy()) return;
    const pending = this.pendingExport();
    if (!pending) return;
    if (this.blockOnCollaborationConflicts("exporting this master")) return;

    // Mastering is applied to the retained mix at delivery time, so a download
    // never ships a master the artist has already moved past.
    this.busy.set(true);
    this.status.set("Applying the current master…");
    let bufferToEncode: AudioBuffer;
    let analysis: ExportAnalysisVerdict | null;
    try {
      const current = await this.masterPending(pending);
      bufferToEncode = current.buffer;
      analysis = current.analysis;
      this.analysis.set(analysis);
      this.reviewNeedsRefresh.set(false);
    } catch (error) {
      this.fail("Master refresh failed", error);
      return;
    }

    this.pendingExport.set(null);
    this.exportReview.clear();
    this.reviewNeedsRefresh.set(false);
    this.begin(`Encoding ${pending.formatLabel}…`);
    this.analysis.set(analysis);
    this.progress.set(20);
    try {
      const blob = pending.supportsBitrate
        ? await this.exportService.exportToFormat(
            bufferToEncode,
            pending.format,
            pending.bitrate,
          )
        : await this.exportService.exportToFormat(
            bufferToEncode,
            pending.format,
          );

      // Codec fallback returns PCM WAV, so the extension must follow the bytes.
      const extension =
        blob.type === "audio/wav" ? "wav" : this.formatInfo(pending.format).ext;
      const filename = `${this.projectBase()}_${Date.now()}.${extension}`;
      this.exportService.downloadBlob(blob, filename);
      this.progress.set(100);
      this.analysis.set(analysis);
      if (analysis) {
        this.deliveryReceipt.set(
          this.buildDeliveryReceipt(filename, "download", analysis, pending),
        );
      }
      this.releaseFiling.set(null);
      this.finish("ok", `Downloaded ${filename}`);
      this.delivered.emit("mixdown");
    } catch (error) {
      // The reviewed file was never delivered; its measurements no longer
      // describe anything the artist has.
      this.analysis.set(null);
      this.fail("Mixdown export failed", error);
    }
  }

  /** Leave the review without downloading. */
  discardPendingExport(): void {
    this.pendingExport.set(null);
    this.analysis.set(null);
    this.reviewNeedsRefresh.set(false);
    this.exportReview.clear();
    this.status.set("");
  }

  /**
   * Go fix the master without throwing the reviewed render away. The retained
   * mix is re-mastered when the artist returns, so no arrangement render is
   * needed to hear or download the corrected file.
   */
  openMasteringFromReview(): void {
    const targetId = this.deliveryTargetId();
    this.exportReview.markNeedsRefresh();
    this.reviewNeedsRefresh.set(true);
    this.openMastering.emit(targetId);
  }

  /**
   * Reapply the master chain to the retained mix and re-measure it. The
   * arrangement is not rendered again.
   */
  async refreshPendingExport(): Promise<void> {
    const pending = this.pendingExport();
    if (this.busy() || !pending) return;

    this.busy.set(true);
    this.feedback.set(null);
    this.status.set("Applying the current master…");
    try {
      const refreshed = await this.masterPending(pending);
      this.analysis.set(refreshed.analysis);
      this.exportReview.keep(pending, refreshed.analysis, this.projectBase());
      this.reviewNeedsRefresh.set(false);
      this.busy.set(false);
      this.status.set("Master refreshed — choose Export Anyway or Open Mastering.");
      this.feedback.set({
        tone: "ok",
        text: "Master reapplied from the retained mix · arrangement not re-rendered",
      });
    } catch (error) {
      this.fail("Master refresh failed", error);
    }
  }

  /** Encode and share the retained mix at the review's captured settings. */
  private async shareReviewedMaster(pending: PendingMixdown): Promise<void> {
    if (this.blockOnCollaborationConflicts("sharing this master")) return;
    this.begin(`Preparing ${pending.formatLabel} for sharing…`);
    try {
      const current = await this.masterPending(pending);
      const blob = pending.supportsBitrate
        ? await this.exportService.exportToFormat(
            current.buffer,
            pending.format,
            pending.bitrate,
          )
        : await this.exportService.exportToFormat(
            current.buffer,
            pending.format,
          );

      // Codec fallback returns PCM WAV, so the extension must follow the bytes.
      const extension =
        blob.type === "audio/wav" ? "wav" : this.formatInfo(pending.format).ext;
      const filename = `${this.projectBase()}_${Date.now()}.${extension}`;
      const shared = await this.exportService.shareBlob(blob, filename);

      // Keep the review: a dismissed share sheet is indistinguishable from a
      // download fallback here, so the artist can still download or share again.
      this.analysis.set(current.analysis);
      this.reviewNeedsRefresh.set(false);
      this.deliveryReceipt.set(
        current.analysis
          ? this.buildDeliveryReceipt(filename, "share", current.analysis, pending)
          : null,
      );
      this.releaseFiling.set(null);
      this.exportReview.keep(pending, current.analysis, this.projectBase());
      this.finish(
        "ok",
        shared
          ? "Share sheet opened with the reviewed master"
          : "Reviewed master share finished",
      );
      this.delivered.emit("share");
    } catch (error) {
      this.fail("Share export failed", error);
    }
  }

  /** Master the retained mix with the chain as it stands now, then measure it. */
  private async masterPending(pending: PendingMixdown): Promise<{
    buffer: AudioBuffer;
    analysis: ExportAnalysisVerdict | null;
  }> {
    const mastered = await this.exportService.masterRetainedMix(
      pending.preMaster,
    );
    const polished = await this.exportService.applySmuvePolish(mastered);
    return { buffer: polished, analysis: this.measureExport(polished) };
  }

  /** A measurement must never fail an otherwise valid export. */
  private measureExport(buffer: AudioBuffer): ExportAnalysisVerdict | null {
    try {
      return describeExportAnalysis(this.exportService.analyzeBuffer(buffer));
    } catch {
      return null;
    }
  }

  /** Cancel between render stages; an in-flight audio render must finish. */
  cancelExport() {
    if (!this.canCancel() || !this.busy() || !this.exportController) return;
    this.exportController.abort();
    this.eta.set(null);
    this.status.set("Finishing current render…");
  }

  private updateEta(percent: number) {
    if (percent <= 0 || percent >= 100 || this.exportStartedAt <= 0) {
      this.eta.set(null);
      return;
    }
    const elapsed = (Date.now() - this.exportStartedAt) / 1000;
    const remaining = Math.max(0, elapsed * (100 - percent) / percent);
    const seconds = Math.round(remaining);
    this.eta.set(`${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`);
  }

  private isAbortError(error: unknown): boolean {
    return error instanceof DOMException && error.name === "AbortError";
  }

  /** Master plus one WAV per unmuted track, zipped, with real file progress. */
  async exportStems() {
    if (this.busy()) return;

    this.begin("Rendering master stem…");
    this.progress.set(0);
    try {
      await this.exportService.exportStems({
        bitDepth: this.stemBitDepth(),
        sampleRate: this.sampleRate(),
        onProgress: (completed, total) => {
          this.progress.set(Math.round((completed / total) * 100));
          this.status.set(
            completed >= total
              ? "Packaging stems…"
              : `Rendered ${completed} of ${total} files…`,
          );
        },
      });

      this.finish(
        "ok",
        `Stems exported · master + ${this.stemBitDepth()}-bit WAV per track (.zip) at ${this.rateLabel(this.sampleRate())}`,
      );
      this.delivered.emit("stems");
    } catch (error) {
      this.fail("Stem export failed", error);
    }
  }

  /** The whole project — metadata, tracks, takes — as a .smuve bundle. */
  exportProject() {
    try {
      this.projectWorkspace.downloadProjectBundle();
      this.feedback.set({
        tone: "ok",
        text: "Project bundle exported (.smuve)",
      });
      this.delivered.emit("project");
    } catch (error) {
      this.fail("Project export failed", error);
    }
  }

  /** Standard MIDI File of the arrangement, one track per MIDI track. */
  exportMidi() {
    try {
      const blob = this.exportService.exportProjectMidi();
      this.exportService.downloadBlob(
        blob,
        `${this.projectBase()}_${Date.now()}.mid`,
      );
      this.feedback.set({
        tone: "ok",
        text: "MIDI arrangement exported (.mid)",
      });
      this.delivered.emit("midi");
    } catch (error) {
      this.fail("MIDI export failed", error);
    }
  }

  /**
   * DAWproject bundle — the open interchange format other DAWs read. It needs
   * the project's audio encoded into the archive, so it is async like the
   * render paths and shares their busy/progress state.
   */
  async exportDawproject() {
    if (this.busy()) return;

    this.begin("Packaging DAWproject…");
    try {
      const blob = await this.exportService.exportDawproject();
      const filename = `${this.projectBase()}_${Date.now()}.dawproject`;
      this.exportService.downloadBlob(blob, filename);
      this.finish(
        "ok",
        `Downloaded ${filename} — notes, audio and mixer levels for another DAW`,
      );
      this.delivered.emit("dawproject");
    } catch (error) {
      this.fail("DAWproject export failed", error);
    }
  }

  /**
   * Share the master the artist already reviewed, or render a fresh mixdown
   * when no review exists. A reviewed master is re-mastered from the retained
   * mix, so sharing never bounces the arrangement again.
   */
  async shareExport() {
    if (this.busy()) return;
    if (this.blockOnCollaborationConflicts("sharing a master")) return;
    const pending = this.pendingExport();
    if (pending) {
      await this.shareReviewedMaster(pending);
      return;
    }

    this.begin(`Rendering ${this.formatLabel()} for sharing…`);
    try {
      const shared = await this.exportService.exportAndShare(this.format(), {
        ...(this.supportsBitrate() ? { bitrate: this.bitrate() } : {}),
        sampleRate: this.sampleRate(),
      });
      this.finish(
        "ok",
        shared
          ? "Share sheet opened with the mixdown"
          : "Mixdown downloaded and share link copied",
      );
      this.delivered.emit("mixdown");
    } catch (error) {
      this.fail("Share failed", error);
    }
  }

  /**
   * Never ship or file a master while a collaborator edit is unresolved.
   * Returns true when the action was blocked so the caller can stop.
   */
  private blockOnCollaborationConflicts(action: string): boolean {
    const count = this.collaborationConflictCount();
    if (count === 0) return false;
    this.feedback.set({
      tone: "error",
      text: `Resolve ${count} unresolved collaborator edit${count === 1 ? "" : "s"} before ${action}.`,
    });
    return true;
  }

  /**
   * Resolve one peer collision from the export review. Keeping the local value
   * leaves the measured master valid; applying theirs changes the project, so a
   * review or receipt measured before it can no longer describe the session.
   */
  resolveCollaborationConflict(
    conflict: ProjectConflict,
    decision: "mine" | "theirs",
  ): void {
    const hadReview = this.pendingExport() !== null;
    const hadReceipt = this.deliveryReceipt() !== null;

    this.collaboration.resolveConflict(
      conflict.trackId,
      conflict.fieldKey,
      decision,
    );

    if (decision === "theirs") {
      if (hadReview) this.discardPendingExport();
      if (hadReceipt) {
        this.deliveryReceipt.set(null);
        this.releaseFiling.set(null);
      }
      this.feedback.set({
        tone: "ok",
        text: hadReview
          ? "Collaborator edit applied — render a fresh mixdown before exporting."
          : hadReceipt
            ? "Collaborator edit applied — export a fresh master before filing."
            : "Collaborator edit applied to the project.",
      });
      return;
    }

    this.feedback.set({
      tone: "ok",
      text: "Kept your version. The measured master still matches this project.",
    });
  }

  trackName(trackId: string): string {
    return (
      this.musicManager.tracks().find((track) => track.id === trackId)?.name ||
      "Unnamed track"
    );
  }

  conflictFieldLabel(fieldKey: string): string {
    return (fieldKey || "edit")
      .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
      .replace(/[_-]+/g, " ")
      .trim();
  }

  formatConflictValue(value: unknown): string {
    if (value === null || value === undefined) return "(empty)";
    if (typeof value === "string") return value.trim() || "(empty)";
    if (typeof value === "number" || typeof value === "boolean") {
      return String(value);
    }
    try {
      const json = JSON.stringify(value);
      if (typeof json !== "string") return String(value);
      return json.length > 72 ? `${json.slice(0, 69)}…` : json;
    } catch {
      return "(unreadable value)";
    }
  }

  private buildDeliveryReceipt(
    fileName: string,
    method: DeliveryReceipt["method"],
    analysis: ExportAnalysisVerdict,
    pending: PendingMixdown,
  ): DeliveryReceipt {
    const metadata = this.projectWorkspace.metadata();
    return {
      fileName,
      formatLabel: pending.formatLabel,
      sampleRate: pending.sampleRate,
      method,
      deliveredAt: Date.now(),
      projectId: metadata?.id ?? "",
      projectTitle: metadata?.name || "Untitled",
      analysis,
      comparison: compareToDeliveryTarget(analysis, this.deliveryTarget()),
    };
  }

  /**
   * Attach the delivered master to the release pipeline. The measurement is
   * carried as evidence; a passing target completes mastering, a miss is
   * recorded as a miss rather than silently ticking the stage.
   */
  async fileDeliveryForRelease(): Promise<void> {
    const receipt = this.deliveryReceipt();
    if (!receipt || this.filingRelease() || this.releaseFiling()) return;
    if (this.blockOnCollaborationConflicts("filing this master")) return;

    this.filingRelease.set(true);
    this.feedback.set(null);
    try {
      const filing = await this.releasePipeline.fileMasterDelivery(
        receipt.projectId,
        receipt.projectTitle,
        {
          fileName: receipt.fileName,
          formatLabel: receipt.formatLabel,
          sampleRate: receipt.sampleRate,
          method: receipt.method,
          deliveredAt: receipt.deliveredAt,
          targetId: receipt.comparison.targetId,
          targetLabel: receipt.comparison.targetLabel,
          lufs: receipt.analysis.lufs,
          truePeakDb: receipt.analysis.truePeakDb,
          correlation: receipt.analysis.correlation,
          allPass: receipt.comparison.allPass,
          projectId: receipt.projectId || undefined,
        },
      );
      this.releaseFiling.set(filing);
      const sameName =
        filing.releaseName.trim().toLowerCase() ===
        filing.trackTitle.trim().toLowerCase();
      const filed = sameName
        ? `Filed to “${filing.releaseName}”`
        : `Filed to “${filing.releaseName}” · ${filing.trackTitle}`;
      this.feedback.set({
        tone: "ok",
        text: filing.releaseCreated
          ? `Started “${filing.releaseName}” as a Single · master filed`
          : filed,
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : "unknown error";
      this.feedback.set({
        tone: "error",
        text: `Could not file this master in the release pipeline · ${detail}`,
      });
    } finally {
      this.filingRelease.set(false);
    }
  }

  dismissDeliveryReceipt(): void {
    if (this.filingRelease()) return;
    this.deliveryReceipt.set(null);
    this.releaseFiling.set(null);
  }

  private begin(status: string, cancellable = false) {
    this.busy.set(true);
    this.progress.set(null);
    this.eta.set(null);
    this.canCancel.set(cancellable);
    this.feedback.set(null);
    // Any prior measurement described a different render/format; never leave
    // stale numbers sitting under a new export.
    this.analysis.set(null);
    this.status.set(status);
    this.exportStartedAt = Date.now();
    this.exportController = new AbortController();
  }

  private finish(tone: ExportFeedback["tone"], text: string) {
    this.busy.set(false);
    this.progress.set(null);
    this.eta.set(null);
    this.canCancel.set(false);
    this.exportStartedAt = 0;
    this.exportController = null;
    this.status.set("");
    this.feedback.set({ tone, text });
  }

  private fail(prefix: string, error: unknown) {
    const detail = error instanceof Error ? error.message : "unknown error";
    this.finish("error", `${prefix} · ${detail}`);
  }

  private formatInfo(format: string = this.format()) {
    return this.formats.find((entry) => entry.id === format) ?? this.formats[0];
  }

  private projectBase(): string {
    return (
      this.projectWorkspace.metadata()?.name || "S_M_U_V_E_Project"
    ).replace(/[^a-zA-Z0-9_-]/g, "_");
  }
}
