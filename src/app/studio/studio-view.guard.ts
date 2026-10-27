import { inject } from "@angular/core";
import { CanActivateFn, Router } from "@angular/router";

import { studioModeForView } from "./studio-view-modes";

/**
 * Keep `/studio?view=<legacy view>` working after the studio page took over
 * `/studio`: views the page renders are allowed through, everything else
 * (`piano-roll`, `mastering`, `performer`, `drum-machine`, `channel-rack`,
 * `effects-rack`, `vocal-suite`, `session`, `dj`, `performance` …) is forwarded
 * to `/studio-classic` with its full query string instead of silently landing
 * on Arrange.
 */
export const studioViewGuard: CanActivateFn = (route) => {
  const view = route.queryParamMap.get("view");

  if (!view || studioModeForView(view)) return true;

  const queryParams: Record<string, string> = {};
  for (const key of route.queryParamMap.keys) {
    const value = route.queryParamMap.get(key);
    if (value !== null) queryParams[key] = value;
  }

  return inject(Router).createUrlTree(["/studio-classic"], { queryParams });
};
