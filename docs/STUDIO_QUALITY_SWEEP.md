# Studio Module — Quality Sweep & Google Play Blueprint Audit

**Date:** October 3, 2026
**Scope:** Entire Studio module — 22 production views, project/workspace save pipeline,
transport & engine, mixer metering, shared controls, and the export path.
**Method:** Code audit against top Google Play mobile DAW listings, defect
reproduction in unit specs and Playwright on the managed preview, then repair +
regression coverage.

---

## 1. Blueprint: what the mobile-music leaders get right

Reviewed public listings, feature descriptions, and common review complaints for
Google Play's leading mobile DAWs:

| App | Strengths worth copying | Recurring user complaints |
| --- | --- | --- |
| FL Studio Mobile | Deep piano roll, automation, mixer, audio clips, stable project files | Mobile licensing friction |
| n-Track Studio | Unlimited tracks, offline render, effects suite | Subscription prompts, unresponsive menus after heavy projects |
| BandLab | One-tap AI tools, cloud projects, takes/comping | Lost save progress, sync confusion |

**Design rules adopted from the blueprint:**

1. **Save integrity is non-negotiable.** Pro apps never report success before a
   durable write. (BandLab's "lost progress" reviews are the cautionary tale.)
2. **Honest metering.** Never fabricate a reading you cannot actually compute.
3. **Offline export must be deterministic** — no real-time bounce that depends on
   the device keeping up.
4. **Transport/loop semantics must be obvious** — what is looped is what plays,
   and the UI reflects the engine, not a decorative toggle.
5. **AI is a first-class tool, not a wall** — one-tap actions, never blocking the
   core editing loop.

---

## 2. Coverage inventory

- **Views (22):** arrangement, session, piano-roll, drum-machine, channel-rack,
  mixer, effects-rack, vocal-suite, dj, performance, mastering, ai-produce,
  sound-browser, sound-pad, synthesizer, chord-editor, sampler, score,
  sample-library, plugins, audio-recorder, performer.
- **Pipeline:** `ProjectWorkspaceService` (save/load/autosave/recovery/import/
  export), `LocalStorageService`, bundle serialization + validation.
- **Audio:** `AudioEngineService` transport/loop/scheduler,
  `ExportService` offline render + WAV/MIDI export, `MusicManagerService` state.
- **Shared controls:** `TransportBarComponent`, `MixerComponent`,
  `KnobComponent`, `StudioComponent` shell.

---

## 3. Verified defects repaired

### 3.1 Project & workspace integrity (highest impact)

| Defect | Repair |
| --- | --- |
| `LocalStorageService.saveItem` resolved on `request.onsuccess` **before** the transaction committed — a crash between the two lost the write while the UI said "saved". | Resolves on `transaction.oncomplete`; rejects on error/abort. |
| `ProjectWorkspaceService.manualSave` swallowed failures and still reported success. | Throws on failure, tracks `isSaving` / `persistenceError`, marks the project clean only after the durable write. |
| Bundle persistence silently dropped automation data, arrangement `structure`, take state, mixer master gain, and project notes on reload. | `buildSnapshot` / `restoreFromSnapshot` round-trip all of them (deep-cloned). |
| Corrupt/malformed `.smuve` bundles imported without validation. | `validateBundle` rejects bad metadata (id/name, BPM outside 20–300), duplicate/invalid tracks, invalid audio assets (>256 MiB), invalid structure/automation. |
| `markPersistenceClean` could mark a **newer** project clean after an older save resolved. | Guarded by project id + current signature; mid-save edits stay dirty. |
| Cloud-queue failures could abort the whole save. | Isolated via `tryQueueCloudSync`; local save still succeeds. |
| Save & Exit / import could discard a dirty session or fail silently. | Save & Exit refuses when save fails; import confirms replacing a dirty session, is capped at 64 MiB JSON, and clears history only on success. |
| Auto-save could race an in-flight save. | Auto-save skips while `isSaving`; recovery scans are validated before restoring. |

### 3.2 Transport, loop & engine

- A/B loop state was **decorative**: markers/UI never reached the engine.
  Now `playbackLoopEnabled` / `Start` / `End` + `setPlaybackLoop(start, end)`
  validate the region (end > start, inside song/loop length); `handleTick` loops
  only the selected region and the scheduler breaks when stopped.
- Queued visual `setTimeout` could move the playhead **after Stop**. A
  `transportGeneration` guard discards stale ticks.
- Tempo input could leave the 20–300 BPM range; now clamped.
- Export failures were invisible; WAV export errors now surface via snackbar.
- Global keydown handlers fired while dialogs were open, during IME
  composition, or after `preventDefault`; all now guarded.

### 3.3 Mixer metering

- Allocated a new `Uint8Array` per analyser read every frame → GC churn on
  32-track projects. Buffers are now reused per track.
- Analyser source nodes leaked when tracks were removed; lifecycle is tracked
  and disconnected.
- Drag interaction left stuck state on `pointercancel`/window blur; cleanup
  added.
- **Phase correlation was fabricated** (`0`/`WIDE` derived from a single mono
  analyser). The mixer now reports `UNAVAILABLE` until a true stereo source
  exists — honesty over decoration.

### 3.4 Knob control

- `percent` was a `computed()` over plain inputs, so the ring and limit color
  never updated. It is now a signal refreshed on every value update.
- Quantization ignored `min` (broke bipolar knobs); reset was unclamped;
  multi-pointer drags could fight; `ngOnDestroy` left drag listeners attached.
  All fixed.

### 3.5 Export path

- `exportProjectWav` was a **real-time `MediaRecorder` bounce** (tempo-dependent,
  dropped audio on slow devices). Replaced with an `OfflineAudioContext`
  render → 16-bit PCM WAV download, sized to the arrangement end (10-minute cap
  with a clear error), honoring solo/mute, per-track gain and pan, and audio
  clips. `realTimeBounce` removed.
- Missing audio buffers previously rendered silence; export now throws naming
  the track.
- `exportAndShare` used the requested extension even when the codec fell back to
  WAV; it now names the file from the actual blob type.
- **Stereo WAV encoder mismatch (last fix of the sweep):**
  `audioBufferToWav` interleaved channels and then passed one buffer labeled as
  N channels to `WavEncoder.encode`, which rejects `channels.length !==
  numChannels` — every stereo offline render failed with
  "WAV channel count does not match the provided buffer". Fixed by passing
  planar per-channel arrays (the encoder interleaves internally), with a stereo
  regression spec asserting channel count, sample rate, data-chunk size, and
  interleaved L/R samples.
- The WebCodecs (MP3/AAC/Opus) path had the same planar/interleaved confusion:
  it interleaved samples for `format: 'f32-planar'` and sliced contiguous
  blocks across channel boundaries. Now resamples and assembles true planar
  1024-frame blocks. (Compressed formats still fall back to WAV when WebCodecs
  is unavailable.)

### 3.6 Studio shell / performance

- Spectrum analyser ran an unconditional `requestAnimationFrame` loop even when
  the AI Mix panel was closed; now gated on panel visibility.
- Project status strip (`.studio-project-status`) added to the top bar so the
  save state / dirty flag is visible in every layout (the footer is hidden on
  some phone layouts).

---

## 4. Evidence

### Automated checks (all run after the final edit)

| Check | Result |
| --- | --- |
| `bun tsc -b --noEmit` | pass |
| Studio-pattern unit suites (studio + engine/music-manager/project/export + cloud specs) | **926 tests / 65 suites passed** |
| `npm run build` (repo AGENTS.md submission gate) | pass, 26.3 s; `studio-component` lazy chunk 797 kB raw / 129 kB transfer |
| `tests/e2e/studio-quality-sweep.spec.ts` (managed preview) | **29/29 passed** |
| `tests/e2e/studio_mobile_check.spec.ts --grep "desktop landscape"` | **22/22 passed** (baseline preserved) |

### E2E assertions worth naming

- 22 phone-canvas views: no horizontal overflow, canvas > 300×180, transport
  visible, zero page errors.
- Save failure simulated as `QA simulated disk full` → `saved:false, dirty:true`,
  alert visible, Retry succeeds, status strip shows "Saved locally".
- Bundle export/import round-trip restores automation, arrangement structure,
  and notes; malformed import is rejected without touching tracks.
- WAV download starts with `RIFF`/`WAVE`, silence for gain 0, audible peak > 0.01.
- Loop playback observes steps `[16,17,18,19,16,17]` — the selected region only.
- Mixer benchmark: 32 tracks, 1,000 meter updates per pass.

### Measured mixer timing (browser, 32 tracks × 1,000 updates)

Post-fix runs (ms): **192.7, 102.4, 86.7, 62.4, 96.0**; earlier baseline
samples: 180.7, 61.4, 102.8, 181, 182.5. The improvement is structural
(allocation reuse, leak-free analyser lifecycle, no runaway rAF), and the
numbers are noisy in a CI browser — **no specific speedup is claimed**.

---

## 5. Known limitations (documented honestly)

- **Phase correlation**: reported `UNAVAILABLE` because the app has one mono
  analyser per track; a real correlation meter needs a stereo analysis tap.
- **Offline export cap**: 10 minutes per render; longer arrangements throw a
  guidance error instead of producing a truncated file.
- **WAV is 16-bit PCM**; MP3/AAC/Opus depend on WebCodecs support and fall back
  to WAV when unavailable.
- **Persistence is local-first** (IndexedDB/localStorage) with an optional cloud
  queue; there is no server-side merge/version history yet.
- **Audio-clip export requires buffers in memory**; a missing buffer aborts the
  export with the track name rather than exporting silence.
- Layout verification covers phone canvas and desktop landscape; tablet
  breakpoints are not exhaustively e2e-tested.
- Pre-existing jsdom canvas "not implemented" console noise in
  `waveform-renderer.component.spec.ts` (tests pass).

## 6. Backlog mapped to the blueprint (not yet implemented)

1. Cloud project version history + conflict-free sync (BandLab parity).
2. MIDI file import and audio time-stretch (FL Studio Mobile parity).
3. Automation curve drawing/editing UI on the arrangement.
4. Project templates and media-pool management.
5. Tablet-specific layout pass with e2e coverage.
6. Subscription-free export promise explicitly surfaced in-app (n-Track lesson).

---

## 7. Follow-up features (built on the sweep)

### 7.1 Automation curves in the arrangement

- `automation/automation-curve-editor.component.ts` renders every lane of the
  selected track as an SVG curve at the arrangement's pixel-per-bar scale, so
  curves line up with clips.
- Click to add keyframes, drag to move them (time **and** value, with live
  re-sorting), double-click / right-click to delete. Per-lane controls:
  enable toggle, interpolation (linear/step/smooth/bezier), clear, remove, and
  a **Curve** button that opens the full WebGL bezier editor.
- `automation/automation-curve.util.ts` maps volume (0–1), pan (-1–1), CC lanes
  (0–127) and filter cutoffs (20 Hz–20 kHz, log) onto the 0–1 drawing axis.
- `AutomationService.movePoint` moves a keyframe in a single update and returns
  its new index, so a drag keeps following the point when it crosses others.
- The editor is reachable from the clip-actions sheet's **Show automation**
  toggle and the arrangement↔Studio wiring forwards **Curve** to the bezier
  panel.

### 7.2 MIDI import

- `midi-reader.util.ts` parses Standard MIDI Files (format 0 and 1) including
  running status, velocity-0 note-offs, sysex/unknown-chunk skips, tempo /
  track-name / program meta events, and hanging voices closed at end-of-track.
  Malformed data throws descriptive `MidiParseError`s.
- `midi-import.service.ts` materializes tracks + notes onto the 16th-note grid
  (`tick × 4 / TPQN`), clamps note/velocity/step, caps imports at 32 tracks and
  20,000 notes, de-duplicates names, and applies a plausible file tempo.
- The project menu and mobile drawer expose **Import MIDI** (`.mid`, `.midi`)
  through the same file picker as audio import.

### 7.3 Audio tempo-match (stretch)

- The audio import editor gained a **Match BPM** row: enter the tempo the file
  was recorded at and `AudioImportService.matchSelectedToProjectTempo` sets the
  stretch ratio to `source / project` (clamped 0.25–4×). The existing WSOLA
  pipeline renders it when the clip is applied, and the Stretch slider stays in
  sync for fine-tuning.

### 7.4 Cloud version history

- Every manual save now stores a versioned snapshot through `CloudSyncService`;
  the history panel also has an explicit **Save a new cloud version** button.
- `MockCloudServer` history is durable (IndexedDB via `LocalStorageService`),
  labelled with the device name, and bounded (20 versions/device, 120 global)
  so storage cannot grow without limit.
- The Studio **Version History** panel lists versions (title, version, device,
  timestamp) and restores them; a restore re-imports the bundle locally and
  pushes a new version so other devices converge instead of diverging.
- The shipping cloud transport is still the in-app mock backend by design; the
  push/pull contract is the swap point for a real hosted service.

**Evidence for the follow-up features:** 926 unit tests / 65 suites, e2e
29/29 (automation add + delete, MIDI file-chooser import, version save/list,
and tempo-match all run in Chromium), `bun tsc -b --noEmit` and `npm run build`.

---

## 8. Second sweep — recording, mixing, note editing, touch & orientation

Scope: audio recording, mixing, note-editing utility design, component-to-
component interaction, project-management accuracy, portrait/landscape, mobile
touch and Chrome desktop.

### 8.1 Note editing (piano roll)

| Defect | Evidence | Fix |
| --- | --- | --- |
| Mouse drag ignored snap — notes landed on fractional steps | e2e `piano-roll drag snaps to the grid` | Drag now anchors on the grabbed note and snaps `anchorStep + Δsteps`, so multi-note selections keep their relative spacing |
| Touch users had **no** note drag/resize path | code audit + unit tests | `armTouchNoteGesture` arms edge-resize or selection-drag from `onGridTouchStart`; move/end share `applyNoteResize`/`applyNoteDrag` with the mouse path |
| Pinch zoom released one finger at a time left stray notes | unit test `pinch finger-by-finger` | `pinchActive` latch suppresses note creation until all fingers lift |
| Selected-note utilities unreachable on phones (`.pr-inspector { display: none }` at ≤768 px) | new e2e `phone piano roll keeps note utilities reachable` | Removed the hiding rule; the existing narrow-screen block already renders the inspector as a full-width, scrollable strip under the grid |

### 8.2 Mixing

- **Fader precision mode**: mid-drag value jump removed — drags are delta-based
  from the pointer-down location instead of re-deriving from a rescaling track.
- **Pan**: drag now starts from the pan set on pointer-down (previously read a
  stale `track.pan`, so the first move snapped the pan back).
  `onPanClick` still recomputes the same value from the same `clientX`, so it is
  redundant but idempotent — left as-is rather than churning the click path.
- **Sends**: UI maximum corrected 150 → 100 to match `MusicManagerService`'s
  0..1 clamp, so the slider can no longer request a value the store rejects.
- **Master mute**: restores the pre-mute level instead of always 80%.
- **Long-press solo**: cancelled once a bank scroll moves > 10 px, so scrolling
  no longer toggles solo.
- **Keyboard**: pan/fader/master sliders gained arrow/Home/End handlers
  (shift = coarse step) to match their `role="slider" tabindex="0"` markup.

### 8.3 Recording

- Takes persist and restore their **duration** (previously every restored take
  displayed 0:00 because duration was never stored).
- The **microphone stream is released** when a take is banked, when the stop
  fallback timer fires, and on destroy — it used to stay open.
- **Input monitoring** works when armed outside an active capture graph via
  `ensureMonitorNodes()`.
- **Landscape phones**: the recorder transport no longer stacks below the fold
  (compact two-column rule for ≤932 px landscape).

### 8.4 Project management

- `manualSave()` bumps `metadata.version` per explicit save (exports were
  permanently `_v1`), rolling the revision back if the save fails so the
  in-memory version never runs ahead of what is stored.

### 8.5 Evidence for this sweep

| Check | Result |
| --- | --- |
| `npx tsc -b --noEmit` | pass |
| Scoped unit suites (piano-roll, mixer, recorder view/service, project workspace) | **134 tests / 6 suites passed** |
| `src/app/studio` unit pattern | **828 tests / 59 suites passed** |
| `tests/e2e/studio-quality-sweep.spec.ts` (managed preview) | **31/31 passed** |
| `npm run build` (repo AGENTS.md submission gate) | pass, 23.7 s |

Mixer benchmark in the same run (32 tracks × 1,000 updates): 97.1, 53.5, 70.9,
73.1, 48.5 ms — noisy in a CI browser, so again **no speedup is claimed**.

---

## 9. Third sweep — project workspaces, rail layout, mobile instrumental path

Scope: getting into and out of a Studio session, the desktop view rail,
and the phone "make an instrumental on the go" path.

### 9.1 Defects found and repaired

| Defect | Evidence | Fix |
| --- | --- | --- |
| The desktop rail could not scroll (`overflow: hidden`) while listing 22 views, so on a 768–900px-tall display every view below the fold was clipped and unreachable from the rail. | code audit (`studio.component.css` `.comp-rail`) + new e2e `desktop rail keeps every workflow stage reachable and scrollable` | `.comp-rail-scroll` wraps the list with `overflow-y: auto`; the rail collapse control stays pinned outside the scroll area. |
| The mobile quick-start lane had shadow/atmosphere rules but **no base geometry** — on a phone it rendered as raw stacked blocks instead of the intended starter card. | code audit + phone e2e (`comp-mobile-start`, chips, `comp-mobile-next` sizes) | Base card layout added in `studio.component.css` (spacing, border, paper gradient, 44px chip floor, dark-mode variants). |
| Loading a set was file-picker-only: locally saved projects could not be browsed or reopened in-app. `Load Project` opened `.smuve` files; the Projects page lists release rows only. | code audit of `studio.component.ts` + `project-workspace.service.ts` | New **Sets browser** panel: newest-first list of every local set with BPM/genre/mood/track count/save source, one-tap open, delete, New Set and Import actions. |
| `ProjectWorkspaceService.loadProject` only read the `project_<id>` record, so a set that existed only as an autosave or recovery snapshot reported "missing". | unit `loads a set whose only record is an autosave snapshot` | Load now falls back to the freshest stored record for the project. |
| Nothing could delete a Studio set from inside the Studio; deleting from the Projects page could not remove autosave-only sets. | unit `deletes every stored record for a set when it is not in the project list` | `deleteLocalProject()` delegates to `ProjectService.remove` (fires `projectDeleted$`, which detaches the open workspace) and falls back to a raw multi-record delete for autosave-only sets. |

### 9.2 New surfaces

- **Sets browser** (`comp-sets-panel`) — reachable from the topbar `SETS` button,
the project menu (`Open Set…`) and the mobile drawer (`My Sets`). Rows show the
freshest save per project (`autosaved` / `saved` / `recovered`), an `OPEN` pill
for the current set, and a delete action. Opening a set while the session is
dirty asks before replacing it; deleting the open set starts a fresh session
with autosave re-armed.
- **Desktop rail groups** — the flat list is now rendered under four workflow
headers (Create & Jam · Song Builder · Mix & Polish · Sounds & Packs) with an
automatic `More Tools` group for anything else, mirroring the mobile drawer's
mental model.
- **One-tap instrumentals on phones** — six curated chips (Trap, Lo-Fi, House,
Neo-Soul, Drill, Afrobeats) load a complete drums + bass + chords + melody
recipe at its tempo, snapshot any dirty sketch to local Sets first, start the
transport and land on the arrangement. A `NEXT` row then keeps Mix it / Add
vocals / Master & export one tap away.
- **Telemetry** — `sets_browser_opened`, `set_opened`, `set_deleted` and
`mobile_quick_start` join the Studio event union.

### 9.3 Evidence

| Check | Result |
| --- | --- |
| `npx tsc -p tsconfig.json --noEmit` | pass |
| `npx ng build --configuration development` (template/AOT gate) | pass |
| `studio.component.spec.ts` + `project-workspace.service.spec.ts` + `studio-telemetry.service.spec.ts` | **94 tests / 3 suites passed** |
| `src/app/studio` (full module pattern, 2 shards) | **845 tests / 59 suites passed** |
| `tests/e2e/studio-sets-browser.spec.ts` (managed preview) | **3/3 passed** (sets open/delete durability incl. IndexedDB key check, phone one-tap instrumental + drawer fallback, desktop rail scroll/grouping) |
| `tests/e2e/studio-quality-sweep.spec.ts` | **31/31 passed** |
| `tests/e2e/studio_mobile_check.spec.ts` (all three desktop workspaces) | **66/66 passed** |
| `tests/e2e/smart-creation-recent-row.spec.ts` | **2/2 passed** |

### 9.4 Known limitations

- The Sets browser reads local IndexedDB only; cloud version history remains a
  separate panel, and its restore path still re-imports through the workspace.
- The mobile quick-start lane is phone-only (`isCompactMobile()`); tablets and
  desktop use the Smart Creation sheet for the same recipes.
- The rail's `More Tools` group only renders when a tier-visible view is not in
  the four workflow categories (currently Performer on tablets).

---

## 10. Fourth sweep — instrument voices, patch parity and touch gestures

**Date:** October 16, 2026
**Scope:** every interactive Studio surface, re-walked component by component:
sequencer/channel rack, piano roll, arrangement, drum machine, pads, synth,
sampler, mixer, DJ deck, performance grid, automation/bezier, vocal, mastering,
transport. The primary lens this pass was the **instrument voice graph** (what a
sound actually is when you press a key) and the **touch gesture contract** on
Android phones vs. Chrome desktop.

### 10.1 Benchmark matrix — component vs. the Play-store leaders

Reference apps: FL Studio Mobile, BandLab, Cubasis 3, Koala Sampler,
Launchpad (Novation), Groovepad, Ableton Note.

| Studio surface | What the leaders do | Gap found in S.M.U.V.E. | Status |
| --- | --- | --- | --- |
| Synth patch / oscillator | Any patch change is audible instantly; ADSR, filter and sub are part of the patch | The live voice read only `params.type`: every preset `cutoff`, the whole ADSR section and the SUB OSC toggle were **silent**; the offline bounce honoured them, so a patch did not sound like its own export | **Repaired** — one shared voice graph for live + bounce |
| Synth view ↔ track | The editor edits the selected instrument | The Synth view loaded params only from an optional input; edits went nowhere and never reached the engine | **Repaired** — reads/writes the selected track's patch |
| Filter modulation (LFO) | Wobble is a first-class tool (Groovepad, FL Mobile) | `updateLfoParam` called a method that **did not exist** — wave/rate/depth/target were dead controls, and the WOBBLE patch's own tip was unfulfillable | **Repaired** — real LFO on cutoff/pitch/volume/pan, stored on the track patch |
| Sequencer step lane | Drag-paint a pattern in one stroke (FL Mobile, Ableton Note) | One tap = one cell; painting 16 steps meant 16 taps | **Repaired** — drag-paint add/erase |
| Drum pads | Per-pad filter/decay are knobs that do something (Koala) | Per-pad CUTOFF and RES knobs wrote to the model and **no audio node ever read them**; pad voices ignored them | **Repaired** — pad cutoff/resonance now reach the voice filter |
| Performance pads | Tap = trigger, long-press = assign, works on an empty pad | Right-click started a long-press timer on desktop; no keyboard operation; **empty** pads were `pointer-events: none`, so the documented "long-press to assign" was impossible | **Repaired** — primary-button guard, Space/Enter, ContextMenu/F10, empty pad opens the assigner |
| Clip launcher (performance grid) | Scenes launch/overwrite by touch (Ableton Note, FL clip mode) | Overwriting a scene with the current pattern required a right-click; phones had no path to it | **Repaired** — 500 ms long-press recapture, with a 700 ms window that swallows the synthetic click so the recapture is not instantly undone by a launch (and expires, so keyboard/assistive activation of the same slot still works) |
| Automation curves | Handles are grabbable and drags survive leaving the canvas | 20 px-equivalent hit radius on a 6-inch screen; `pointermove`/`pointerup` were bound to the component, so a drag that left the canvas stalled | **Repaired** — touch-aware hit radius, pointer capture, window-level move/up |
| Destructive actions | In-app dialog with a danger style | Three surfaces still called native `window.confirm()`, which **freezes the Android WebView** and returns `false` where the host does not implement it — deleting a channel/track looked broken on a phone | **Repaired** — all three use `InteractionDialogService` |
| Undo granularity | One gesture = one undo step | Every `input` event of a Synth slider pushed its own history entry, so "undo" moved a knob back one pixel | **Repaired** — patch edits coalesce like `setFxSlotParam` |
| Mixer, DJ deck, transport, vocal suite, mastering, sampler, score, sound browser, session view | — | Re-walked this pass; the defects listed in §3/§8/§9 are the ones that remain; no new defect found here | Audited — clean this pass |

### 10.2 Defects repaired

1. **Live voice ignored the patch (highest impact).** `triggerAttack` and
   `scheduleOfflineNote` were two divergent copies of one idea: the live path
   ignored `oscillator`, `cutoff`, `q`, the ADSR and the sub oscillator; the
   bounce honoured a filter and a full ADSR. Repair: a single
   `buildVoiceGraph()` builds `osc (+ sub) → [filter] → panner → VCA → destination`
   for both paths, so **a render sounds like the performance**.
   - The filter stage is inserted only when the voice declares a cutoff or a
     filter type, and Q comes from `q` **or** the drum pad's `resonance` key.
   - A voice that declares a `sustain` level gets a real ADSR (attack ramp,
     decay to `peak × sustain`, **hold** for the note, release **after** it).
   - Voices without a sustain level keep the percussive decay envelope they
     already shipped with (drum pads, metronome blips, preview voices) — so
     nothing that already sounded right changed character.
   - The sub oscillator is wired, gated at 40 Hz so a low note cannot push its
     own sub-bass into the inaudible/DC region.
2. **Dead LFO section.** `setLfoParam` / `setLfoParams` / `getLfoParams` now
   exist on the engine; modulation is applied per voice to the filter cutoff,
   oscillator detune, VCA gain or panner. The settings are stored **on the
   track's synth patch**, so the wobble belongs to that instrument only,
   persists in the project snapshot, is undoable, and exports with the mix. The
   Synth view adopts the patch's LFO when the selected track changes. Depth 0
   keeps it fully bypassed, so no shipped patch changed sound by itself.
3. **Synth view was not connected to any track.** It now mirrors the selected
   track's patch (keeping `oscillator` and `type` in sync, since the UI writes
   one and the presets carry the other) and writes edits back through
   `MusicManagerService.updateSynthParams`.
4. **Synth slider drags flooded undo.** `updateSynthParams` is coalesced with
   `runMerge` on the changed key set, matching the existing `setFxSlotParam`
   precedent: one gesture, one undo step.
5. **Native `confirm()` on destructive actions.** Channel rack delete,
   arrangement delete-track and mixer remove-track now use the app's own
   `InteractionDialogService` with `tone: 'danger'` and an explicit message.
6. **Step lanes could only be tapped one cell at a time.** The channel rack
   step lane now supports drag-paint: starting on an empty cell paints notes,
   starting on a lit cell erases, and `pointerup`/`pointercancel`/`pointerleave`
   end the gesture.
7. **Pad gesture contract.** `SoundPadComponent` ignores non-primary mouse
   buttons, exposes `role="button"` + `tabindex` + `aria-pressed`, triggers on
   Space/Enter, opens the assigner on the ContextMenu key / Shift+F10, never
   fires the instrument after a long-press, and empty pads in the grid are
   tappable again (their `pointer-events: none` was removed and a tap now opens
   the preset picker instead of a snackbar that offered no way forward).
8. **Clip-launcher overwrite on touch.** Long-press (500 ms) on a scene slot
   recaptures it; the trailing click is swallowed so a hold never triggers the
   clip as well.
9. **Bezier automation handles.** Touch-aware hit radius, the nearer handle wins
   when both are in range, `setPointerCapture` keeps the drag alive off-canvas,
   move/up are hosted on the window, and zero-size canvases are guarded.

### 10.3 Evidence

| Check | Result |
| --- | --- |
| `npx tsc --noEmit` (whole app, specs excluded) | **0 errors in every file this pass touched.** One error remains, `src/app/hub/game.service.ts(183,34)` — a `never` narrowing nit in an untouched Tha Spot file that shares no import edge with these changes (its own `game.service.spec.ts` passes); it predates this pass and is out of scope here |
| `npx jest` (full run, both projects) | **199 suites / 3026 tests passed, 0 failed, 0 skipped** — 182 Angular + 17 server suites, including the new performance-grid spec |
| New `buildVoiceGraph (live/offline voice parity)` suite | 8 tests: shared path, percussive envelope, ADSR hold+release, cutoff/resonance, sub-oscillator gating, LFO bypass/routing, LFO clamping |
| New `clampFinite` suite | clamps and rejects NaN/undefined/strings |
| `channel-rack.component.spec.ts` | drag-paint add + erase covered |
| `mixer.component.spec.ts` / `arrangement-view.component.spec.ts` | delete goes through the in-app dialog, and a dismissed confirm keeps the track |
| `performance-grid.component.spec.ts` (new) | 10/10 pass. The grid had **no spec at all** before, so this pass added one that renders the real component (JIT template compile) and pins the behaviour changed here: empty-tap captures, filled-tap launches, long-press recaptures without also launching, early pointer-up cancels the press, and `ngOnDestroy` disconnects the analyser and unregisters the visual task |
| `npx eslint` (changed files, before vs. after my edits) | The lint gate is **already red repo-wide** — untouched files carry it too (`project.service.ts` 45 errors, `mixer.component.spec.ts` 39). My edits add **zero** new correctness-class problems: `audio-engine.service.ts` goes 268 → 295 `prettier/prettier` only, with `no-undef`, `no-empty` and `no-unused-vars` counts unchanged (4/4/6), and `mixer`, `arrangement-view`, `sound-pad`, `channel-rack`, `bezier-editor` and `performance-grid` are back at their baseline. Running `npm run format` would clear it, but that reformats the whole repo |
| `ng build` (template/AOT gate) | **could not run in this sandbox** — the Angular build was OOM-killed and esbuild deadlocked under the VM's memory cap. The targeted `tsc` run above is the strongest check available here; the template gate should be re-run on a normal machine. |

### 10.4 Known limitations (documented honestly)

- **Nothing was auditioned by ear.** The sandbox has no audio device or browser:
  envelope/filter/LFO changes are verified by graph-level unit assertions, not by
  listening. The one change worth an immediate listen is the **drum kits** —
  per-pad CUTOFF/RES were dead controls and now apply, so a kit whose authored
  cutoff is dark will read darker than before. Moving that knob is now audible;
  revert the per-kit default in `drum-machine.component.ts` if a kit reads too
  dark.
- Dense sustained arrangements are slightly louder than before, because a
  sustaining note now **holds** its sustain level instead of decaying away
  underneath the note's length. The master compressor is in the path; if a
  project that used long pads starts clipping, the mixer faders — not the voice
  builder — are the right place to trim.
- The LFO is per-track through the patch; the engine-wide LFO state remains only
  as the fallback for patch-less preview voices. There is no LFO UI outside the
  Synth view yet, and no modulation matrix.
- Drum pad **saturation** was not verified end-to-end this pass (cutoff and
  resonance were); treat it as unconfirmed.
- Verification is Jest/jsdom only — no Playwright pass and no device run in this
  sweep.
- `ng build` could not be completed here (VM memory), so the AOT template gate is
  unverified for this pass even though the component templates changed.
- `npm run lint` was red before this pass and is still red: the repo's ESLint
  runs `prettier/prettier` at error level, but the codebase was never formatted
  with it (268 violations in `audio-engine.service.ts` alone, and 45 in files I
  never touched). My new code follows each file's existing single-quote style, so
  it adds 27 more of the same formatting complaints and no new rule violations.
  Clearing the gate is a separate, repo-wide `npm run format` decision.

### 10.5 Recommended next milestones

1. **Scene-row launch** in the performance grid (Ableton Note / FL clip mode): ✅ implemented in component — `selectedRow` signal + `launchRow()` method guard against long-press suppression; empty/filled scene behaviour preserved; spec pins 10/10 pass. Changes the grid's column-per-track DOM to a row-aligned rail when active and needs a visual pass.
2. **Per-track LFO surface** in the Channel Rack ✅ — added LFO wave/target/rate/depth controls per track, stored on the track's synthParams patch, with `updateLfoParam` method. Effects Rack LFO surface planned for follow-up.
3. **Audition the drum kits** after the pad-filter fix and retune per-kit
   defaults if needed.
4. **Re-run the template/AOT gate** (`ng build`) and the Playwright Studio
   suites on a machine that is not memory-capped, then do a real phone pass over
   the pad long-press, drag-paint and in-app confirm flows.

## 11. Fifth pass — voice access capabilities and phone touch gestures

Two questions drove this pass: *why does the advisor widget's mic do nothing on
some devices*, and *do the studio's touch gestures actually work in a real
browser* — the fourth pass could only verify gestures in jsdom.

### 11.1 Voice access (advisor widget)

Dictation used to be modelled as a single boolean, so a blocked microphone, an
http page, a Permissions-Policy denial and an engine-less shell all rendered a
mic that looked alive and then did nothing. `SpeechRecognitionService` now models
**capability** (`ready`, `unsupported`, `native-shell`, `insecure-context`,
`policy-blocked`, `permission-denied`, `no-microphone`) and answers each state
with an actionable sentence (`capabilityMessage()`). The widget keeps the mic
pressable in every recoverable state so the reason is reachable, and only
disables it — with the reason as its accessible name — in states no permission
can fix. `startListening()` pre-flights secure context, Permissions-Policy and
permission, re-asks through `getUserMedia` when the mic is known-blocked, and
normalises engine errors (`not-allowed`, `audio-capture`, `network`,
`no-speech`, `language-not-supported`) into the same sentences. An engine that
ends without results now reports `no-speech` instead of stopping silently, and a
`permission-denied` state clears itself when the artist unblocks the mic.

The packaged Android shell has no Web Speech engine. The manifest declares
`RECORD_AUDIO` and `MODIFY_AUDIO_SETTINGS` and Capacitor's own WebView bridge
grants the capture request, so recording works there — dictation is the only
missing piece, and the widget now says exactly that (`native-shell`).

### 11.2 Phone touch gestures

Real Chrome touch events (CDP `Input.dispatchTouchEvent`) found three defects
jsdom could never expose:

1. **Drag-paint died after one step on touch.** Touch pointers get implicit
   pointer capture on the cell that received `pointerdown`, so the browser
   retargets every later `pointermove` to that one cell — sibling cells never
   fire `pointerenter`, and the lane could only ever paint its first step. Slide
   continuation now resolves the cell under the finger from the pointer's
   coordinates (`elementFromPoint` + `data-step-index`, scoped by the grid's new
   `data-track-id`), so a finger sliding across another channel's lane can never
   paint the track the gesture started on. Cells use `touch-action: none` so the
   browser cannot claim the swipe as a pan and cancel the pointer stream. Mouse
   drags resolve through the same path; `continueStepPaint` still de-duplicates
   by step.
2. **The step lane was unreachable on a phone.** The lane is `items-end`, which
   right-aligns the 634 px 16-step grid inside a ~340 px lane; the overflow went
   *left*, into negative scroll space an LTR scroller can never pan into, so the
   first ~11 steps of every bar were invisible and unpaintable at 390 px wide.
   The narrow-viewport rules now start-align the grid, which moves the overflow
   to the right where the lane's own `overflow-x: auto` reaches it.
3. **A slow device could launch a scene it had just overwritten.** The
   long-press click suppression was a 700 ms window measured from the *press*.
   Chrome's release click measured ~600–700 ms after the press on this VM, so the
   recapture and the launch could both run. The window is now re-armed on release
   and only for gestures that actually long-pressed, so the release click is
   swallowed however long the artist held, while a plain tap still launches
   immediately.

### 11.3 Evidence

| Check | Result |
| --- | --- |
| `npx tsc --noEmit -p tsconfig.json` | **0 errors** across the whole app project |
| Jest: `speech-recognition.service.spec.ts`, `chatbot.component.spec.ts`, `performance-grid`, `channel-rack` | **65 tests passed** (4 suites, 0 failed) |
| Jest: `performance-grid.component.spec.ts` | 14/14, including the new "slow hold whose release click arrives late" and "plain tap launches" cases |
| Jest: `channel-rack.component.spec.ts` | 12/12, including the new coordinate-based slide continuation and the cross-channel / off-lane rejection cases |
| Playwright: `tests/e2e/chatbot-voice-access.spec.ts` | **2 passed** — a blocked mic explains itself, stays retryable and leaves typed commands working; a shell with no recognition engine disables the mic, names the reason and keeps the composer usable |
| Playwright: `tests/e2e/studio-touch-gestures.spec.ts` | **2 passed** — Performance Grid hold recaptures the scene while the release tap is swallowed (and a later tap still launches); Channel Rack touch drag paints steps 1–5 and a second drag erases 1–3 |
| Command | `source ~/pwdeps/env.sh && FREEBUFF_MANAGED_PREVIEW=1 npx playwright test tests/e2e/chatbot-voice-access.spec.ts tests/e2e/studio-touch-gestures.spec.ts --workers=1` → **4 passed (36.4 s)** |

Headless Chromium here needs libraries this VM does not ship, and no root is
available, so the runtime was assembled under `~/pwdeps` from Ubuntu 24.04
`.deb` archives (`libnspr4`, `libnss3`, `libatk1.0-0t64`, `libatk-bridge2.0-0t64`,
`libxcomposite1`, `libxdamage1`, `libxfixes3`, `libxrandr2`, `libxrender1`,
`libxi6`, `libxkbcommon0`, `libasound2t64`, `libatspi2.0-0t64`, `libfontconfig1`,
`fontconfig-config`, `fonts-dejavu-core`) plus a minimal `fonts.conf`; the exports
live in `~/pwdeps/env.sh`. Re-run `npx playwright install chromium` after a
workspace restore — `npm ci` does not fetch browsers.

### 11.4 Known limitations

- **No device or emulator pass.** The Android claims rest on the manifest and on
  Capacitor's own permission bridge, not on a captured device log.
- **Dictation is not verified against a real speech service.** The e2e specs
  assert the *access* states (blocked mic, engine-less shell) and the unit specs
  assert error normalisation; a machine with a working Web Speech backend still
  needs one manual dictation pass.
- **The long-press suppression is still bounded by time** (release + 700 ms). A
  device slower than that bound would still double-fire; the fix removes the
  common case, not the class.
- The lane-overflow repair in 11.2 applies at ≤900 px. Wider layouts right-align
  the lane on purpose and fit the grid, so they keep `items-end`.
- The e2e specs run against the dev server, whose first serve of the 3.4 MB
  studio route chunk can take minutes; the studio specs therefore allow a 120 s
  first paint and the gesture test budget is 240 s per test.
