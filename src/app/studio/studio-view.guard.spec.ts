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
    "piano-roll",
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
    const result = run({ view: "piano-roll", bar: "12", loop: "1" });
    const url = router.serializeUrl(result as UrlTree);

    expect(url).toContain("view=piano-roll");
    expect(url).toContain("bar=12");
    expect(url).toContain("loop=1");
  });
});
