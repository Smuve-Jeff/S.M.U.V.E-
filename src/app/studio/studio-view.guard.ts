import { inject } from "@angular/core";
import { CanActivateFn, Router } from "@angular/router";

/**
 * `?view=` values the studio page renders itself.
 *
 * Everything else (`piano-roll`, `mastering`, `performer`, `drum-machine`,
 * `channel-rack`, `effects-rack`, `vocal-suite`, `session`, `dj`, `performance`
 * …) only exists in the classic shell, which still owns those deep links.
 */
const PAGE_VIEWS = new Set([
  "",
  "create",
  "recording",
  "arrange",
  "arrangement",
  "mix",
  "mixer",
  "export",
]);

/**
 * Keep `/studio?view=<legacy view>` working after the studio page took over
 * `/studio`: unsupported views are forwarded to `/studio-classic` with their
 * full query string, instead of silently landing on Arrange.
 */
export const studioViewGuard: CanActivateFn = (route) => {
  const view = (route.queryParamMap.get("view") || "").toLowerCase();
  if (PAGE_VIEWS.has(view)) return true;

  const queryParams: Record<string, string> = {};
  for (const key of route.queryParamMap.keys) {
    const value = route.queryParamMap.get(key);
    if (value !== null) queryParams[key] = value;
  }

  return inject(Router).createUrlTree(["/studio-classic"], { queryParams });
};
