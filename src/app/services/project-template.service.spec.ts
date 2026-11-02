import { TestBed } from "@angular/core/testing";
import { signal } from "@angular/core";

import { ProjectTemplateService } from "./project-template.service";
import { MusicManagerService } from "./music-manager.service";
import { LoggingService } from "./logging.service";

/**
 * Templates are the "new session" starter: applying one must replace the
 * canvas, add the template's channels on their real instruments and set the
 * tempo — not just change a label.
 */
describe("ProjectTemplateService", () => {
  let service: ProjectTemplateService;

  const tempo = signal(120);
  const newProject = jest.fn();
  const addTrack = jest.fn((name: string) => `track-${name}`);
  const musicManager = {
    newProject,
    addTrack,
    engine: { tempo },
    tracks: jest.fn(() => [
      { id: "1", name: "Lead", instrumentId: "analog-warmth", type: "midi" },
      { id: "2", name: "Vox", instrumentId: "grand-piano", type: "audio" },
      { id: "3", name: "Drums", instrumentId: "trap-808-elite", type: "drum" },
    ]),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    tempo.set(120);
    TestBed.configureTestingModule({
      providers: [
        ProjectTemplateService,
        { provide: MusicManagerService, useValue: musicManager },
        {
          provide: LoggingService,
          useValue: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
        },
      ],
    });
    service = TestBed.inject(ProjectTemplateService);
  });

  it("ships usable starter templates with real instrument ids", () => {
    expect(service.templates.length).toBeGreaterThanOrEqual(4);
    for (const template of service.templates) {
      expect(template.tracks.length).toBeGreaterThan(0);
      expect(template.bpm).toBeGreaterThan(0);
      expect(template.tracks.every((track) => !!track.instrumentId)).toBe(true);
    }
  });

  it("applies a template by clearing the canvas, adding channels and tempo", () => {
    const template = service.templates[0];
    service.applyTemplate(template.id);

    expect(newProject).toHaveBeenCalledWith(true);
    expect(addTrack).toHaveBeenCalledTimes(template.tracks.length);
    expect(addTrack).toHaveBeenCalledWith(
      template.tracks[0].name,
      template.tracks[0].instrumentId,
      template.tracks[0].type,
    );
    expect(addTrack).toHaveBeenCalledWith(
      template.tracks[template.tracks.length - 1].name,
      template.tracks[template.tracks.length - 1].instrumentId,
      "drum",
    );
    expect(tempo()).toBe(template.bpm);
  });

  it("ignores an unknown template id without touching the project", () => {
    service.applyTemplate("not-a-template");
    expect(newProject).not.toHaveBeenCalled();
    expect(addTrack).not.toHaveBeenCalled();
  });

  it("saves the current channels and tempo as a user template", () => {
    const template = service.saveCurrentAsTemplate("  My Sketch  ");

    expect(template).not.toBeNull();
    expect(template?.name).toBe("My Sketch");
    expect(template?.bpm).toBe(120);
    expect(template?.tracks).toEqual([
      { name: "Lead", instrumentId: "analog-warmth", type: "midi" },
      { name: "Vox", instrumentId: "grand-piano", type: "audio" },
      { name: "Drums", instrumentId: "trap-808-elite", type: "drum" },
    ]);
    expect(service.userTemplates()[0].id).toBe(template?.id);
  });

  it("persists user templates and applies them like a starter", () => {
    const template = service.saveCurrentAsTemplate("Saved Sketch");
    expect(template).not.toBeNull();

    // A fresh service instance reads the stored list back.
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        ProjectTemplateService,
        { provide: MusicManagerService, useValue: musicManager },
        {
          provide: LoggingService,
          useValue: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
        },
      ],
    });
    const reloaded = TestBed.inject(ProjectTemplateService);
    expect(reloaded.userTemplates().map((t) => t.name)).toEqual([
      "Saved Sketch",
    ]);

    reloaded.applyTemplate(template!.id);
    expect(newProject).toHaveBeenCalledWith(true);
    expect(addTrack).toHaveBeenCalledTimes(3);
    expect(addTrack).toHaveBeenCalledWith(
      "Drums",
      "trap-808-elite",
      "drum",
    );
  });

  it("rejects an empty save and deletes a user template", () => {
    expect(service.saveCurrentAsTemplate("   ")).toBeNull();

    const template = service.saveCurrentAsTemplate("Delete Me");
    expect(template).not.toBeNull();
    expect(service.deleteUserTemplate(template!.id)).toBe(true);
    expect(service.userTemplates()).toHaveLength(0);
    expect(service.deleteUserTemplate(template!.id)).toBe(false);
  });
});
