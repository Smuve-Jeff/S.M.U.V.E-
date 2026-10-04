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
