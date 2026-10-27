import { CommonModule } from "@angular/common";
import { Component, computed, inject, signal } from "@angular/core";

import { ProjectWorkspaceService } from "../project-workspace.service";
import { EXPORT_FORMATS, ExportService } from "../../services/export.service";

type ExportFeedback = { tone: "ok" | "error"; text: string };

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
  private readonly exportService = inject(ExportService);
  private readonly projectWorkspace = inject(ProjectWorkspaceService);

  readonly formats = EXPORT_FORMATS;
  readonly sampleRates = ExportService.SAMPLE_RATES;

  readonly format = signal(EXPORT_FORMATS[1].id);
  readonly sampleRate = signal<44100 | 48000>(44100);
  readonly stemBitDepth = signal<16 | 24>(24);

  readonly busy = signal(false);
  /** Null while a render is in flight without discrete steps. */
  readonly progress = signal<number | null>(null);
  readonly status = signal("");
  readonly feedback = signal<ExportFeedback | null>(null);

  readonly formatLabel = computed(
    () =>
      this.formats.find((entry) => entry.id === this.format())?.label ??
      this.formats[0].label,
  );

  setFormat(event: Event) {
    this.format.set((event.target as HTMLSelectElement).value);
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

  rateLabel(rate: number): string {
    return rate === 48000 ? "48 kHz" : "44.1 kHz";
  }

  /** Render → master polish → encode → download, at the chosen format/rate. */
  async exportMixdown() {
    if (this.busy()) return;

    this.begin("Rendering mixdown…");
    try {
      const buffer = await this.exportService.renderProjectOffline({
        sampleRate: this.sampleRate(),
      });

      this.status.set("Applying master polish…");
      const polished = await this.exportService.applySmuvePolish(buffer);

      this.status.set(`Encoding ${this.formatLabel()}…`);
      const blob = await this.exportService.exportToFormat(
        polished,
        this.format(),
      );

      // Codec fallback returns PCM WAV, so the extension must follow the bytes.
      const extension =
        blob.type === "audio/wav" ? "wav" : this.formatInfo().ext;
      const filename = `${this.projectBase()}_${Date.now()}.${extension}`;
      this.exportService.downloadBlob(blob, filename);

      this.finish("ok", `Downloaded ${filename}`);
    } catch (error) {
      this.fail("Mixdown export failed", error);
    }
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
    } catch (error) {
      this.fail("MIDI export failed", error);
    }
  }

  /** Render at the chosen format, then open the share sheet (download fallback). */
  async shareExport() {
    if (this.busy()) return;

    this.begin(`Rendering ${this.formatLabel()} for sharing…`);
    try {
      const shared = await this.exportService.exportAndShare(this.format());
      this.finish(
        "ok",
        shared
          ? "Share sheet opened with the mixdown"
          : "Mixdown downloaded and share link copied",
      );
    } catch (error) {
      this.fail("Share failed", error);
    }
  }

  private begin(status: string) {
    this.busy.set(true);
    this.progress.set(null);
    this.feedback.set(null);
    this.status.set(status);
  }

  private finish(tone: ExportFeedback["tone"], text: string) {
    this.busy.set(false);
    this.progress.set(null);
    this.status.set("");
    this.feedback.set({ tone, text });
  }

  private fail(prefix: string, error: unknown) {
    const detail = error instanceof Error ? error.message : "unknown error";
    this.finish("error", `${prefix} · ${detail}`);
  }

  private formatInfo() {
    return (
      this.formats.find((entry) => entry.id === this.format()) ??
      this.formats[0]
    );
  }

  private projectBase(): string {
    return (
      this.projectWorkspace.metadata()?.name || "S_M_U_V_E_Project"
    ).replace(/[^a-zA-Z0-9_-]/g, "_");
  }
}
