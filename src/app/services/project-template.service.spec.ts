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
  };

  beforeEach(() => {
    jest.clearAllMocks();
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
    );
    expect(tempo()).toBe(template.bpm);
  });

  it("ignores an unknown template id without touching the project", () => {
    service.applyTemplate("not-a-template");
    expect(newProject).not.toHaveBeenCalled();
    expect(addTrack).not.toHaveBeenCalled();
  });
});
