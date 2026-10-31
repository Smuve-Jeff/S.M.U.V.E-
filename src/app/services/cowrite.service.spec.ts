import { TestBed } from "@angular/core/testing";
import { CoWriteService } from "./cowrite.service";
import { SongwritingAssistantService } from "./songwriting-assistant.service";
import { SmuveStyleMimicService } from "./smuve-style-mimic.service";
import { AiService } from "./ai.service";

describe("CoWriteService.saveProject", () => {
  let service: CoWriteService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        CoWriteService,
        { provide: SongwritingAssistantService, useValue: {} },
        { provide: SmuveStyleMimicService, useValue: {} },
        { provide: AiService, useValue: {} },
      ],
    });
    service = TestBed.inject(CoWriteService);
    service.currentSession.set({
      id: "s1",
      title: "Night drive",
      topic: "Night drive",
      style: "trap",
      mood: "dark",
      artist: null,
      artists: [],
      genre: "trap",
      bpm: 140,
      key: "Am",
      turns: [],
      completedSections: [],
      currentSection: null,
      sectionOrder: [],
      sectionIndex: 0,
      startedAt: 0,
      lastActivityAt: 0,
    } as any);
  });

  afterEach(() => localStorage.clear());

  it("reports a refused write instead of claiming a saved project", () => {
    const setItem = jest
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("QuotaExceededError");
      });
    try {
      const saved = service.saveProject("Take 1");

      expect(saved).toBeNull();
      expect(service.lastSaveError()).toContain(
        "could not be saved on this device",
      );
      // Nothing was stored, so the saved list must not gain an entry either.
      expect(service.savedProjects()).toHaveLength(0);
    } finally {
      setItem.mockRestore();
    }
  });

  it("clears a previous failure once a save succeeds", () => {
    const setItem = jest
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("QuotaExceededError");
      });
    service.saveProject("Take 1");
    expect(service.lastSaveError()).not.toBeNull();
    setItem.mockRestore();

    const saved = service.saveProject("Take 2");

    expect(saved?.title).toBe("Take 2");
    expect(service.lastSaveError()).toBeNull();
    expect(service.savedProjects()).toHaveLength(1);
  });
});
