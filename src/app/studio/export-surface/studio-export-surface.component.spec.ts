import { ComponentFixture, TestBed } from "@angular/core/testing";
import { signal } from "@angular/core";

import { StudioExportSurfaceComponent } from "./studio-export-surface.component";
import { ExportService } from "../../services/export.service";
import { ProjectWorkspaceService } from "../project-workspace.service";

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
    applySmuvePolish: jest.fn(),
    exportToFormat: jest.fn(),
    downloadBlob: jest.fn(),
    exportProjectMidi: jest.fn(),
    exportStems: jest.fn(),
    exportAndShare: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    exportService.renderProjectOffline.mockResolvedValue({});
    exportService.applySmuvePolish.mockResolvedValue({});
    exportService.exportToFormat.mockResolvedValue(wavBlob());
    exportService.exportProjectMidi.mockReturnValue(wavBlob());
    exportService.exportStems.mockResolvedValue(wavBlob());
    exportService.exportAndShare.mockResolvedValue(true);

    TestBed.configureTestingModule({
      imports: [StudioExportSurfaceComponent],
      providers: [
        { provide: ExportService, useValue: exportService },
        { provide: ProjectWorkspaceService, useValue: projectWorkspace },
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
      component.setPresetName("Video deliverable");
      component.savePreset();

      expect(component.presets()).toHaveLength(1);
      const preset = component.presets()[0];
      expect(preset).toMatchObject({
        name: "Video deliverable",
        format: "mp3",
        sampleRate: 48000,
        stemBitDepth: 16,
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
  });

  describe("exportMixdown", () => {
    it("renders, polishes, encodes and downloads at the chosen rate", async () => {
      component.setSampleRate({
        target: { value: "48000" },
      } as unknown as Event);

      await component.exportMixdown();

      expect(exportService.renderProjectOffline).toHaveBeenCalledWith({
        sampleRate: 48000,
      });
      expect(exportService.applySmuvePolish).toHaveBeenCalled();
      expect(exportService.exportToFormat).toHaveBeenCalledWith({}, "wav24");
      expect(exportService.downloadBlob).toHaveBeenCalledWith(
        expect.any(Blob),
        expect.stringMatching(/^Demo_Set_\d+\.wav$/),
      );
      expect(component.busy()).toBe(false);
      expect(component.feedback()?.tone).toBe("ok");
    });

    it("names the file after the bytes when a codec falls back to WAV", async () => {
      component.setFormat({ target: { value: "mp3" } } as unknown as Event);

      await component.exportMixdown();

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

      expect(exportService.exportAndShare).toHaveBeenCalledWith("m4a");
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
