import {
  guideDeepLinkParams,
  guideLessonById,
  parseGuideDeepLink,
} from "./studio-guide-deep-link";

describe("Studio Masterclass deep links", () => {
  it("ignores a URL with no guide request", () => {
    expect(parseGuideDeepLink(null, null)).toBeNull();
    expect(parseGuideDeepLink("", null)).toBeNull();
  });

  it("opens a path directly", () => {
    expect(parseGuideDeepLink("full-song", null)).toEqual({
      tab: "learn",
      track: "full-song",
      lessonId: null,
    });
  });

  it("opens the atlas and the words tabs", () => {
    expect(parseGuideDeepLink("atlas", null)).toEqual({
      tab: "atlas",
      track: "first-loop",
      lessonId: null,
    });
    expect(parseGuideDeepLink("words", null)).toEqual({
      tab: "words",
      track: "first-loop",
      lessonId: null,
    });
  });

  it("lets a lesson select its own path", () => {
    const lesson = guideLessonById("master-ears");

    expect(lesson).not.toBeNull();
    expect(parseGuideDeepLink("first-loop", "master-ears")).toEqual({
      tab: "learn",
      track: "mastery",
      lessonId: "master-ears",
    });
  });

  it("accepts the shorthand guide=1 with a lesson", () => {
    expect(parseGuideDeepLink("1", "loop-drums")).toEqual({
      tab: "learn",
      track: "first-loop",
      lessonId: "loop-drums",
    });
  });

  it("rejects unknown guide values and unknown lessons", () => {
    expect(parseGuideDeepLink("not-a-path", null)).toBeNull();
    expect(parseGuideDeepLink("1", "not-a-lesson")).toEqual({
      tab: "learn",
      track: "first-loop",
      lessonId: null,
    });
  });

  it("builds shareable params for a path, a lesson and a tab", () => {
    expect(guideDeepLinkParams("learn", "full-song", null)).toEqual({
      guide: "full-song",
      lesson: null,
    });
    expect(guideDeepLinkParams("learn", "full-song", "song-export")).toEqual({
      guide: "full-song",
      lesson: "song-export",
    });
    expect(guideDeepLinkParams("atlas", "full-song", "song-export")).toEqual({
      guide: "atlas",
      lesson: null,
    });
  });
});
