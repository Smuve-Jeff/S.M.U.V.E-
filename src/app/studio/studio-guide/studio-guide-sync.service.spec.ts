import { TestBed } from "@angular/core/testing";
import { signal } from "@angular/core";

import { AuthService } from "../../services/auth.service";
import { UserProfileService } from "../../services/user-profile.service";
import { StudioGuideService } from "./studio-guide.service";
import { StudioGuideSyncService } from "./studio-guide-sync.service";

describe("StudioGuideSyncService", () => {
  let auth: {
    currentUser: ReturnType<typeof signal<{ id: string } | null>>;
    isGuest: ReturnType<typeof signal<boolean>>;
  };
  let profiles: {
    hydrated: ReturnType<typeof signal<boolean>>;
    profile: ReturnType<typeof signal<unknown>>;
    saveStudioGuideProgress: jest.Mock<Promise<boolean>, [readonly string[]]>;
  };
  let guide: StudioGuideService;
  let sync: StudioGuideSyncService;

  function profileWith(lessonIds: string[]) {
    return {
      id: "artist-1",
      settings: { studio: { guideCompletedLessonIds: lessonIds } },
    };
  }

  async function settle(): Promise<void> {
    await TestBed.flushEffects();
    jest.advanceTimersByTime(400);
    await Promise.resolve();
    await Promise.resolve();
    await TestBed.flushEffects();
  }

  beforeEach(() => {
    jest.useFakeTimers();
    window.localStorage.clear();
    auth = {
      currentUser: signal({ id: "artist-1" }),
      isGuest: signal(false),
    };
    profiles = {
      hydrated: signal(true),
      profile: signal(profileWith([])),
      saveStudioGuideProgress: jest.fn().mockResolvedValue(true),
    };

    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: auth },
        { provide: UserProfileService, useValue: profiles },
      ],
    });

    guide = TestBed.inject(StudioGuideService);
  });

  afterEach(() => {
    jest.useRealTimers();
    window.localStorage.clear();
  });

  it("merges this device's progress with the account copy and saves the union", async () => {
    guide.complete("loop-groove");
    profiles.profile.set(profileWith(["loop-sound"]));

    sync = TestBed.runInInjectionContext(() => new StudioGuideSyncService());
    await settle();

    expect(guide.isComplete("loop-sound")).toBe(true);
    expect(guide.isComplete("loop-groove")).toBe(true);
    expect(profiles.saveStudioGuideProgress).toHaveBeenCalledWith(
      expect.arrayContaining(["loop-sound", "loop-groove"]),
    );
    expect(sync.state()).toBe("synced");
  });

  it("adopts remote progress without writing it straight back", async () => {
    profiles.profile.set(profileWith(["loop-sound"]));

    sync = TestBed.runInInjectionContext(() => new StudioGuideSyncService());
    await settle();

    expect(guide.isComplete("loop-sound")).toBe(true);
    expect(profiles.saveStudioGuideProgress).not.toHaveBeenCalled();
    expect(sync.state()).toBe("synced");
  });

  it("saves a lesson finished after hydration", async () => {
    sync = TestBed.runInInjectionContext(() => new StudioGuideSyncService());
    await settle();
    expect(sync.state()).toBe("synced");

    guide.complete("loop-sound");
    await settle();

    expect(profiles.saveStudioGuideProgress).toHaveBeenCalledWith(["loop-sound"]);
    expect(sync.state()).toBe("synced");
  });

  it("stays device-local for a guest and never calls the profile", async () => {
    auth.currentUser.set(null);
    auth.isGuest.set(true);

    sync = TestBed.runInInjectionContext(() => new StudioGuideSyncService());
    guide.complete("loop-sound");
    await settle();

    expect(profiles.saveStudioGuideProgress).not.toHaveBeenCalled();
    expect(sync.state()).toBe("local");
    expect(guide.isComplete("loop-sound")).toBe(true);
  });

  it("keeps local progress when the account write fails", async () => {
    profiles.saveStudioGuideProgress.mockResolvedValue(false);
    sync = TestBed.runInInjectionContext(() => new StudioGuideSyncService());
    await settle();

    guide.complete("loop-sound");
    await settle();

    expect(guide.isComplete("loop-sound")).toBe(true);
    expect(sync.state()).toBe("error");
  });
});
