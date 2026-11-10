import { ComponentFixture, TestBed } from "@angular/core/testing";
import { signal } from "@angular/core";

import { StudioGuideComponent } from "./studio-guide.component";
import { StudioGuideAutoCheckService } from "./studio-guide.auto-check.service";
import { GUIDE_SURFACE_ATLAS, GUIDE_TRACKS } from "./studio-guide.data";
import { StudioGuideService } from "./studio-guide.service";
import { StudioGuideSyncService } from "./studio-guide-sync.service";

/**
 * Render-level contract for the Masterclass.
 *
 * The data spec proves the content is complete; this spec proves the component
 * actually renders it, switches tabs, opens the real surface through an output,
 * and leaves navigation to the shell.
 */
describe("StudioGuideComponent", () => {
  let fixture: ComponentFixture<StudioGuideComponent>;
  let component: StudioGuideComponent;
  let autoCheck: {
    track: jest.Mock;
    clear: jest.Mock;
    noteActiveView: jest.Mock;
    noteAction: jest.Mock;
    noteGuideOpen: jest.Mock;
    dismissRecent: jest.Mock;
    lastAutoCompleted: ReturnType<typeof signal<null>>;
    activeLesson: ReturnType<typeof signal<null>>;
  };
  let guideSync: { state: ReturnType<typeof signal<"local">> };

  beforeEach(async () => {
    window.localStorage.clear();
    autoCheck = {
      track: jest.fn(),
      clear: jest.fn(),
      noteActiveView: jest.fn(),
      noteAction: jest.fn(),
      noteGuideOpen: jest.fn(),
      dismissRecent: jest.fn(),
      lastAutoCompleted: signal(null),
      activeLesson: signal(null),
    };
    guideSync = { state: signal("local") };
    await TestBed.configureTestingModule({
      imports: [StudioGuideComponent],
      providers: [
        { provide: StudioGuideAutoCheckService, useValue: autoCheck },
        { provide: StudioGuideSyncService, useValue: guideSync },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(StudioGuideComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it("renders the Masterclass with the first path open and its first lesson expanded", () => {
    const element = fixture.nativeElement as HTMLElement;
    const text = element.textContent ?? "";

    expect(autoCheck.noteGuideOpen).toHaveBeenCalledWith(true);
    expect(text).toContain("On this device");

    expect(text).toContain("Studio Masterclass");
    expect(text).toContain("First Loop");
    expect(text).toContain("Full Song");
    expect(text).toContain("Studio Mastery");
    expect(element.querySelectorAll(".sg-lesson").length).toBe(
      GUIDE_TRACKS[0].lessons.length,
    );
    expect(element.querySelector(".sg-lesson-body")).not.toBeNull();
  });

  it("switches paths and renders every lesson in the chosen path", () => {
    component.selectTrack("full-song");
    fixture.detectChanges();

    expect(component.selectedTrackId()).toBe("full-song");
    expect(
      (fixture.nativeElement as HTMLElement).querySelectorAll(".sg-lesson")
        .length,
    ).toBe(
      GUIDE_TRACKS.find((track) => track.id === "full-song")!.lessons.length,
    );
  });

  it("renders all 25 surfaces in the control atlas and filters them", () => {
    component.tab.set("atlas");
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelectorAll(".sg-atlas-card").length).toBe(
      GUIDE_SURFACE_ATLAS.length,
    );

    component.atlasQuery.set("vocal");
    fixture.detectChanges();

    const filtered = element.querySelectorAll(".sg-atlas-card").length;
    expect(filtered).toBeGreaterThan(0);
    expect(filtered).toBeLessThan(GUIDE_SURFACE_ATLAS.length);
  });

  it("opens surfaces through the shell output instead of navigating itself", () => {
    const openSurface = jest.spyOn(component.openSurface, "emit");

    component.openTarget("mixer");

    expect(openSurface).toHaveBeenCalledWith("mixer");
  });

  it("loads the starter groove through the shell output", () => {
    const startRecipe = jest.spyOn(component.startRecipe, "emit");

    component.startGroove();

    expect(startRecipe).toHaveBeenCalledWith("house");
  });

  it("marks a lesson done and advances to the next unfinished lesson", () => {
    const guide = TestBed.inject(StudioGuideService);
    const track = GUIDE_TRACKS[0];
    const first = track.lessons[0];

    component.completeAndNext(first);
    fixture.detectChanges();

    expect(guide.isComplete(first.id)).toBe(true);
    expect(component.openLessonId()).toBe(track.lessons[1].id);
    expect(guide.progressFor(track).done).toBe(1);
  });

  it("applies a deep-linked tab and lesson from the shell", () => {
    fixture.componentRef.setInput("tab", "atlas");
    fixture.detectChanges();
    expect(component.tab()).toBe("atlas");

    fixture.componentRef.setInput("tab", "learn");
    fixture.componentRef.setInput("track", "first-loop");
    fixture.componentRef.setInput("lesson", "master-ears");
    fixture.detectChanges();

    expect(component.tab()).toBe("learn");
    expect(component.selectedTrackId()).toBe("mastery");
    expect(component.openLessonId()).toBe("master-ears");
  });

  it("reports path and lesson changes for the shell to mirror into the URL", () => {
    const changes = jest.spyOn(component.stateChange, "emit");

    component.selectTrack("full-song");

    expect(changes).toHaveBeenCalledWith({
      tab: "learn",
      track: "full-song",
      lessonId: expect.any(String),
    });
  });

  it("closes from Escape through the single close output", () => {
    const close = jest.spyOn(component.close, "emit");

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));

    expect(close).toHaveBeenCalledTimes(1);
  });
});
