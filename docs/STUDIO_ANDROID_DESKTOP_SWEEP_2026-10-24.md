# Studio device sweep — Android phone touchscreen vs Chrome desktop

**Date:** 2026-10-24
**Scope:** the whole Studio module (`src/app/studio`, 287 files, 22 switchable views)
**Targets:** Android Chrome-class phone (390 × 844 CSS px, DPR 2.625, coarse pointer,
real `Input.dispatchTouchEvent` gestures) and Chrome desktop (1440 × 900 and
1366 × 768, DPR 1).
**Method:** real Chromium 148 + Playwright against the running dev build; DOM
geometry, computed styles, touch-gesture scrolling, contrast measurement and
full-page screenshots for all 22 views on all three viewports. Working evidence
lives in `artifacts/studio-audit/` (`measurements.json`, `*.png`).

> Container caveat: this VM has no emoji font, so emoji glyphs (the drum
> style chips, the MIDI-learn target) render as tofu boxes in the screenshots.
> That is a harness limitation, not an app defect. Audio output, microphone,
> camera, Bluetooth and real-device thermals cannot be judged here.

---

## 1. Verdict

The Studio is a genuinely deep mobile DAW — the signal graph, comping, capture
pipeline, transport and touch-gesture work are ahead of the Play Store field in
several places (§7). It is **not yet a phone-first UI**: on a 390px screen the
chrome takes 212px before any editor, three of the four core editors open with
their editing surface below the fold, and the Channel Rack, Drum Machine, DJ
Booth and Sound Browser expose controls down to 11–14px.

This pass found and repaired one **regression-class** defect that made whole
views unusable on both target devices (§2.1), and two invisible-state defects
(§2.2–2.3). Everything else below is open and prioritised.

---

## 2. Repaired in this pass

### 2.1 P0 — every view was clipped to a non-scrolling window

`src/app/studio/studio.component.css` carried:

```css
.comp-view > :first-child { flex: 1 1 0; min-height: 0; overflow: hidden; }
```

That selector (two classes + `:first-child`) outranks every view's own
`:host { overflow-y: auto }` (one host attribute), so each workspace became a
fixed-height window on a canvas that does not scroll. Measured before the fix:

| Evidence | Phone 390×844 | Desktop 1440×900 |
| --- | --- | --- |
| `app-mixer` content / box | 1317px in a 498px box, `overflow-y: hidden` | 1141px in 588px |
| Mixer controls below the clip | 22, **0 reachable** | 22, 0 reachable |
| Real finger swipe on a strip | `scrollTop` stayed 0, control stayed at y=774 | mouse wheel did nothing |
| Piano Roll grid | top y=677 vs view bottom y=627 — **entire grid below the clip** | grid clipped; only its internal canvas could scroll |
| Drum Machine step grid | `dm-steps-list` top y=1053 | 69 controls below the clip |
| Beginner wizard | 6 step cards below the clip | 6 |

So on a phone the Mixer's lower half, the Piano Roll's note grid and the Drum
Machine's steps were unreachable, and the same class of clipping hit Chrome
desktop. Fixed by making that box vertically scrollable (`overflow-y: auto`,
`overflow-x: hidden`, `overscroll-behavior: contain`). After the fix:

- every view reports a real scroll extent (`app-mixer` 498/1317,
  `app-piano-roll` 498/1142, `app-drum-machine` 498/2417);
- a finger swipe moves the Piano Roll 305px and reveals the grid;
- a mouse wheel moves the desktop Mixer 553px;
- no view introduces horizontal document overflow.

**Follow-up worth doing:** this rule is a patch over a structural problem —
`.comp-canvas` (auto), `.comp-view` (auto on phones) and the component host
(auto) are three nested vertical scrollers. A single scroll owner would be
simpler and would also let Android Chrome collapse its address bar.

### 2.2 P1 — mixer channel names were literally invisible

`src/app/studio/mixer/mixer.component.css` painted the nameplate with a *text*
token and the label with a light-cyan accent:

```css
.mix-strip-name { background: var(--espresso-text); color: var(--teal-300); }
```

`--espresso-text` is `#f1f5ff` in the Night-Sky palette and `#ececf0` in the
flat FL-mobile theme; `--fl-text` then repaints the label in that same near-white.
Measured contrast: **1.00:1** (rgb(236,236,240) on rgb(236,236,240)) on both
devices — a blank white pill above PAN. Repaired with a dark chassis
(`rgba(6,9,26,.88)`) and the theme text colour; measured **16.79:1** and the
names now read (`Velvet…`, `Mo-Ba…`, `Smoot…`).

### 2.3 P1 — phone workspaces now open on the instrument (implemented)

The layout reported below in §3.1 is now fixed for five editors. Each gets a
phone-only disclosure (hidden on desktop) that holds the secondary rails, so the
editing surface is the first thing on screen. Measured on the 390 × 844 phone
viewport, against the view's own 498px height:

| Workspace | Before (surface top) | After | Visible editing surface |
| --- | --- | --- | --- |
| Piano Roll | grid at y=677 (below the fold) | grid at y=241 | 386px of keys + notes, key rail restored |
| Drum Machine | steps at y=1053 | steps at y=456 | ~4 step rows above the transport dock |
| Mixer | strips at y=435 | strips at y=207 | full fader travel on first paint |
| Vocal Suite | mic setup below the fold, header 169px + 2×2 steps | setup card at y≈333, mic interface from y=458 | 169px of the input stage on first paint |
| Performer | keyboard at y=818 (entirely below the fold) | keyboard at y=397 | 190px keyboard, first key at y=450 |
| Sound Browser | header 490px, first preset card at y=620 | header 172px, cards from y=302 | 3 preset cards above the dock |

Effects Rack was measured and left alone: its insert chain already starts at
y=187, directly under a 57px header, so it opens on the instrument. Plugins
opens with its header and the first plugin card (grid at y=356); its cards are
dense, which is the §3.2 touch-target issue, not an ordering one.

- **Piano Roll** — the header keeps the track pill, the Tools disclosure, zoom
  and the five editing tools. Snap, quantize preset, tempo, humanize, selection
  status and key/scale now sit in the disclosure. The key rail is back
  (`display: none` removed) at 44px with right-aligned note names (C1…B2), and
  `+16` / scale chips remain one tap away. The canvas row uses a definite 60vh
  height so the full 78-key column cannot size the row to ~1700px.
- **Drum Machine** — `Style` discloses the AI style card, swing and groove rail;
  the header collapses to one action row at ≤480px; the pattern-context strip is
  one row (tempo, bar, copy/paste/randomize); pads are 60px tiles so the
  sequencer fits.
- **Mixer** — `Phase & Buses` discloses the stereo-correlation card and the VCA
  rack. The header keeps the strips/sends/routing switcher, AI Mix and the
  disclosure in a single row; the repeated "Console / Mixer" title is dropped on
  phones.
- **Vocal Suite** — `Guidance` discloses the neural-guidance HUD card (the
  header drops from 169px to 103px). The four pipeline steps become one row of
  52px tabs instead of a 2×2 card grid, and the main/setup padding tightens, so
  the microphone stage — not the step cards — is visible first.
- **Performer** — `Rack & levels` discloses the rack's VOL/PAN, craft knobs and
  modes, plus the four live meters and capture waveform. The rack keeps only the
  instrument picker (201px → 84px) and the meter deck keeps the Arm / Monitor /
  +48V row (365px → 61px), so the keyboard opens at y=397 instead of y=818.
- **Sound Browser** — `Filters` discloses the genre and mood chip rows, the
  favorites/installed-pack toggles, the sound-pack section and the recent rail.
  Search and the category tabs stay visible; the first preset card moves from
  y=620 to y=302.

All six disclosures are 40–44px touch targets with `aria-expanded` and
`aria-controls`, default closed, and verified at 360, 390 and 412px with no
header overflow and no horizontal document scroll.

### 2.4 P1 — the selected scale chip was invisible in the Piano Roll

A later "redesign" block repainted every scale chip with a near-black
background after the base `.pr-scale-chip.active { background: var(--teal-500) }`
rule, while the active state kept only its dark text colour. The selected scale
read as an empty pill on the 390px toolbar (`Major` at the default key). Adding
the active fill in the later block (and for the dark-mode override, which is
more specific) restores a readable selected state.

### 2.5 P1 — the worst touch targets and the phone velocity lane

**Channel Rack mute/solo** were 14×14 unlabelled squares — the smallest controls
in the rack, and they read as two empty boxes. They now carry `M`/`S` letters,
and on coarse pointers/≤768px they are 44×44 with a 6px gap, stacked
horizontally beside the nameplate.

**DJ Booth loop chips** were 11×30 with 7–8px type; the LPF/HPF switches
27×34. Both are 44×40 minimum on coarse pointers, the chip row wraps instead of
overflowing, and the labels stay legible at 9px.

**Drum Machine strip toggles** (VEL / PROB) were 21px tall because their size
lived in inline styles; the styles moved to `.dm-strip-toggle` and the pair is
52×44 on touch, so choosing which parameter the step graph edits is a thumb
target rather than a hairline.

**Piano Roll velocity lane.** The lane was `display: none` below 768px, so the
Velocity tool selected a mode with no surface. On phones the lane is now a
drawer that rises over the bottom of the note grid when the Velocity tool is
chosen (`aria-expanded` on the tool, a 44×40 close button, `touch-action: none`
so a drag edits instead of scrolling). It is anchored to the transport dock via
`--mobile-nav-height + --transport-dock-height`, so it never covers the
transport, and the lane height is `clamp(96px, 16vh, 132px)` — 132px on a 844px
phone, 102px on a 640px one where the chrome already costs 314px.

While verifying the drawer, the lane turned out never to have rendered at all,
phone or desktop: `renderVelocityLane()` drew through the *grid's* renderer, so
the bars were painted onto the note canvas at lane coordinates (y 0–130) and the
lanes' own GL canvas only ever received `clear()`. It now takes the lane's
renderer as an argument; the bars appear on both tiers for the first time.

**Second pass** — the rest of the named rows:

- **Sound Browser card actions** (preview / favourite / similar) went 40×40 →
  44×44 and stay visible without hover on coarse pointers. 244 → 11 controls
  under 44px in the view, and all 11 that remain belong to the shell (export
  menu rows 42px, AI-band chips 36px, snackbar close 36px). The 44px pair needed
  a new offset: at `right: 48px` the preview overlapped the favourite by 4px,
  and the favourite's bottom corner met the similar button, so the row uses
  58px and the two vertical insets moved to 6/4px.
- **Piano Roll header** — the tool row was already 44×44 (the audit's 36px
  numbers predate §2.3); the Tools disclosure was 38×36 → 44×44, and the Lock
  control was a 13px checkbox in a 41×15 label → a 20px checkbox in a 66×44
  label, verified by tapping the checkbox itself and reading
  `scaleLockEnabled() = true`. Tool row still fits without scrolling at 360px
  (333 = 333) and 390px (373 = 373).
- **Channel Rack bar pager** (`‹ 1 2 3 4 ›`) went 30×30 with 7px numbers →
  44×44 with 11px numbers, in a rail that needs no scroll (284 = 284).

**Third pass** — the rack's inner controls, the Piano Roll's automation/CC band
and the transport's export sheet:

- **Channel Rack instrument selector** was a 7px line at 28px tall → 44px tall,
  10px type, full opacity (it was 0.78).
- **Channel Rack row actions** (clone / move up / down / delete) share a row
  with the nameplate, the 44px M/S pair and the 68px meter stack, so four 44px
  boxes would not fit beside them at 390px. The visual box stays 36px and an
  `::after` spreads the hit area to 44px; the 4px gap makes neighbouring
  targets meet edge to edge rather than overlap. Verified with
  `elementFromPoint`: a 36px button is still hit 20px from its centre and the
  parent takes over at 23px.
- **LFO wave / target** were 4×8 (a 5px glyph in a zero-padding button) and
  12×8 — the smallest controls in the studio — and had **no active state at
  all**: the template's `.is-active` class matched no rule, so the chosen
  waveform was invisible. They are now 22×22 / 34×22 on desktop and 44×44 on
  touch, 12–16px glyphs, with an active fill; tapping them moves the patch
  (`wave: triangle`, `target: pitch` in the check run).
- **Step pads** stay 24px wide so a bar's 16 steps still fit the lane, but went
  38 → 44px tall; **both faders** (volume, LFO rate) 32 → 44px.
- **Piano Roll automation/CC band**: automation chips 36×42 → 44×44, CC lane
  toggles 37×44 → 44×44, Bezier 38 → 44 tall, MIDI OUT select 34×24 → 44×44,
  REC 56×24 → 63×44, and the MIDI OUT label 56×15 → 56×44 (it is the select's
  `label[for]`). Both bands scroll horizontally, so the extra width costs no
  lane width. The view is now down to **4 controls under 44px**, all of them
  shell chrome (38px AI-band chips, 36px snackbar close).
- **Transport export sheet** rows 42 → 44px. On a phone this `<details>` sheet
  is the only route to WAV, stems, MIDI and share; seven rows now scroll inside
  the 68vh sheet rather than one of them sitting under the thumb minimum.

**LFO placement (follow-up).** The panel used to sit beside the 16 pads
*inside* the step panel, which is a horizontal scroller: at 390px it began at
x=493 in a 699px panel with a 350px viewport, so the only route to a modulator
was to swipe the step rail sideways. The pads now have their own row
(`.channel-rack-step-pads`) inside that panel, and below 900px the panel wraps:
the pads keep a horizontal pan of their own (459px of pads in a 336px viewport)
and the LFO takes a full-width row under them at x=29. Because the panel is
~216px tall and a rack of eight channels cannot afford that eight times, only
the **selected** channel shows its modulator — selecting the card is the same
tap that arms the panel. Tapping wave 3 / target 3 set `wave: square`,
`target: volume`, and step taps still toggle notes (26 → 27 → 26) with the pads
scrolled or not. Desktop is unchanged: pads and generator still share one
inline panel.

One placement item remains in this view: the ~150px empty well above the pads
(§3.8), which is a redesign of the card rather than a size fix.

---

## 3. P1 — open, device-visible defects

### 3.1 What remains of the chrome budget

Five editors are instrument-first now (§2.3). The shell itself is not: the 212px
of chrome above every workspace is unchanged, and the remaining views still open
with their own rail stacks. On the same 390px phone the remaining budget is:

| Layer | Height |
| --- | --- |
| Studio topbar + tools row | 94 |
| AI band (assistants) | 50 |
| Workspace viewport | 498 |
| Transport dock (fixed over it) | 72 |
| Bottom navigation | 68 |

With the core editors solved, the next largest wins are the AI band and the tool
row (144px combined for actions that are one tap away in the tools sheet).

The same rail-stack pattern still applies to the untouched views:

- **Arrangement** — opens in beginner mode; the pro timeline needs `SHOW PRO`
  first, and the transport dock covers the last visible bar.
- **Sample Library** — filter rails precede the list; cards remain dense
  (see §3.2).
- **Mastering / DJ Booth** — covered in §3.7 and §3.9.
- **Score / Chord Editor / Synthesizer / Sampler / Recorder / Session /
  Performance / AI Produce / Effects Rack / Plugins** — measured as already
  opening on their primary surface, with the caveats in their table rows.

Competitors open on the instrument: FL Studio Mobile and Koala put the pad/grid
in the first screen and keep tool rails to one or two rows; BandLab's track view
opening is the arrangement, not a form.

**Recommendation:** keep extending the disclosure pattern to the remaining
views, and collapse the AI-band row into the tools row at ≤ 1024px.

### 3.2 Touch targets far below 44dp

Measured visible interactive elements in each phone view (44 × 44 CSS px is the
Android/Material minimum; 48dp preferred):

| View | Controls | < 44px | < 24px | Worst examples |
| --- | --- | --- | --- | --- |
| Channel Rack | 121 | **121 (100%)** | 27 | mute/solo 14×14, bar-edit 30×30, labels 5–7px |
| Drum Machine | 186 | 149 (80%) | 3 | strip toggles 21px tall, take button 24px |
| Sound Browser | 263 | 235 (89%) | 0 | card actions/chips |
| DJ Booth | 106 | 44 (42%) | 14 | loop chips 11–12×30, LPF/HPF 27×34 |
| Piano Roll | 44 | 17 | 1 | zoom/tool buttons, Lock checkbox 14px |
| Performer | 47 | 15 | 0 | MIDI-learn target, rack labels 8px |
| Mixer | 35 | 9 | 0 | fader readouts 8px, sends 7px |
| Vocal Suite | 25 | 5 | 0 | — |
| Sampler | 6 | 5 | 0 | — |
| Audio Recorder | 5 | 3 | 0 | — |
| Chord Editor | 24 | 7 | 0 | — |
| Desktop Channel Rack | 121 | 121 | 87 | same controls, mouse-only density |

The Channel Rack's mute/solo buttons were the single worst offender: 14×14px
squares with no label (one pair renders as two empty boxes in the screenshot).
FL Mobile's mute/solo are ~36×28 with letters; Koala's pads are ≥ 48px. The
three worst rows of this table — Channel Rack mute/solo, DJ loop chips and Drum
Machine strip toggles — are now 44×44 / 44×40 / 52×44 on touch (§2.5); the
percentages below are the pre-repair counts from the audit run.

### 3.3 Phone Piano Roll velocity lane — closed (§2.5)

The key rail is restored (§2.3) at 44px with legible note names, and the
velocity lane is now a drawer opened by the Velocity tool (§2.5). Remaining
difference to FL Mobile and Cubasis: they show the lane permanently, and the
lane here is 132px at most, so a long note's bars need a horizontal scroll.
Landscape phones above 768px wide keep the in-flow lane the desktop tier uses
(§2.3's landscape rule), which is already visible without a drawer.

### 3.4 Typography floor is too low

Counts of visible text nodes under 9.5px: DJ 83, Sound Browser 78, Performer 62,
Session 47, Channel Rack 33, Drum Machine 32, Mixer 13 (phone). Actual sizes:
Channel Rack 5–7px (`LFO`, `Depth`, bar labels), DJ 7–9px (`LPF`, `33 RPM`),
Mixer 7–8px (sends, fader readout), Session 8–9px. On a 6" phone this is below
comfortable reading; raise the floor to 11px and let layout absorb it.

### 3.5 Mixer strip density and labels

- The phone strip is ~54px wide: names truncate at six characters, the M/S
  control renders as `S…` inside a dashed box, `AUX A –∞` is 7px, and the master
  shows `LUFS-68.5` / `PEAK0.0` without spacing or units.
- `STEREO PHASE CORRELATION 0.00 WIDE` occupies ~200px of the phone view; it is a
  mastering-stage readout, not a per-channel mixing need.
- Faders are vertical drags (`touch-action: none`), so a finger starting on a
  strip cannot scroll the console — scrolling only works from the header or the
  10px side gutter (verified: header swipe scrolls 285px, strip swipe 0px).
  That is acceptable for faders but needs a visible gutter/scroll affordance.

### 3.6 Drum Machine: style panel before the instrument

The AI Style card is the visual centre of the phone view (cream card on the
dark console — a theme inconsistency of its own) while the step grid is 426px
below the fold. On desktop the grid is visible but 132 controls are under 24px.
Recommend reordering: grid first, style/AI collapsed into a sheet.

### 3.7 Mastering: overlapping analyzer chrome and clipped targets

The phone screenshot shows `REFERENCE A/R` sitting behind the spectrum canvas
and the `STOPPED` badge overlapping the panel border, plus the delivery-target
cards cut by the view edge (now scrollable, but the header cluster still
collides). The top of the view spends three large buttons (ROAST, RENDER &
MASTER, AUTO-PROCESS) before any analyzer or parameter; a mastering screen
needs the spectrum and the loudness targets first.

### 3.8 Channel Rack wastes the phone's scarcest axis

Each track card contains a ~150px empty well with three almost-invisible
floating controls (copy, delete, up/down) between the preset name and the bar
pager. It pushes the second track below the fold and offers no meter. Collapse
the well into a row action menu and add a level meter.

### 3.9 DJ Booth is not operable from the first screen

- The first screen is two empty waveform lanes ("Drop a record on side A/B");
  jog wheels, crossfader, EQ and FX are below the fold.
- Loading is a tap on one of six unlabeled icon buttons in the top cluster
  (`title` only, which touch never shows) — while the copy says "Drop a record",
  implying a drag-and-drop gesture that does not exist on touch.
- Status reads `READY TO MIX · 0 BPM` while both deck readouts say `128 BPM`.
- The walnut/brass skeuomorphic deck sits against the flat orange console used by
  the Mixer/Piano Roll — two visual languages in one workspace.

### 3.10 Beginner wizard content hides behind its sticky actions

The active step card ends at y=677 while the view ends at y=627; the sticky
`I KNOW WHAT I'M DOING — SHOW PRO MODE` bar covers the step description
(screenshot). The CTA is reachable but the step's own text is not, which is the
opposite of an onboarding screen's job.

---

## 4. Per-view audit — phone vs desktop

| View | Phone | Desktop Chrome | Main gap vs Play-Store field |
| --- | --- | --- | --- |
| Arrangement | Beginner wizard by default; pro timeline behind "SHOW PRO MODE"; dense transport dock works | WebGL timeline, inspector docked; 64-bar ceiling removed | No tempo/time-signature map; no ripple edit; no freeze/bounce-in-place (FL/Cubasis have all three) |
| Session (clip launcher) | Scene tabs scroll horizontally; launch targets ≥ 44 (0 under 44) | Scene grid + follow actions | Good; capture-to-arrangement still missing (BandLab/Ableton Note) |
| Piano Roll | Grid below fold; key rail hidden; toolbar scrolls away | Grid fills; 44/44 controls under 44px | FL Mobile keeps keys + velocity; note repeat/arp only via AI panel, not a tool |
| Drum Machine | Style card before grid (grid at y=1053); 149/186 controls < 44 | Grid visible; 132 controls < 24px | Strong per-step depth (probability, ratchet, polymeter); groove chips scroll but no affordance |
| Mixer | ~300px header before strips; strips clipped pre-fix; 6-char names | Empty console area with 3 tracks; faders clipped pre-fix | No group/bus faders or N sends (FL/Cubasis); phase panel is not a per-strip tool |
| Channel Rack | 121/121 controls < 44; 150px empty well | 121/121 < 44; 87 < 24 | No meters, no reorder drag on touch verified |
| Effects Rack | Clean; 0 under 44 | 4/16 under 44 | Insert presets/GR meters still open (parity doc P2) |
| Vocal Suite | 5/25 under 44; deep comp stack | Layout fits | Strong; comping is ahead of FL Mobile/Cubasis Android |
| Audio Recorder | 3/5 under 44 but reachable; monitor/gate/device switch | Same | Add latency calibration wizard (parity P1) |
| Sampler | 5/6 controls < 44 (zones) | Fits | Zone editor is fine-motor heavy on a phone |
| Synthesizer | 2/19 under 44; knobs are pointer-captured | 10/28 < 44 | Knob precision on 5" is still the weak point (risk audit §6) |
| Score | Read-only: 0 interactive elements measured | Same | Cubasis edits notation; ours is display-only (no note entry, no print/export) |
| Sound Browser | 235/263 controls < 44; 78 text nodes < 9.5px | 19/32 < 44; hover-revealed play button covered by a `pointer: coarse` override | Fine; card density is the issue |
| Sample Library | 1/100 under 44; scrolls | 53/100 < 44 | Good |
| Sound Pad | 0/17 under 44 | 0/17 | Good — pads are the model for the rest |
| Performer | 15/47 under 44; XY pad pointer-captured; multi-touch via `activePointers` | 11/47 | Strong; smart chords/MIDI panel reachable |
| Performance | 0/10 under 44 | 0/10 | Good |
| AI Produce | 1/10 under 44 | Fits | Strong differentiation |
| Plugins | 1/32 under 44 | 32/32 < 44 | Good; no plugin gain-reduction meters |
| Mastering | Overlapping labels; delivery cards clipped pre-fix; 2/25 under 44 | 12/25 < 44 | Preset idempotence + spectral delta vs reference still open |
| DJ Booth | Controls below fold; 44/106 < 44; ambiguous load; 0 vs 128 BPM | Same layout, more room | No competitor ships a DJ deck inside the DAW — protect it, but make it operable on a phone |
| Chord Editor | 7/24 under 44 | Same | Fine |

---

## 5. Recording, editing and project-workspace logic

**What is genuinely strong (do not regress):**

- Bounded capture buffer, spill-to-disk, per-take peak files, streaming WAV.
- Take finalisation on `visibilitychange` / `freeze` / `pagehide`
  (`audio-session.service.ts`), so a backgrounded Android WebView does not lose
  the take.
- Monitoring is optional, gates correctly, and refuses to switch input mid-take.
- Count-in (0/1/2 bars) is wired through the engine, and the transport disables
  repeat presses during it.
- Comping with take lanes, sectional comp, and best-take suggestion is ahead of
  FL Mobile and Cubasis Android.

**Open logic defects:**

1. **Autosave can latch off for the rest of the session.** `autoSaveEnabled`
   starts `true` and is only ever set `false` — in the "project too large"
   branch (`project-workspace.service.ts:287`) and after deleting the open set
   (`:589`). `startFreshProject()` resets ~15 signals but not this flag, so after
   deleting a set the new session never autosaves until reload. (Delete path:
   set flag → `startFreshProject` → no re-enable.)
2. **No page-hide flush for the project bundle.** The recorder and audio session
   listen for `pagehide`/`freeze`; `ProjectWorkspaceService` does not. With a
   30s autosave interval and an Android WebView that can be killed from the
   background, up to 30 seconds of edits can vanish with no warning. Add a
   `visibilitychange`/`pagehide` save (or a synchronous recovery snapshot) and
   re-arm autosave in `startFreshProject()`.
3. **No latency calibration in the recording flow.** The latency service and
   per-device baseline exist, but the recorder offers no "calibrate" affordance;
   the parity audit already flags discoverability.
4. **USB audio input and Android MIDI do not exist.** `hardware.service.ts`
   returns early when `navigator.requestMIDIAccess` is missing (Android WebView
   never exposes it), so a Launchkey is silent; no native bridge ships.

---

## 6. Chrome desktop specifics

- After the clipping fix, the desktop Mixer/Drum Machine/Arrangement scroll with
  the wheel and all controls are reachable (verified: Mixer 553px).
- The desktop chrome is still 232px of 900px (26%) before the workspace
  (topbar 56 + tools 44 + AI band 64 + marquee 20 + footer 48), and the 1366×768
  target leaves only 512px of editor.
- Fine-pointer targets are allowed to be small, but the same 5–9px labels and
  14px mute/solo squares ship to desktop; 87 Channel Rack controls are under
  24px, and the Piano Roll toolbar wraps `Q Sel` at 1440px.
- Hover-only affordances are partly covered (24 `(pointer: coarse)` blocks; the
  Sound Browser forces its play button visible on coarse pointers), but 546
  `:hover` rules remain — a touch user can still meet a control that only
  appears on hover outside those overrides.
- The marquee is decorative but costs 20px on every desktop view; make it
  user-collapsible like the header.

---

## 7. Competitive position (Google Play mobile DAWs)

Verified in code, not from the parity doc:

**Ahead of the field:** comping/take lanes, background-safe take finalisation,
on-device stem separation, per-step drum probability/ratchet/polymeter, a full
DJ deck in the DAW, AI session musicians that observe the project graph,
standards-based loudness analysis, deterministic offline export.

**At parity:** arrangement, piano roll depth (bezier CC, scale detection), mixer,
sampler, synth engines, plugin store (WASM), performance pads, MIDI learn,
export (WAV 16/24-bit, MP3, M4A, Opus, MIDI), cloud *architecture*.

**Behind (open):**

| Gap | Field baseline | Ours |
| --- | --- | --- |
| Tempo / time-signature map | FL Mobile, Cubasis | Single tempo/time signature |
| FLAC export | FL Mobile, n-Track, Audio Evolution | WAV/MP3/M4A/Opus only |
| Group/bus faders, N sends | Cubasis, n-Track | VCA/group bus exists but no full bus-fader surface |
| Track freeze / bounce-in-place | FL Mobile, Cubasis | Missing (CPU cliff on long MIDI projects) |
| Notation editing | Cubasis | Read-only score view |
| Android MIDI bridge | FL Mobile, Cubasis, Audio Evolution | Web MIDI only → no-op in WebView |
| USB audio input | Audio Evolution, n-Track | Device mic/WebRTC input |
| Ableton Link / MIDI clock in | Cubasis, Koala | MIDI clock out (DJ) only |
| Background playback | Cubasis, n-Track | Session finalizes when backgrounded |
| Real cloud sync | BandLab, n-Track | `MockCloudServer` (IndexedDB only) |
| Play Billing | All commercial apps | Mock shim, no store receipt |
| DAWproject interchange | Cubasis 3.7+ | Missing |

---

## 8. Prioritised backlog from this sweep

**P0 — data safety**

1. Re-enable autosave in `startFreshProject()` and add a page-hide/visibility
   flush for the project bundle.
2. Add a regression test that a control below the fold becomes visible after one
   touch swipe in Mixer, Drum Machine and Piano Roll (the clipping bug shipped
   through a green 3,409-test suite because no test scrolled).

**P1 — phone usability (competitor-visible)**

3. ~~Canvas-above-the-fold pass for Piano Roll, Drum Machine, Mixer, Vocal Suite,
   Performer and Sound Browser~~ — done in §2.3. Effects Rack and Plugins
   verified as already compliant. Remaining: Arrangement's beginner gate and the
   Sample Library filter rail.
4. ~~44dp touch-target sweep~~ — done in §2.5 for the Channel Rack (M/S, bar
   pager, instrument selector, row actions, LFO pickers, step pads, faders), the
   DJ loop chips, the Drum Machine strip toggles, the Sound Browser card
   actions, the Piano Roll tools/Lock and its automation/CC band, and the
   transport export sheet. Remaining cross-cutting: the shell's 36px AI-band
   chips and 36px snackbar close. The Channel Rack's LFO panel now has its own
   row on narrow cards (§2.5).
5. ~~Restore a 40px key rail and a collapsible velocity lane in the phone Piano
   Roll~~ — done in §2.3/§2.5. Remaining: keep the toolbar sticky while the
   grid scrolls.
6. 11px typography floor across Channel Rack, DJ, Mixer, Session and Performer.
7. Mixer phone layout: compact correlation readout, wider strips or a focused
   single-strip mode, and a visible scroll gutter.

**P2 — polish and logic**

8. Mastering: separate the analyzer header/reference labels, move delivery
   targets above the fold, and stop the `STOPPED` badge colliding with the panel.
9. Channel Rack: replace the empty 150px well with a row menu and add meters.
10. DJ Booth: label the six icon actions, make load obvious (`LOAD RECORD`), fix
    the 0 BPM vs 128 BPM readout, and surface the crossfader on the first screen.
11. Beginner wizard: reserve space for the sticky CTA so step copy is never
    covered.
12. Piano Roll toolbar de-duplication (grid-size row vs "Straight 1/16 Note"
    dropdown; `Q Sel`/`Q All` overflow).
13. Collapse the AI-band row into the tools row at ≤ 1024px; the third chip is
    already truncated at 390px.

**P3 — competitive gaps** (from §7): tempo map, FLAC, bus faders, freeze,
notation editing, Android MIDI/USB audio, Link/clock-in, background playback,
real cloud sync, Play Billing, DAWproject.

---

## 9. Verification for this pass

| Check | Result |
| --- | --- |
| `npm run build` (AOT) | exit 0; only the pre-existing 1.98 MB vs 1.75 MB budget warning |
| Affected specs (`mixer`, `piano-roll`, `drum-machine`, `studio`) | 4 suites / 143 tests passed |
| Affected specs (`vocal-suite`, `performer`, `effects-rack-ui`) | 3 suites / 28 tests passed |
| Post-fix measurements, 22 views × 3 viewports | scroll extents present in all views; no horizontal document overflow |
| Touch scroll, phone | Piano Roll 305px, Mixer 285px from header, desktop wheel 553px |
| Mixer nameplate contrast | 16.79:1 (was 1.00:1) |
| Piano Roll active scale | orange fill + dark text (was dark-on-dark) |
| Phone-first surfaces, 390×844 | Piano Roll grid y=241, Drum steps y=456, Mixer strips y=207, Vocal mic stage y=458, Performer keyboard y=397, Sound Browser cards y=302 |
| Disclosure behaviour, 360 / 390 / 412 | toggle visible, `aria-expanded` flips, rail opens and closes, zero header overflow |
| Vocal Suite header | 169px → 103px; steps 2×2 → one 52px row |
| Performer sections | rack 201px → 84px, meter deck 365px → 61px |
| Sound Browser header | 490px → 172px; first card y=620 → y=302 |
| Desktop 1440×900 | rails still inline, disclosures `display: none`, no layout change |
| Velocity drawer, 390×844 | drawer y=518 h=186 above the dock (704), lane 132px, canvas 4096×260 device px, close 44×40, no document overflow |
| Velocity drag, 390×844 (touch) | press at 0.29 of the lane height → velocity 0.71 from 0.78, i.e. the measured lane height drives the mapping |
| Velocity drawer, 360×640 / 768×360 | drawer h=156 / 142, lane 102 / 88px, close button on screen, no overflow |
| Velocity bars | render on desktop (88px lane) and in the phone drawer; previously the lane was blank on both because the bars were drawn into the grid canvas |
| Channel Rack mute/solo, DJ loop chips, drum strip toggles | 44×44 / 44×40 / 52×44 on touch; 14×14, 11×30 and 21px before |
| Sound Browser card actions, 390×844 | preview / favourite / similar 44×44, no pairwise overlap (`playFav`, `playSimilar`, `favSimilar` all false), 244 → 11 controls under 44px |
| Piano Roll tools + Lock, 360 / 390 | disclosure 44×44, Lock 66×44 with a 20px box, checkbox tap flips `scaleLockEnabled`; tool row fits (333=333, 373=373) |
| Channel Rack bar pager, 390×844 | `‹ 1 2 3 4 ›` 44×44 at 11px, rail needs no scroll (284=284) |
| Channel Rack inner controls, 390×844 | instrument 145×44, LFO wave 44×44, LFO target 44–56×44, step pads 24×44, faders 40–129×44; row actions 36px visual with a 44px hit area (hit at +20px, parent at +23px) |
| LFO patch change, 390×844 (touch) | tapping wave 2 / target 2 sets `wave: triangle`, `target: pitch`, and both read as `.is-active` |
| Piano Roll automation/CC band, 390×844 | 44×44 for automation chips, CC toggles, Bezier, MIDI OUT label and select, REC (63×44); view has 4 sub-44 controls left, all shell chrome |
| Transport export sheet, 390×844 | 7 rows at 166×44 inside the 560px sheet; sheet scrolls (612 > 558), no document overflow |
| Channel Rack LFO placement, 390×844 | LFO panel x=29 (was 493, off-screen), 336×216 full-width under the pads; pads pan 459 > 336 inside their own row; only the selected card shows it (selecting card 2 flips `display` to `none,flex,none`) |
| Channel Rack steps after the wrap, 390×844 | tapping cell 3 toggles 26 → 27 → 26 notes; pads scroll 0 → 120 independently; desktop panel geometry unchanged (pads 427, LFO 176×100) |

The clipping, contrast, scale-chip and touch-target repairs are CSS-only apart
from the Drum Machine's inline styles moving into its stylesheet. The phone-first
layout adds one `signal` per component (default closed) plus a disclosure button
and class bindings in six workspaces; desktop markup order and styling are
untouched, and the Effects Rack and Plugins needed no change. The velocity
drawer adds one signal, one wrapper element and one argument to
`renderVelocityLane`; desktop keeps `display: contents` on the wrapper, so the
lane stays in the band stack. The rest of the findings stay documented rather
than patched so product decisions (strip layout, typography floor) remain
deliberate.
