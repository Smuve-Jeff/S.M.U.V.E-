import { TestBed } from "@angular/core/testing";
import {
  ActivatedRouteSnapshot,
  convertToParamMap,
  provideRouter,
  Router,
  RouterStateSnapshot,
  UrlTree,
} from "@angular/router";

import { studioViewGuard } from "./studio-view.guard";
import { studioModeForView } from "./studio-view-modes";

describe("studioViewGuard", () => {
  let router: Router;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    router = TestBed.inject(Router);
  });

  function run(params: Record<string, string>) {
    const route = {
      queryParamMap: convertToParamMap(params),
    } as ActivatedRouteSnapshot;

    return TestBed.runInInjectionContext(() =>
      studioViewGuard(route, {} as RouterStateSnapshot),
    );
  }

  it("lets a bare /studio through", () => {
    expect(run({})).toBe(true);
  });

  it.each([
    "create",
    "recording",
    "arrange",
    "arrangement",
    "piano-roll",
    "keys",
    "mix",
    "mixer",
    "export",
  ])("lets the page render the %s view", (view) => {
    expect(run({ view })).toBe(true);
  });

  it("matches the view parameter case-insensitively", () => {
    expect(run({ view: "MIXER" })).toBe(true);
  });

  it.each([
    "mastering",
    "performer",
    "drum-machine",
    "channel-rack",
    "effects-rack",
    "vocal-suite",
    "session",
    "dj",
    "performance",
    "sampler",
  ])("forwards the %s view to the classic shell", (view) => {
    const result = run({ view });

    expect(result instanceof UrlTree).toBe(true);
    expect(router.serializeUrl(result as UrlTree)).toBe(
      `/studio-classic?view=${view}`,
    );
  });

  it("keeps the rest of the query string when forwarding", () => {
    const result = run({ view: "mastering", bar: "12", loop: "1" });
    const url = router.serializeUrl(result as UrlTree);

    expect(url).toContain("view=mastering");
    expect(url).toContain("bar=12");
    expect(url).toContain("loop=1");
  });
});

describe("studioModeForView", () => {
  it.each([
    ["create", "create"],
    ["recording", "create"],
    ["arrange", "arrange"],
    ["arrangement", "arrange"],
    ["piano-roll", "keys"],
    ["keys", "keys"],
    ["mix", "mix"],
    ["mixer", "mix"],
    ["export", "export"],
    ["MIXER", "mix"],
  ])("maps the %s view to the %s mode", (view, mode) => {
    expect(studioModeForView(view)).toBe(mode);
  });

  it("has no mode for an unknown or missing view", () => {
    expect(studioModeForView("mastering")).toBeNull();
    expect(studioModeForView(null)).toBeNull();
  });
});
