import { ComponentFixture, TestBed } from "@angular/core/testing";
import { signal } from "@angular/core";

import { StudioExportSurfaceComponent } from "./studio-export-surface.component";
import { ExportService } from "../../services/export.service";
import { ProjectWorkspaceService } from "../project-workspace.service";
import { ExportReviewService } from "./export-review.service";

describe("StudioExportSurfaceComponent", () => {
  let fixture: ComponentFixture<StudioExportSurfaceComponent>;
  let component: StudioExportSurfaceComponent;

  const metadata = signal<{ name: string } | null>({ name: "Demo Set" });
  const projectWorkspace = {
    metadata,
    downloadProjectBundle: jest.fn(),
  };

  const wavBlob = () => new Blob(["wav"], { type: "audio/wav" });

  const exportService = {
    renderProjectOffline: jest.fn(),
    masterRetainedMix: jest.fn(),
    applySmuvePolish: jest.fn(),
    exportToFormat: jest.fn(),
    downloadBlob: jest.fn(),
    exportProjectMidi: jest.fn(),
    exportStems: jest.fn(),
    exportAndShare: jest.fn(),
    shareBlob: jest.fn(),
    analyzeBuffer: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    metadata.set({ name: "Demo Set" });
    exportService.renderProjectOffline.mockResolvedValue({});
    exportService.masterRetainedMix.mockResolvedValue({});
    exportService.applySmuvePolish.mockResolvedValue({});
    exportService.exportToFormat.mockResolvedValue(wavBlob());
    exportService.exportProjectMidi.mockReturnValue(wavBlob());
    exportService.exportStems.mockResolvedValue(wavBlob());
    exportService.exportAndShare.mockResolvedValue(true);
    exportService.shareBlob.mockResolvedValue(true);
    exportService.analyzeBuffer.mockReturnValue({
      peakDb: -1.4,
      truePeakDb: -1.2,
      lufs: -11.5,
      lra: 7.8,
      correlation: 0.62,
    });

    TestBed.configureTestingModule({
      imports: [StudioExportSurfaceComponent],
      providers: [
        { provide: ExportService, useValue: exportService },
        { provide: ProjectWorkspaceService, useValue: projectWorkspace },
        ExportReviewService,
      ],
    });

    fixture = TestBed.createComponent(StudioExportSurfaceComponent);
    fixture.detectChanges();
    component = fixture.componentInstance;
  });

  describe("delivery presets", () => {
    it("saves the current format, rate and depth and reapplies them", () => {
      component.setFormat({ target: { value: "mp3" } } as unknown as Event);
      component.setSampleRate({
        target: { value: "48000" },
      } as unknown as Event);
      component.setStemBitDepth({
        target: { value: "16" },
      } as unknown as Event);
      component.setBitrate({
        target: { value: "256000" },
      } as unknown as Event);
      component.setPresetName("Video deliverable");
      component.savePreset();

      expect(component.presets()).toHaveLength(1);
      const preset = component.presets()[0];
      expect(preset).toMatchObject({
        name: "Video deliverable",
        format: "mp3",
        sampleRate: 48000,
        stemBitDepth: 16,
        bitrate: 256000,
      });
      // Persisted, so a reload keeps the delivery setup.
      expect(localStorage.getItem("smuve_export_presets_v1")).toContain(
        "Video deliverable",
      );

      // Change the live options, then apply the preset back.
      component.setFormat({ target: { value: "wav24" } } as unknown as Event);
      component.setSampleRate({
        target: { value: "44100" },
      } as unknown as Event);
      component.setStemBitDepth({
        target: { value: "24" },
      } as unknown as Event);
      component.applyPreset(preset);

      expect(component.format()).toBe("mp3");
      expect(component.sampleRate()).toBe(48000);
      expect(component.stemBitDepth()).toBe(16);
      expect(component.bitrate()).toBe(256000);
    });

    it("overwrites a preset with the same name instead of duplicating", () => {
      component.setPresetName("Release");
      component.savePreset();
      component.setFormat({ target: { value: "flac" } } as unknown as Event);
      component.setPresetName("Release");
      component.savePreset();

      expect(component.presets()).toHaveLength(1);
      expect(component.presets()[0].format).toBe("flac");
    });

    it("deletes a saved preset", () => {
      component.setPresetName("Temporary");
      component.savePreset();
      const id = component.presets()[0].id;
      component.deletePreset(id);
      expect(component.presets()).toHaveLength(0);
      expect(localStorage.getItem("smuve_export_presets_v1")).toBe("[]");
    });
  });

  describe("options", () => {
    it("defaults to 24-bit WAV at 44.1 kHz", () => {
      expect(component.formatLabel()).toBe("WAV 24-bit");
      expect(component.sampleRate()).toBe(44100);
      expect(component.stemBitDepth()).toBe(24);
    });

    it("tracks the chosen format, rate and stem depth", () => {
      component.setFormat({ target: { value: "mp3" } } as unknown as Event);
      component.setSampleRate({
        target: { value: "48000" },
      } as unknown as Event);
      component.setStemBitDepth({
        target: { value: "16" },
      } as unknown as Event);

      expect(component.formatLabel()).toBe("MP3 192k");
      expect(component.sampleRate()).toBe(48000);
      expect(component.stemBitDepth()).toBe(16);
    });

    it("falls back to 44.1 kHz for an unknown rate", () => {
      component.setSampleRate({
        target: { value: "nope" },
      } as unknown as Event);
      expect(component.sampleRate()).toBe(44100);
    });

    it("shows and applies the lossy-codec bitrate", async () => {
      component.setFormat({ target: { value: "mp3" } } as unknown as Event);
      expect(component.supportsBitrate()).toBe(true);
      expect(component.bitrate()).toBe(192000);
      expect(component.formatLabel()).toBe("MP3 192k");

      component.setBitrate({
        target: { value: "320000" },
      } as unknown as Event);
      expect(component.formatLabel()).toBe("MP3 320k");

      await component.exportMixdown();
      await component.confirmExport();
      expect(exportService.exportToFormat).toHaveBeenCalledWith(
        {},
        "mp3",
        320000,
      );

      component.setFormat({ target: { value: "m4a" } } as unknown as Event);
      component.setBitrate({
        target: { value: "256000" },
      } as unknown as Event);
      component.setSampleRate({
        target: { value: "48000" },
      } as unknown as Event);
      await component.shareExport();
      expect(exportService.exportAndShare).toHaveBeenCalledWith("m4a", {
        bitrate: 256000,
        sampleRate: 48000,
      });
    });
  });

  describe("exportMixdown", () => {
    it("renders and measures the chosen rate before asking for a decision", async () => {
      component.setSampleRate({
        target: { value: "48000" },
      } as unknown as Event);

      await component.exportMixdown();

      expect(exportService.renderProjectOffline).toHaveBeenCalledWith(
        expect.objectContaining({
          sampleRate: 48000,
          preMaster: true,
          onProgress: expect.any(Function),
        }),
      );
      expect(exportService.masterRetainedMix).toHaveBeenCalledTimes(1);
      expect(exportService.applySmuvePolish).toHaveBeenCalled();
      expect(exportService.analyzeBuffer).toHaveBeenCalled();
      // Nothing left the browser yet.
      expect(exportService.exportToFormat).not.toHaveBeenCalled();
      expect(exportService.downloadBlob).not.toHaveBeenCalled();
      expect(component.pendingExport()).toMatchObject({
        format: "wav24",
        sampleRate: 48000,
      });
      expect(component.busy()).toBe(false);
      expect(component.feedback()).toBeNull();
    });

    it("masters and encodes the retained mix only after confirmation", async () => {
      await component.exportMixdown();
      const measured = component.analysis();

      await component.confirmExport();

      expect(exportService.exportToFormat).toHaveBeenCalledWith({}, "wav24");
      // One master pass to review, a second against the chain at delivery.
      expect(exportService.masterRetainedMix).toHaveBeenCalledTimes(2);
      expect(exportService.downloadBlob).toHaveBeenCalledWith(
        expect.any(Blob),
        expect.stringMatching(/^Demo_Set_\d+\.wav$/),
      );
      expect(component.pendingExport()).toBeNull();
      // Re-mastered at delivery, so the numbers are equal, not the same object.
      expect(component.analysis()).toEqual(measured);
      expect(component.feedback()?.tone).toBe("ok");
    });

    it("does not start a second render while a decision is pending", async () => {
      await component.exportMixdown();

      await component.exportMixdown();

      expect(exportService.renderProjectOffline).toHaveBeenCalledTimes(1);
    });

    it("opens Mastering without downloading or discarding the review", async () => {
      await component.exportMixdown();
      component.deliveryTargetId.set("cd");
      const emit = jest.spyOn(component.openMastering, "emit");

      component.openMasteringFromReview();

      expect(emit).toHaveBeenCalledWith("cd");
      expect(component.pendingExport()).not.toBeNull();
      expect(component.analysis()).not.toBeNull();
      expect(component.reviewNeedsRefresh()).toBe(true);
      expect(exportService.downloadBlob).not.toHaveBeenCalled();
    });

    it("restores the measured render when the Export view is recreated", async () => {
      await component.exportMixdown();
      const measured = component.analysis();
      const format = component.format();

      const revived = TestBed.createComponent(
        StudioExportSurfaceComponent,
      ).componentInstance;

      expect(revived.pendingExport()).not.toBeNull();
      expect(revived.analysis()).toEqual(measured);
      expect(revived.format()).toBe(format);
      expect(revived.status()).toContain("Master measured");
      // Restoring must not turn the measured master into a download.
      expect(exportService.downloadBlob).not.toHaveBeenCalled();
    });

    it("does not restore a render made for a different project", async () => {
      await component.exportMixdown();
      metadata.set({ name: "Another Set" });

      const revived = TestBed.createComponent(
        StudioExportSurfaceComponent,
      ).componentInstance;

      expect(revived.pendingExport()).toBeNull();
      expect(revived.analysis()).toBeNull();
    });

    it("refreshes a stale review by re-mastering the retained mix", async () => {
      await component.exportMixdown();
      component.openMasteringFromReview();

      await component.refreshPendingExport();

      // The arrangement is rendered once; only the master pass repeats.
      expect(exportService.renderProjectOffline).toHaveBeenCalledTimes(1);
      expect(exportService.masterRetainedMix).toHaveBeenCalledTimes(2);
      expect(component.pendingExport()).not.toBeNull();
      expect(component.reviewNeedsRefresh()).toBe(false);
      expect(exportService.analyzeBuffer).toHaveBeenCalledTimes(2);
    });

    it("applies the current master at download without re-rendering", async () => {
      await component.exportMixdown();
      component.openMasteringFromReview();

      await component.confirmExport();

      expect(exportService.renderProjectOffline).toHaveBeenCalledTimes(1);
      expect(exportService.masterRetainedMix).toHaveBeenCalledTimes(2);
      expect(exportService.exportToFormat).toHaveBeenCalledWith({}, "wav24");
      expect(exportService.downloadBlob).toHaveBeenCalled();
    });

    it("clears the stored review when it is discarded", async () => {
      await component.exportMixdown();

      component.discardPendingExport();
      const revived = TestBed.createComponent(
        StudioExportSurfaceComponent,
      ).componentInstance;

      expect(revived.pendingExport()).toBeNull();
    });

    it("keeps Share Mixdown available while a review is pending", async () => {
      await component.exportMixdown();
      fixture.detectChanges();

      const share = Array.from(
        fixture.nativeElement.querySelectorAll("button"),
      ).find((button: HTMLButtonElement) =>
        button.textContent?.includes("Share Mixdown"),
      ) as HTMLButtonElement;

      expect(share).toBeTruthy();
      expect(share.disabled).toBe(false);
    });

    it("shares the reviewed master without rendering the arrangement again", async () => {
      await component.exportMixdown();
      const renders = exportService.renderProjectOffline.mock.calls.length;

      await component.shareExport();

      expect(exportService.renderProjectOffline).toHaveBeenCalledTimes(renders);
      expect(exportService.masterRetainedMix).toHaveBeenCalledTimes(2);
      expect(exportService.exportToFormat).toHaveBeenCalledWith({}, "wav24");
      expect(exportService.shareBlob).toHaveBeenCalledWith(
        expect.any(Blob),
        expect.stringMatching(/^Demo_Set_\d+\.wav$/),
      );
      expect(exportService.exportAndShare).not.toHaveBeenCalled();
      // The review survives an ambiguous share result, so it can be retried.
      expect(component.pendingExport()).not.toBeNull();
      expect(component.analysis()).not.toBeNull();
      expect(component.feedback()?.tone).toBe("ok");
    });

    it("discards the pending render without exporting", async () => {
      await component.exportMixdown();

      component.discardPendingExport();

      expect(component.pendingExport()).toBeNull();
      expect(component.analysis()).toBeNull();
      expect(exportService.exportToFormat).not.toHaveBeenCalled();
      expect(exportService.downloadBlob).not.toHaveBeenCalled();
    });

    it("reports the measured stats of the encoded mix", async () => {
      exportService.analyzeBuffer.mockReturnValue({
        peakDb: 0.1,
        truePeakDb: 0.4,
        lufs: -7.2,
        lra: 5.1,
        correlation: 0.2,
      });

      await component.exportMixdown();

      const measured = component.analysis();
      expect(exportService.analyzeBuffer).toHaveBeenCalled();
      expect(measured).toMatchObject({ lufs: -7.2, truePeakDb: 0.4 });
      expect(measured?.warnings).toHaveLength(2);
      expect(measured?.warnings.join(' ')).toContain('dBTP');
    });

    it("keeps the export valid when analysis itself fails", async () => {
      exportService.analyzeBuffer.mockImplementation(() => {
        throw new Error("unreadable buffer");
      });

      await component.exportMixdown();
      expect(component.analysis()).toBeNull();
      expect(component.pendingExport()).not.toBeNull();

      await component.confirmExport();

      expect(component.feedback()?.tone).toBe("ok");
      expect(exportService.downloadBlob).toHaveBeenCalled();
    });

    it("feeds real render progress into the export meter", async () => {
      let report: ((percent: number) => void) | undefined;
      exportService.renderProjectOffline.mockImplementation(
        async (options: any) => {
          report = options.onProgress;
          return {};
        },
      );

      const pending = component.exportMixdown();
      expect(report).toBeDefined();
      report!(37);

      expect(component.progress()).toBe(37);
      expect(component.status()).toBe("Rendering mixdown… 37%");
      await pending;
    });

    it("cancels a mixdown between render stages", async () => {
      let signal: AbortSignal | undefined;
      exportService.renderProjectOffline.mockImplementation(
        (options: any) =>
          new Promise((_resolve, reject) => {
            signal = options.signal;
            signal!.addEventListener("abort", () =>
              reject(new DOMException("Export cancelled.", "AbortError")),
            );
          }),
      );

      const pending = component.exportMixdown();
      expect(component.busy()).toBe(true);
      expect(component.canCancel()).toBe(true);
      component.cancelExport();
      expect(signal?.aborted).toBe(true);

      await pending;
      expect(component.busy()).toBe(false);
      expect(component.feedback()).toEqual({
        tone: "ok",
        text: "Export cancelled",
      });
    });

    it("names the file after the bytes when a codec falls back to WAV", async () => {
      component.setFormat({ target: { value: "mp3" } } as unknown as Event);

      await component.exportMixdown();
      await component.confirmExport();

      expect(exportService.downloadBlob).toHaveBeenCalledWith(
        expect.any(Blob),
        expect.stringMatching(/\.wav$/),
      );
    });

    it("surfaces the render error and clears the busy state", async () => {
      exportService.renderProjectOffline.mockRejectedValue(
        new Error("Offline export supports up to 10 minutes"),
      );

      await component.exportMixdown();

      expect(component.busy()).toBe(false);
      expect(component.feedback()).toEqual({
        tone: "error",
        text: "Mixdown export failed · Offline export supports up to 10 minutes",
      });
    });
  });

  describe("delivery target", () => {
    it("defaults to streaming and has no comparison before a render", () => {
      expect(component.deliveryTargetId()).toBe("spotify");
      expect(component.deliveryComparison()).toBeNull();
    });

    it("compares the measured master and remembers the chosen target", async () => {
      exportService.analyzeBuffer.mockReturnValue({
        peakDb: -1.8,
        truePeakDb: -1.4,
        lufs: -14.2,
        lra: 6.4,
        correlation: 0.3,
      });

      await component.exportMixdown();

      expect(component.deliveryComparison()?.allPass).toBe(true);
      expect(component.deliveryComparison()?.checks).toHaveLength(3);

      component.setDeliveryTarget({
        target: { value: "cd" },
      } as unknown as Event);

      expect(component.deliveryTargetId()).toBe("cd");
      expect(component.deliveryComparison()?.targetId).toBe("cd");
      expect(component.deliveryComparison()?.allPass).toBe(false);
      expect(localStorage.getItem("smuve_export_target_v1")).toBe("cd");
    });

    it("ignores an unknown target id", () => {
      component.setDeliveryTarget({
        target: { value: "not-a-target" },
      } as unknown as Event);

      expect(component.deliveryTargetId()).toBe("spotify");
    });
  });

  describe("exportStems", () => {
    it("reports real file progress and passes the chosen render options", async () => {
      let report: ((completed: number, total: number) => void) | undefined;
      let resolveZip: ((blob: Blob) => void) | undefined;

      exportService.exportStems.mockImplementation((options: any) => {
        report = options.onProgress;
        return new Promise<Blob>((resolve) => {
          resolveZip = resolve;
        });
      });

      const pending = component.exportStems();

      expect(component.busy()).toBe(true);
      expect(exportService.exportStems).toHaveBeenCalledWith(
        expect.objectContaining({ bitDepth: 24, sampleRate: 44100 }),
      );

      report?.(1, 4);
      expect(component.progress()).toBe(25);

      report?.(3, 4);
      expect(component.progress()).toBe(75);

      resolveZip?.(wavBlob());
      await pending;

      expect(component.busy()).toBe(false);
      expect(component.progress()).toBeNull();
      expect(component.feedback()?.tone).toBe("ok");
    });

    it("ignores a second run while one is in flight", async () => {
      exportService.exportStems.mockImplementation(
        () => new Promise<Blob>(() => undefined),
      );

      void component.exportStems();
      await component.exportStems();

      expect(exportService.exportStems).toHaveBeenCalledTimes(1);
    });

    it("surfaces a stem failure", async () => {
      exportService.exportStems.mockRejectedValue(new Error("disk full"));

      await component.exportStems();

      expect(component.busy()).toBe(false);
      expect(component.feedback()).toEqual({
        tone: "error",
        text: "Stem export failed · disk full",
      });
    });
  });

  describe("project, MIDI and share", () => {
    it("downloads the project bundle", () => {
      component.exportProject();

      expect(projectWorkspace.downloadProjectBundle).toHaveBeenCalled();
      expect(component.feedback()?.tone).toBe("ok");
    });

    it("reports a failing bundle export", () => {
      projectWorkspace.downloadProjectBundle.mockImplementationOnce(() => {
        throw new Error("storage offline");
      });

      component.exportProject();

      expect(component.feedback()).toEqual({
        tone: "error",
        text: "Project export failed · storage offline",
      });
    });

    it("exports the arrangement as a MIDI file named after the project", () => {
      component.exportMidi();

      expect(exportService.exportProjectMidi).toHaveBeenCalled();
      expect(exportService.downloadBlob).toHaveBeenCalledWith(
        expect.any(Blob),
        expect.stringMatching(/^Demo_Set_\d+\.mid$/),
      );
    });

    it("shares the mixdown in the selected format", async () => {
      component.setFormat({ target: { value: "m4a" } } as unknown as Event);

      await component.shareExport();

      expect(exportService.exportAndShare).toHaveBeenCalledWith("m4a", {
        bitrate: 128000,
        sampleRate: 44100,
      });
      expect(component.feedback()).toEqual({
        tone: "ok",
        text: "Share sheet opened with the mixdown",
      });
    });

    it("reports the download fallback when no share sheet exists", async () => {
      exportService.exportAndShare.mockResolvedValue(false);

      await component.shareExport();

      expect(component.feedback()).toEqual({
        tone: "ok",
        text: "Mixdown downloaded and share link copied",
      });
    });
  });
});
