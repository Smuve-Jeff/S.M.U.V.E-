# Layout checks

Playwright probes for the responsive behaviour of the DJ booth and the mixer.
They pin the specific regressions fixed in the layout pass, so a future CSS
change cannot quietly reintroduce them.

## Prerequisites

1. `npm ci`
2. A dev server on `http://127.0.0.1:3000` (`npx ng serve --host 0.0.0.0 --port 3000 --configuration development`)
3. Playwright's Chromium (`npx playwright install chromium`)

On a headless Linux host that lacks the browser's shared libraries, point
`LD_LIBRARY_PATH` at them before running.

## Running

```bash
tools/layout-checks/run-all.sh
```

Each probe exits non-zero when its assertion fails, so the runner fails as a
whole. Every probe signs in through "Continue as Guest" and navigates with
`pushState` + a `popstate` event, so no account or fixture data is needed.
Guest mode has no channel strips, which is why the mixer is asserted on its
master strip and inspector rather than on a populated console.

## What each probe asserts

| Probe | Assertion |
| --- | --- |
| `layout-verify3.cjs` | At 390x844, 844x390, 1440x900 and 800x1280, on `/dj` and `/mixer`: no interactive control is clipped by the viewport and no route scrolls the page horizontally. Controls that live inside a horizontally scrollable ancestor are skipped, because the phone-portrait console is a deliberate snap carousel. |
| `tone-check.cjs` | The deck's `scrollWidth` matches its `clientWidth` at phone sizes, so the tone-stack decoration no longer widens the deck; no descendant overhangs the deck by more than 4px. |
| `console-fit.cjs` | At 1440x900 and 1280x800 the three-column console's `scrollWidth` matches its `clientWidth`, covering the inline padding that absorbs the 3D tilt's projection. |
| `scroll-check.cjs` | After navigating to `/dj` and `/mixer`, the routed host (`.route-anim-host`) sits at `scrollTop 0` and the first module element starts at the top of the viewport. |
| `dj-carousel-check.cjs` | On a portrait phone the console is three full-width panes that scroll horizontally (deck A, central mixer, deck B) with no page-level scroll; landscape and desktop keep the grid. |
| `overhang-check.cjs` | On a landscape and a portrait phone, no control inside the deck overhangs the deck by more than 4px. |

## Deliberate tolerances

- 2px of horizontal slack on page scroll, to absorb sub-pixel rounding.
- 4px of deck overhang, which is a knob's shadow rather than a control.
- `layout-verify3.cjs` skips controls inside a horizontal scroller; without it
  the carousel's off-stage panes read as clipped.
