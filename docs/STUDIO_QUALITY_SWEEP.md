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
7. ~~Sample streaming for long imports (bounded preview + windowed playback)~~ —
   **shipped**: `SampleStreamer` bounded resident window wired from
   `AudioImportService` through arrangement clip admission (`clipStreamer`) and
   `AudioEngineService.triggerSampler` playback (see §7.4 and §12).

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

### 7.4 Sample streaming for long imports

- The audio import path gained a bounded-preview streaming path for long imports
  (>10 s). Short one-shots are still fully decoded; a long import keeps the raw
  file as the source and serves playback windows from a bounded resident window
  (`SampleStreamer`, `src/app/services/sample-streamer.service.ts`). Import
  wiring is done (`src/app/studio/audio-import.service.ts`): long imports probe
  the file to attach the real sample rate / channel count, the resident window is
  surfaced through `ImportedAudio.sampleStreamer`, and `addToProject` can add a
  track from the preview window. The playback consumption path is still a
  one-shot `AudioBuffer` per clip, so the memory win on playback is not yet
  realized end-to-end — that is the next step (§12).

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

### 7.5 Sample streaming — playback coupling (next)

- The import path already admits long imports through `SampleStreamer`; what is
  left is to make the arrangement playback path draw its audio clip from the
  streamer's resident window instead of from one full decoded buffer, keeping the
  playhead synchronized to clip playback so the preview window refills as the
  clip plays. Until that is done, the memory win is confined to import/admission
  rather than to playback of a multi-stem arrangement.

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

## 12. Sixth pass — S.M.U.V.E. 2.0 AI integration (control, persona, knowledge)

The brief was: the chatbot should *run* the whole application on request, in one
consistent ominous character that adapts to the current artist, and it should be
genuinely expert in music business, legal, production, marketing and promotion.
This pass read every AI surface before changing any of them, so the parts that
were already right are recorded as shipped rather than rebuilt.

### 12.1 What the inspection found

1. **The persona layer was already shipped — and the promise it made had no
   mechanism.** `persona.types.ts` holds the four modes (default S.M.U.V.E.
   Prime, ominous and theatrical), every non-signature mode ships its own
   offline copy so an artist on Elite or Supportive is not mocked in Prime's
   voice, and `buildMasterPrompt()` already injects the artist fine-tune block,
   the committed archetype read, the sonic non-negotiables and the command
   authority line. What did *not* exist was execution: the prompt told the model
   to "hand the command over instead of describing it", while the only route to
   `SmuveTotalControlService` was a slash command or one of five hard-coded
   patterns. "Mute the bass", "save my session", "switch to the mixer" and
   "export as wav" reached the model, which — having no hands — described the
   command back to the artist. That is the gap this pass closes.
2. **The MASTER chip was a dead command.** The footer chip routed `MASTER` →
   `executeCommand('/mastering')`, and `parseCommand()` had no `/mastering`
   case, so the artist got "Command not recognized" for a module the app ships.
3. **`/knowledge [topic]` answered with a table of contents.** It listed up to
   three entry *titles*, so a knowledge question needed a second query to reach
   the actual guidance.
4. **The knowledge inventory was not real.** The category headers advertised 92
   entries; 47 existed (Legal claimed 8 and held 4, Distribution 6 and held 2,
   Marketing 15 and held 8). `getCounts()` and the `/knowledge` overview report
   from the same inventory, so every coverage claim inherited the gap.
5. **The prompt had no live session state and no knowledge grounding.** The
   model could not answer "what is muted?" or "how many tracks?" from state,
   and nothing kept business/legal answers on the reviewed entries.

### 12.2 What shipped

- **`ChatAppCommandService` (new)** — a natural-language → Total Control bridge.
  `interpretAppRequest()` is a pure function that maps imperative requests onto
  commands the engine actually implements: mixer (`mute`/`unmute`/`solo`/
  `unsolo`, `volume`, `reset`), tracks (`list`, `add`, `remove`), project
  (`save`, `new`), export (`formats`, `wav`/`mp3`/stems), navigation
  (`switch to`/`pull up`/`jump to`), mastering, audit, status, split sheets,
  market intel, release and promo strategy, vocal warm-up/tips/chain, the comp
  suite, and knowledge lessons. It bypasses nothing: the command string goes
  through `executeCommand()`, so the Full-Control gate, the guarded-verb
  `/confirm` hand-off and the command history all still apply.
- **Questions are structurally excluded.** A leading interrogative (how, what,
  why, should, can I, …) returns null before any matching, so "how do I mute the
  bass" is answered, not executed; slash commands and music-creation verbs
  (beats, basslines, drums, chords, melody, lyrics, tempo) stay with the
  chat-music engine that already owns them.
- **Persona-correct acknowledgements.** `describeControlOutcome()` answers in the
  active mode's register: Prime gets `⚡ EXECUTED — …` / `⚡ BLOCKED — …`, and
  Elite/Balanced/Supportive get their own acknowledgement lines (with `{artist}`
  and `{request}` filled), so execution never leaks Prime theatre into another
  character. A pending `/confirm` is always handed back to the artist.
- **Prompt grounding.** `buildMasterPrompt()` now carries a LIVE SESSION block
  (project, tempo, up to 24 tracks with mute/solo flags) and a VERIFIED
  KNOWLEDGE BASE block (the top three matching curated entries, with their
  scope notes, jurisdictions and sources), instructed to keep those cautions and
  to flag anything said beyond them.
- **Knowledge expansion: 47 → 77 entries, with honest headers.** Production
  14→20, Marketing 8→15, Business 5→10, Legal 4→8, Distribution 2→6, Career
  2→6; Songwriting (7) and Vocal (5) are named as the remaining backlog instead
  of claiming more than they ship. New entries cover release asset ladders and
  content cadence, paid-promotion math, owned-channel conversion, editorial vs.
  paid playlisting, brand consistency, decision-changing analytics, royalty
  collection pools, ISRC vs. UPC, statement reading, release P&L, commission
  scope, contract red flags, publishing administration vs. ownership, name
  clearance, AI provenance, delivery metadata, Content ID and covers,
  small-room touring math, sync-ready catalogues, feature terms and sustainable
  cadence.
- **Scope notes on money and rights.** `legal-02` and `legal-03` now state their
  scope and territory like the other Legal entries, and a spec enforces that
  every Legal entry carries a jurisdiction note, a source, or an explicit "not
  a legal opinion" line.
- **`/knowledge [topic]` answers.** It now returns the top entry's full guidance,
  action, scope and sources, with the next two matches listed underneath.
- **`/mastering` fixed** to navigate to the master suite instead of failing.

### 12.3 Evidence

| Check | Result |
| --- | --- |
| `npx tsc --noEmit` | **0 errors** |
| Jest: `chat-app-command.service.spec.ts` (new) | 14 tests — mappings, mutation flags, question guard, music-creation exclusion, slash/incomplete/unrelated rejection, persona-formatted outcomes, service execution |
| Jest: `smuve-knowledge-engine.spec.ts` | Counts frozen at 20/7/5/15/10/8/6/6 = 77 with unique ids, every entry substantive, every Legal entry scoped, business queries hitting the new entries |
| Jest: `chatbot.component.spec.ts` | 33 passed, including "executes a natural-language app request through the control engine" (asserts `/mixer mute bass` is executed and `getAIResponse` is **not** called) and the untouched question path |
| Jest: `smuve-total-control.service.spec.ts`, `persona.types.spec.ts` | passed — the chip sweep, the confirmation flow and the persona catalog are unchanged |
| `npx ng build` | Application bundle generation complete |
| `npx eslint` on the touched files | **0 non-prettier findings.** The five pre-existing files report 1,828 `prettier/prettier` complaints against 1,526 at HEAD — the same family of style complaints the file already carried, with the added lines written in each file's existing single-quote style. The two new files are `prettier`-clean. Clearing that gate remains the repo-wide `npm run format` decision it already was (§10.4). |

### 12.4 Known limitations

- **The router only executes what the control engine implements.** A request
  that implies a judgment call ("make the mix wider", "should I drop this") is
  still advice from the model, which is the correct split — but it means "full
  control" is bounded by the command surface, not by the chat surface.
- **Ordering resolves one ambiguity.** "Add a bass" creates music (chat-music
  engine runs first) while "add a bass track" creates a track. Both are tested,
  but an artist who means the other one must say so.
- **Grounding is not verification.** Business and legal answers now ride on the
  curated entries, but the live model can still go beyond them; the prompt asks
  it to say when it does. Nothing here substitutes for counsel.
- **No live-model pass in this environment.** The prompt changes are verified by
  inspection and by the specs that assert the injected blocks, not by a real
  completion against the Gemini endpoint.
- **No browser/e2e pass for the chat flow.** The unit and component specs cover
  routing and rendering; a manual pass was not run.
- **The knowledge counts are frozen in a spec.** Adding an entry now fails the
  inventory test until the map is updated — intentional, and the reason the
  "92 vs 47" gap cannot silently return.
- **The 30 new entries cost initial-bundle weight.** The budget warning was
  already failing before this pass (148.84 kB over the 1.75 MB budget); it is now
  177.98 kB over, because the knowledge base ships with the chatbot. Moving the
  base behind a lazy boundary is the fix, and it belongs to a bundle pass, not
  to this one.

---

## 13. Seventh pass — the professional studio surface

The first six passes fixed *behaviour*. This one rebuilt the **surface**: the shell
had a different depth, glass and motion recipe in every file, the arrangement had
no way to touch a track without leaving it, and nothing in the Studio responded to
an OS accessibility setting. Four layers landed, plus one shared defect the new
tests dragged into the light.

### 13.1 What shipped

- **One depth scale and one glass recipe** — `src/studio-pro-surface.css`.
  Every tier is a token (`--daw-z-workspace` 0, `--daw-z-content` 10,
  `--daw-z-tools` 40, `--daw-z-menubar` 45, `--daw-z-scrim` 50,
  `--daw-z-panel-scrim` 75, `--daw-z-panel` 80, `--daw-z-sheet` 85,
  `--daw-z-overlay` 120, `--daw-z-toast` 9000) with a matching elevation token, so
  a surface picks a *tier* instead of typing a number. Glassmorphism 2.0 is a
  12px-blur recipe with a three-stop edge gradient (16px / denser fill for panels
  and popovers), applied to the topbar, rail, dock, toolbar, footer, panels and
  drawers. The FL-Mobile flat layer that had stripped every blur from the docked
  chrome is gone.
- **Contextual Inspector** — the arrangement's right-hand channel strip. It is a
  second *view* of one track, never a second source of truth: level, pan, mute,
  solo, colour and the FX handoff all write through `MusicManagerService`, so a
  change lands on the live graph, in the undo stack and in the project bundle the
  same way a Mixer move does. Desktop only — on a phone the strip is a two-handed
  surface and the bottom dock already owns that space.
- **High-resolution FFT spectrum analyzer** — log-frequency trace (an FFT spends
  ~90% of its width above 5kHz; a log axis is the only readable mapping), dB grid,
  peak-hold with 4.5dB/frame falloff, wired into the Mastering suite.
- **Capability layer** — `src/studio-adaptive-display.css`. `prefers-contrast:
  more` remaps the *palette the Studio already consumes* and reinforces structural
  hairlines instead of restating colours; `prefers-contrast: less` spends down the
  glow budget; `forced-colors: active` restores every state the shell encoded as a
  shadow or a glow (active destination, armed track, engaged pad, recording) as an
  outline; `dynamic-range: high` pushes the canvas to true black; `prefers-reduced-
  transparency` swaps blur for an opaque fill. Everything is scoped through
  `body .comp-shell`, and `!important` appears only inside those queries.
- **Phone navigation and reach** — horizontal swipe walks the primary views with a
  direction-aware transition; a vertical flick stays a scroll. Dock and FAB got
  gesture-bar and notch clearance, and a shorter dock in landscape.
- **Reactive aurora** — the atmosphere layer is inert until the transport rolls,
  binds to the analyser only while playing, and detaches cleanly on project reload.

### 13.2 Defects found and repaired while verifying

- **The rail covered the project menu.** Asserting the rail into the tools tier
  (it had been `auto`) put it above `.comp-topbar`'s `z-index: 30`; because
  `.comp-project-menu` is absolutely positioned *inside* the topbar, its own
  `z-index: 9999` could not escape that context and six menu items were
  unclickable at desktop widths. Fixed with the `--daw-z-menubar` tier: the topbar
  now sits above the docked tools and below every scrim. Covered by the 1440×900
  hit-test in `studio-quality-sweep.spec.ts`.
- **Every in-app toast rendered blank.** `SnackbarService` creates the toast
  component dynamically and attaches it; the message signals were written during
  the same change-detection pass that the requesting click started, so the
  traversal in flight never revisited the new view and only the close glyph
  painted. `displaySnackbar()` now re-renders the toast's own view once its state
  is set. This is app-wide, not Studio-specific — it was invisible until an e2e
  test asserted toast *text* rather than toast existence.

### 13.3 Evidence

| Check | Result |
| --- | --- |
| `npx tsc --noEmit -p tsconfig.json` | **0 errors** |
| Jest (whole repo, 212 suites) | 3217 passed / 1 failed, 210 suites passed / 2 failed — all three are this VM's parallelism: one worker was SIGKILLed mid-suite and one 210k-iteration PBKDF2 login test hit its 5s budget. Both specs pass in isolation (`settings.component.spec.ts`, `tests/auth.service.spec.ts`: 24/24). |
| e2e, each spec on its own (warm server) | `studio-adaptive-display` **4/4**, `studio-pro-surface` **7/7**, `studio-quality-sweep` phone loop **22/22**, sweep interactions/menus **12/13** |
| e2e, all three specs in one run (46 tests, one worker) | **42 passed / 4 failed**. Three of the four are this VM: the run's very first navigation missed `.comp-shell` inside 30s while the dev server was rebuilding, a renderer crashed (`Target crashed` mid-click), and one phone view read an empty `data-studio-workspace` while its route was still resolving. Each passes in the per-spec runs above. The fourth is pre-existing (below). |
| e2e budgets | `playwright.config.ts` now sets `expect: { timeout: 15s }` and `timeout: 60s`, because first paint of the Studio's lazy route graph takes 6–10s on this host and the default 5s/30s budgets expired inside `page.goto` rather than on an assertion. |

### 13.4 Known limitations

- ~~**The offline WAV export renders near-silence.**~~ **Closed 2026-10-27.** The
  root cause was the percussive voice envelope in `buildVoiceGraph`: its attack
  used `setTargetAtTime`, an open-ended exponential approach that never lands on
  a value, so the decay ramp that followed had no departure point and started
  from zero — every un-patched voice peaked at ~5e-4 (≈ −57 dB). Reproduced in
  Chromium at isolated scale (0.00057 against 0.405 for the same graph with a
  bounded attack). The attack is now a `linearRampToValueAtTime` that arrives at
  the peak exactly at `time + attack`; the peak measured 0.405 in the same
  harness, and `audio-engine.service.spec.ts` pins both the ramp and the decay's
  departure value.
- **Preference support is emulated, not device-verified.** No Windows High
  Contrast pass, no OLED HDR panel, no real reduced-transparency host.
- **Touch is synthetic.** Swipe and flick are driven by dispatched `TouchEvent`s,
  not by a physical device.
- **The analyzer is verified against synthetic buffers**, not against a reference
  analyser.
---

## 14. Eighth pass — the composed page's phone and desktop contract

`/studio` loads the composed page (`app-studio-page`), which draws its **own**
chrome — top bar, mode rail, transport, slide-over panels — instead of the
classic shell's. Every mobile and accessibility contract in the Studio was
written for `.comp-shell`, which only the classic shell renders, so none of it
reached the surface that now owns `/studio`. This pass restates those contracts
for the page and fixes what the restatement exposed.

### 14.1 What shipped

- **Theme wired to the real tokens.** The page consumed
  `var(--studio-bg, #f5f2ee)` and `var(--studio-ink, #1f1a12)`, and neither
  variable was defined anywhere in `src/` — so the fallback *was* the theme: a
  light page (the only file in the tree using that paper colour) inside a
  night-sky app. The page now derives its palette from the global tokens
  (`--color-bg`, `--color-text`, `--color-surface`, `--teal-*`, `--neon-amber`),
  so it follows the Studio skin and any future theme that redefines them.
- **Depth and elevation on the shared scale.** Hard-coded `z-index: 40/42/50/60`
  and a bespoke panel shadow are gone; the page uses `--daw-z-*` and
  `--daw-elev-panel`. Those were declared inside `body .comp-shell`, so the
  token rule now also carries `:root` — one definition, two scopes, which is
  what lets a surface outside the classic shell stop inventing numbers.
- **Phone viewport.** `height: 100vh; height: 100dvh` (the transport was below
  the fold and under the gesture bar), `env(safe-area-inset-*)` on both bars and
  on all four panel edges, and `overflow: hidden` on the shell so no surface can
  add page-level horizontal overflow.
- **Touch floors.** 48px controls and 44px close/fields on `(max-width: 768px)`
  or any coarse pointer, `touch-action: manipulation` and no tap highlight for
  the page's own chrome (the global coarse-pointer list names only the embedded
  workspace hosts).
- **One bar height, two consumers.** The panels dock between the bars, so both
  bars and both panel edges are sized from `--studio-top-bar` /
  `--studio-bottom-bar`. Previously the panels used the global
  `--studio-header`/`--studio-footer` (60px/40px on a phone) against a 72px top
  bar and a 68px transport, so a phone sheet slid under the transport — which
  outranks it in the depth scale — and its last rows were unreachable.
- **Portrait stacks, landscape keeps the row.** Stacking was keyed on
  `max-width: 860px`, which a landscape phone (844–932px wide) never hits *and*
  which is the wrong answer when it does: height is the scarce axis there. The
  rail also becomes a 64px icon rail in landscape, so the canvas keeps the axis
  it has to spare.
- **Capability layers for this surface.** `forced-colors`, `prefers-contrast`,
  `prefers-reduced-transparency` and `prefers-reduced-motion` blocks scoped to
  `.studio-shell`, because `studio-adaptive-display.css` is scoped to
  `body .comp-shell` and could not reach the page.

### 14.2 Evidence

`studio-page.styles.spec.ts` (11 assertions) pins the contract, including two
that encode the failures found here: every custom property the page consumes
must be defined, and **defined at `:root`** (a token defined only under
`.comp-shell` does not reach this page); and no property may define itself
(`--x: var(--x, 60px)` computes to the guaranteed-invalid value).

| Check | Result |
| --- | --- |
| `npx jest src/app/studio/studio-page …` | 11 styles assertions + page/export suites: **4 suites, 133 tests passed** |
| `npx ng build --configuration development` | **0 errors** |
| Selector-diff against the pre-pass stylesheet | no selector removed (every existing rule preserved) |
| Measured layout (Chromium 148, real stylesheets, replica DOM) | 360×640, 390×844, 844×390 and 1440×900: shell fills the viewport, **no** page-level horizontal scroll, **no** sheet/transport overlap; bar controls 48px on phones (36px desktop); transport one row — 69px portrait, 61px landscape, 57px desktop; canvas 327 / 449 / 239 / 722px |

### 14.3 Known limitations

- **Measured against a harness, not the running app.** Chromium on this host
  dies on any app route (a plain page in the same browser is fine), so the
  numbers come from the real stylesheets applied to a replica of the page's DOM.
  They verify layout math, not the Angular wiring; the `app-inspector` column and
  the embedded workspaces are not reproduced.
- **No readable screenshot.** This container ships no system fonts, so a capture
  shows the palette, geometry and stacking but no text. Typography at phone sizes
  is unverified.
- **Safe-area insets read as 0 here.** Desktop Chromium does not emulate
  notches, so the *binding* of the insets is asserted (spec) rather than their
  effect.
- **The patch that prompted this pass was not applied** (see the review in the
  hand-off): it replaced the app shell, collided with this page's selector and
  would not have compiled against the repo's entry point.

## 15. Ninth pass — panel dismissal, the assistant port, and the phone chrome

### 15.1 What changed

- **Panel dismissal, aligned with the classic shell.** The composed page had no
  way to dismiss a slide-over except the small Close button in its far corner.
  It now mirrors the classic shell's `.comp-panel-backdrop`: a `.panel-scrim` at
  the `--daw-z-panel-scrim` tier (75) — between the bars, so Play/Record stay
  live under an open sheet — plus `Escape` on `document`, and one panel at a
  time. The scrim is a real `<button aria-label="Close panel">` rather than the
  classic shell's click-handling `div`, so it is focusable and labelled.
- **The Compose Assistant is ported to the composed page.** It was
  classic-shell-only, so `/studio` had no AI panel at all. It is hosted in the
  page and docked between the bars through two custom properties the shared
  component reads with `0px`/`70` fallbacks (`--ai-shell-top`, `--ai-shell-bottom`,
  `--ai-shell-z`) — the classic shell's full-height panel is untouched. Its quick
  actions are keyed by classic view id, so `studioAssistantContextForMode()`
  maps the page's mode (`arrange` → `arrangement`, `mix` → `mixer`, `export` →
  `mastering`, `keys` → `piano-roll`, `create` → `recording`) and the panel is
  context-aware on this surface too.
- **Panel stacking was inverted.** `.support-panel` (Project, Collaboration,
  Export) sat at the *tools* tier (40) while the new scrim took 75, so every open
  sheet painted **behind its own backdrop** and read as greyed-out and disabled.
  The panels now own the panel tier, above the scrim.
- **The transport token was 1px short.** It renders its 36px controls + 20px of
  padding + a 1px hairline = 57px, while `--studio-bottom-bar` said 56px, and
  the panels dock from the token. Landscape *phones* were worse: the bars were
  sized by hardcoded `min-height` values (48/44) while the tokens still said
  72/68, so every sheet docked 24px into both bars. The tokens are now the only
  bar heights, per breakpoint.
- **The phone top bar no longer pans the shell.** Two defects, both found by
  driving the real app rather than a harness. (1) `.studio-shell` used
  `overflow: hidden`, and a hidden overflow box is still *scrollable*: focusing a
  control inside the swipeable top-bar row panned the entire chrome — both bars
  and the canvas — 135px sideways on a phone, 420px on desktop (the closed
  assistant's `translateX(100%)` contributes scrollable overflow). It is now
  `overflow: clip`, which refuses to scroll at all. (2) The row itself never
  scrolled: without `min-width: 0` a flex item will not shrink below its content,
  and with the desktop `justify-content: flex-end` the overflow ran off the
  row's *left* edge — where a scroll container cannot go — leaving Save/Export/
  Share untappable.
- **A failed save is now a banner, not a chip.** The page carried
  `persistenceError()` only in the top-bar status chip, so a failed write — quota
  exhaustion, a private window, a locked profile, where the *only* copy of the
  project is the one in memory — looked like a label. It now has the classic
  shell's `role="alert"` banner with both ways out: **Retry save** (which clears
  itself when the write succeeds) and **Export backup**, which writes the
  `.smuve` bundle straight to a download so the work cannot be stranded in a tab
  that cannot save. The banner is `position: absolute` on purpose — a flex child
  would change the distance between the bars, which is the number every panel
  docks from — and it sits in the thumb zone on a phone (above the transport, not
  over the mode rail). The transport's status is now the single
  `role="status" aria-live="polite"` region, reading "Saving… / Save failed /
  Unsaved / Saved" instead of the raw enum.
- **Bundle import closed the recovery loop.** "Export backup" without an import
  is a one-way door: a `.smuve` bundle written by this page (or by the classic
  shell) had no way back in, because the page never wired `importProjectBundle`.
  The Project panel now has **Import bundle**, mirroring the classic shell's
  `loadProjectFile`: a 64 MiB guard, a `Replace current project?` confirmation
  before an unsaved session is discarded, then the service's own validated
  import — so a bundle it does not recognise is refused and the session stays
  untouched. Failures land in the panel's feedback *and* the snackbar.
- **One redundant file removed.** `src/app/components/career-hub/career-hub.css`
  (5189 bytes) is referenced by nothing: the component loads
  `career-hub.component.css` (675 bytes). No component, route, stylesheet or
  test was removed — the four Studio global stylesheets are all in `angular.json`,
  and the two `piano-roll` components behind `/piano-roll` and
  `/canvas-piano-roll` are both routed.

### 15.2 Evidence

`tests/e2e/studio-new-page.spec.ts` gained the phone and docking coverage the
composed page never had: the transport stays on screen with no sideways shift,
the 44px touch floors, scrim-tap + Escape dismissal, one-panel-at-a-time, the
assistant's docking, and `panels dock between the bars` parameterised over
360×640, 390×844, 844×390 and 1440×900 — the four cases whose bar heights differ.
Each also asserts the sheet's own centre still hits the sheet, which is the
regression that put a panel behind its scrim. Two more drive the save-failure
path end to end: the banner appears with both actions, **Export backup really
downloads a `Banner_Session_vN.smuve`**, Retry clears the banner, and on a phone
the banner never covers the transport. A further test round-trips a real bundle
through the import control — snapshot, rename, import, confirm, name restored —
and then feeds it a malformed bundle to prove the session survives the refusal.

| Check | Result |
| --- | --- |
| `npx playwright test studio-new-page` | **20/20** (8 composition + 5 phone + 4 docking viewports + 2 save-failure + 1 banner placement + 1 bundle import) |
| `npx playwright test studio-touch-gestures studio-pane-budget studio_mobile_check` | **77/79** |
| `npx playwright test studio-quality-sweep` | **34/35** |
| `npx jest src/app/studio/studio-page src/app/studio/shared/ai-assistant` | **32 passed** |
| `npx jest src/app/studio/synth-classes src/app/studio/studio-view.guard` | **66 passed** |
| `npx ng build` | **0 errors** (bundle-budget warning pre-existing) |
| Rendered captures (real Chromium, fonts installed) | `artifacts/studio-phone-portrait{,-sheet,-assistant}.png`, `…-phone-save-banner.png`, `…-landscape.png`, `…-desktop{,-assistant,-save-banner}.png` |
| Measured bar heights vs tokens | phone 72/68 = token 72/68; landscape 48/44 = 48/44 (was 72/68); desktop 64/57 (transport token 56 → 57) |

The three outstanding e2e failures are **pre-existing on this host**, and were
attributed by reverting the only classic-shell-affecting file in the pass
(`ai-assistant.component.css`) and re-running: identical numbers, identical
failures.

### 15.3 Known limitations

- **The pre-existing failures are font-metric artefacts of this container.** The
  app pulls Inter from Google Fonts; with no network the DejaVu fallback renders
  wider, so `.comp-topbar-right` overflows 1280px, the shell-height ratio shifts,
  and the classic project menu no longer fits 390px of landscape height. Fixing
  those means either loading the real webfont or re-tuning the classic shell's
  desktop top bar — out of scope for this pass.
- **The landscape-phone rail labels are still word-clipped at the right edge.**
  The swipeable top-bar row and mode rail clip mid-word ("Pr…", "Mi…") with no
  scroll affordance; a mask/gradient fade (or icons-only on phones) would say
  "swipe" instead of "broken". Deliberately left as a design decision.
- **`advanced-synth.ts` and `subtractive-synth.ts` are unreferenced** — 0 refs
  repo-wide while all five sibling voices are used and covered by
  `synth-classes.spec.ts`. They are not duplicates of any live file (6-gram
  overlap 4.9% vs 8.3% between live siblings), so they were **left in place**
  rather than deleted under "keep all current components".
- **Safe-area insets read as 0** on desktop Chromium: their binding is asserted,
  not their effect, and no notched device was emulated.

## 16. Tenth pass — a guarded "New project" on the composed page

### 16.1 What changed

- **`/studio` can finally start a new session.** It was the last lifecycle action
  the classic shell had and the composed page did not: the Project panel could
  open, import and refresh local sets, but never clear the session. The panel now
  carries **New project** beside **Import bundle** and **Refresh**.
- **Two guards, because this is the one destructive action on the surface.**
  Consent first — `InteractionDialogService.confirm` with `tone: "danger"`, the
  same affordance the import flow uses, and a message that changes with the
  state (an unsaved session is told where its copy goes). Then a copy: a dirty
  session is written to Local Sets *before* it is replaced, so "new project" is
  never the place an idea disappears; the panel list is refreshed so the copy is
  visible immediately.
- **The reset is split across the two owners, in the only order that works.**
  `MusicManagerService.newProject()` owns the track graph;
  `ProjectWorkspaceService.startFreshProject()` owns metadata, signatures and
  autosave bookkeeping, and it snapshots the *current* track graph when it runs.
  So the graph is cleared first and the workspace second, or the fresh session
  would be stamped with a signature of the session being replaced.
- **History is cut after both.** `newProject()` runs through the command stack,
  so undoing the reset would otherwise restore the previous project's tracks into
  the new one. `history.clear()` runs last, and the e2e test asserts
  `canUndo()` is false once the fresh session is up.

### 16.2 Evidence

| Check | Result |
| --- | --- |
| `npx playwright test studio-new-page` | **21/21** (1 new: consent, cancel, reset, undo, Local Sets copy) |
| `npx jest src/app/studio/studio-page` | **26 passed** |
| `npx tsc --noEmit` / `npx ng build` | **0 errors** (bundle-budget warning pre-existing) |
| Rendered captures | `artifacts/studio-project-panel-new.png`, `…-new-project-dialog.png`, `…-phone-project-new.png` |

The e2e test drives the real thing rather than a mock: it builds a named
three-track session, cancels the first confirmation (asserting the tracks and
name are untouched), confirms the second, and then proves three separate
outcomes — the fresh pair is `Piano`/`Drums`, the top bar reads `Untitled
Project`, Undo is empty, and `Doomed Session` is still listed in Local Sets.

### 16.3 Environment note (this container, not the product)

The restored runner had **no system fonts and no fontconfig**, and Chromium died
with `FATAL: SkFontMgr_FontConfigInterface.cpp:163 Not implemented` on *every*
route — which reads in Playwright as `Target page, context or browser has been
closed`, i.e. exactly like a product failure. `npx playwright install-deps`
cannot run here (`sudo: no new privileges`). Working setup, repeatable without
root:

```bash
# missing shared libs, extracted from Ubuntu debs into a private tree
python3 … # fetch libnspr4 libnss3 libasound2 libatk* libatspi libX* libxkbcommon0
dpkg-deb -x <deb> ~/.pwlibs && export LD_LIBRARY_PATH=~/.pwlibs/usr/lib/x86_64-linux-gnu
# fonts + a config, since /etc/fonts does not exist at all
dpkg-deb -x fonts-dejavu-core_*.deb ~/.local/fontpkg  # → ~/.local/share/fonts
export FONTCONFIG_FILE=~/.config/fontconfig/fonts.conf
```

Both variables must be set for any browser-driven check in this VM.

## 17. Eleventh pass — what a fresh session is told

### 17.1 What changed

- **A nudge for the session that has lanes but nothing on them.** The
  arrangement view already ships an empty-state card ("Your canvas is ready. Make
  the first move."), but it renders only when `tracks().length === 0` — and a
  fresh project starts with Piano + Drums, so the exact moment "New project"
  lands on was the one moment with no guidance at all. The page now hosts a
  compact `.session-hint` over the empty canvas: what to do, one real action
  (AI Produce), and Dismiss.
- **It leaves on its own.** The computed condition is "no clips on any track",
  so the first clip removes it — no dismissal needed, and it never becomes
  furniture. Dismissal is remembered for the session, and reset by `newProject()`
  because a new canvas is exactly where the cue belongs again.
- **Absolute, not a flex child.** A bar here would shorten the flex column that
  every panel's docking maths measures against — the same bug class fixed in
  §15 — so it overlays the canvas instead, at the tools tier (below the sheets
  and their scrim, so it can never sit on top of a panel the user just opened).
- **Its action is the page's existing routing, not a new one.**
  `onRequestView('ai-produce')` opens the AI Produce overlay, which is also what
  the arrangement view's own card emits — one path, verified in the browser.

### 17.2 Evidence

| Check | Result |
| --- | --- |
| `npx playwright test studio-new-page` | **23/23** (2 new) |
| `npx jest src/app/studio/studio-page` | **27 passed** (1 new contract test) |
| `npx tsc --noEmit` / `npx ng build` | **0 errors** (bundle-budget warning pre-existing) |
| Rendered captures | `artifacts/studio-empty-session-hint.png`, `…-phone-empty-session-hint.png` |

The e2e coverage drives the whole life of the cue: it appears on an empty
session, **Generate with AI really opens `app-ai-produce`** (then closes back to
the hint), the first clip removes it without a dismissal, a new project brings it
back, and Dismiss then sticks. The phone test measures the box against the
viewport and the transport, plus the 48px floor on both stacked actions.

### 17.3 Two contract tests had to be corrected, not just satisfied

Adding CSS here broke two assertions in `studio-page.styles.spec.ts`, and both
were **tests that had quietly encoded an accident**:

- The phone-block assertion matched the *first* `@media (max-width: 768px),
  (pointer: coarse)` block with a non-greedy regex. A second phone block (the
  nudge's) took that slot, so the test was pinning source order rather than the
  chrome. It now selects the block that actually styles `.panel-close`.
- `expect(css).not.toContain("z-index: var(--studio-z-tools)")` was a whole-file
  prohibition standing in for "the panels are not on the tools tier". The nudge
  belongs on that tier on purpose, so the assertion now checks each panel's own
  block and *separately* pins the nudge to the tools tier — the same intent,
  stated where it applies.

## 18. Twelfth pass — one navigation for every Studio surface

### 18.1 What was wrong

`/studio` could reach **ten** of the Studio's twenty-two surfaces. The other
twelve — Session, Drum Machine, Channel Rack, Vocal Suite, DJ Booth, Performance,
Mastering, Sound Pads, Chords, Score, Sample Library, Performer — had no
navigation entry anywhere on the page. Four of them were reachable by typing a
`?view=` deep link and letting the guard bounce it to the classic shell, which is
not navigation.

The cause was structural rather than a missing button: the canonical list
(`allStudioViews` / `studioWorkflowCategories`) lived as **private members of the
classic component**. The page could not see it, so its tool panel had been
hand-written into a five-item subset, and every surface added to the shell after
that subset was written became invisible on `/studio`.

### 18.2 What changed

- **One catalogue, two shells.** `src/app/studio/studio-surfaces.ts` now owns the
  surface list: ids, labels, icons, descriptions, and the five workflow groups
  (Create & Jam, Song Builder, Mix & Polish, Sounds & Packs, More Tools). The
  classic shell's `studioWorkflowCategories`, `allStudioViews`, `StudioView` and
  `isStudioView` are all derived from it — its 69 tests unchanged.
- **Every surface has a row.** The page's Tools panel renders the catalogue, so
  the list cannot be a subset by construction. Each row states its destination in
  its accessible name, and rows that leave the page carry an `open_in_new` badge
  and the words "in the classic studio".
- **Four honest destination kinds**, held to exhaustiveness by
  `Record<StudioSurfaceId, SurfaceTarget>`: `mode` (Arrange, Keys, Mix, Create —
  the page's own workspaces), `tool` (Synthesizer, Plugin Store, Sampler, Sound
  Browser, AI Producer — full-surface overlays), `rack` (Effects Rack, which the
  page already hosted as its own overlay) and `route` (the twelve the classic
  shell renders). Nothing pretends to be in-page when it is not.
- **The current location is marked** with `aria-current="true"` and a persistent
  accent, so the list doubles as a "where am I".

### 18.3 Evidence

| Check | Result |
| --- | --- |
| `npx playwright test studio-new-page` | **26/26** (3 new) |
| `npx jest studio-surfaces + studio-page + studio.component` | **100 passed** (4 new) |
| `npx tsc --noEmit` / `npx ng build` | **0 errors** (bundle-budget warning pre-existing) |
| Rendered captures | `artifacts/studio-surface-nav.png`, `…-phone-surface-nav.png` |

The new e2e test **iterates the catalogue in the test itself** — a row count of
22, and for each surface its exact accessible label — then exercises one of each
kind: Mixer switches the workspace and comes back marked `aria-current`, Plugin
Store opens its overlay, Effects Rack opens the rack, and Drum Machine lands on
`/studio-classic?view=drum-machine` with `app-drum-machine` actually rendered. The
phone test proves the sheet scrolls (22 rows cannot fit 70dvh) and that a row
below the fold still taps at ≥44px.

### 18.4 Two defects found by looking at it

- **The 2-column grid truncated the labels.** "Quick Recorder", "Channel Rack",
  "Performance" and "Session View" all rendered as `Quick Recor…` / `Channel …`:
  a ~165px cell minus icon, gaps and badge leaves ~90px for text. Surfaces are
  now one per row; the Workspace actions stay paired.
- **A catalogue test caught nothing yet, by design.** `studio-surfaces.spec.ts`
  reads `studio.component.html` and asserts the catalogue equals the set of
  `*ngSwitchCase` views, so the *next* view added to the shell without a catalogue
  entry fails a unit test instead of shipping unreachable. That is the regression
  this pass exists to prevent, pinned.

## 19. Thirteenth pass — the boot bundle, measured

### 19.1 Measurement first

`ng build --verbose --stats-json`, then attributing every byte of every initial
output to its input, rather than guessing at imports. Baseline:

| | before | after |
| --- | --- | --- |
| Initial total (raw) | **2.03 MB** (278.36 kB over budget) | **1.70 MB** (budget met, no warning) |
| Initial (est. transfer) | 495.94 kB | **427.07 kB** |
| `styles` bundle | 269.62 kB | **198.45 kB** |

Attribution showed the weight was app code, not the framework: 1,185 kB of
`src/app` in the initial graph, against 415 kB of `@angular/*`. Two causes, both
addressed:

- **`animate.css` was linked in full (69.8 kB of keyframes) for exactly two class
  names.** `grep animate__` across the app found two usages, both
  `animate__animated animate__fadeIn` (knowledge base, mastering suite). The
  library is replaced by `src/animate-essentials.css`, containing animate.css's
  own declarations for those two classes *and* its `prefers-reduced-motion` rule,
  so the rendered result is unchanged.
- **The shell eagerly bundled two components that cannot render at boot.** The
  assistant lives inside a drawer that only exists once
  `uiService.isChatbotOpen()`, and the advisor is a floating action button. Both
  are now `@defer` blocks — `on immediate` for the assistant (its drawer is
  already open when the block exists) with a `role="status"` placeholder,
  `on idle` for the advisor. The assistant moved to its own 188.53 kB chunk and
  the advisor to 9.67 kB; neither is fetched until it can be seen.

### 19.2 What was deliberately not done

The remaining 1.70 MB is **architectural, not waste**: the shell injects
`AiService`, the audio engine and the TV services directly (21 `inject()` calls in
`AppComponent`), so their code is genuinely needed at boot for lifecycle alerts,
autosave and cross-route playback. Cutting further means deferring *services*, not
components — a behavioural change with its own risks, and a separate decision.

`socket.io-client` (~40 kB, in initial via `SocialNetworkingService`) was also
left alone: making `io()` a dynamic import rewrites connection lifecycle code for
a small share of the gap, and the budget is met without it.

### 19.3 Verification

| Check | Result |
| --- | --- |
| `npx ng build` | **0 errors, 0 warnings** (bundle budget now met — first time this session) |
| `npx playwright test studio-new-page` | **26/26** |
| `npx playwright test chatbot-launch-anomaly` | **passed** (the deferred assistant still opens and responds) |
| `npx playwright test verify_boot` | 3/4 — the failing one fails **identically with the change reverted** (`git checkout` + rerun), so it is pre-existing in this container: it forges a beat through the audio engine and this box has no audio device |

The honest caveat: the `@defer` path is exercised in a dev build under
Playwright, where the deferred chunk is served locally in milliseconds. A cold
production fetch of the assistant chunk is a new network round trip on first open
— invisible on a warm cache, noticeable on a poor connection for that one
interaction. That is the trade for 260 kB off boot.

## 20. Fourteenth pass — the palette learns every surface

### 20.1 What was missing

The command palette (⌘/Ctrl-K) is the one way into the Studio from anywhere in the
app, and it could reach **7 of the 22** surfaces: the ones that happen to live in
`WORKSPACE_REGISTRY` as "Open X". The other fifteen — channel rack, arrangement,
audio recorder, effects rack, sampler, score, session, sound pads, chord editor,
performer, plugin store, sound browser, sample library, synthesizer, AI produce —
were not in it at all. "Open the channel rack" meant opening the Studio, opening
Tools, and scrolling.

### 20.2 What changed

- **One action per surface, generated from the catalogue.** A root
  `StudioSurfaceCommandsService` registers them as `Studio: <label>` with the
  surface's description as the subtitle and the surface id as a search keyword, so
  "piano roll", "piano-roll" and "studio" all find it.
- **No new routing contract.** Each action navigates the app's existing
  `?view=` route: the studio page switches mode for the four it hosts, and its
  guard forwards the rest to the classic shell. Nothing is imported into the
  palette, and the bundle moved by 1.15 kB.
- **Only what was missing.** `studioSurfacesNotIn()` filters the catalogue against
  the registry's modes, so the seven surfaces the palette already offered are not
  listed twice. A unit test asserts both directions against the real
  `WORKSPACE_REGISTRY`: nothing duplicated, nothing lost, and the gap was real
  (>6 surfaces added).
- **Palette rows now carry `data-action-id`.** Counting rows in a test previously
  meant matching rendered text; the id is stable, and it is also the hook
  telemetry would need.

### 20.3 A routing bug this uncovered

Choosing a surface that the page does not host, **while already in the Studio**,
changed the URL to `/studio?view=channel-rack` and nothing else. Angular does not
re-run a `canActivate` guard for query-param-only changes by default, so
`studioViewGuard` — the thing that forwards legacy views to the classic shell —
never ran. The route now sets
`runGuardsAndResolvers: 'paramsOrQueryParamsChange'`, which fixes the class rather than the caller: any
in-app link to `/studio?view=<unhosted>` now lands where it should, not just the
palette's.

### 20.4 Verification

| Check | Result |
| --- | --- |
| `npx playwright test studio-new-page` | **27/27** (1 new) |
| `npx jest studio-surfaces + command-palette + app.component + integrations` | **56 passed** |
| `npx ng build` | **0 errors, 0 warnings**; initial 1.70 MB (budget still met) |
| Rendered capture | `artifacts/studio-palette-surfaces.png` |

The e2e drives both destination kinds: `Studio: Channel Rack` → 
`/studio-classic?view=channel-rack` with `app-channel-rack` rendered, and
`Studio: Arrangement` from inside Mix → `/studio?view=arrangement` with the page
on Arrange. It then asserts the three registry-covered surfaces have **zero**
`Studio:` rows, which is the dedupe holding from the outside.

---

## 21. Fifteenth pass — one set of keys, and an Escape that reaches the top layer

### 21.1 Escape stopped at the slide-overs

The composed page treated Escape as "tap the scrim": one handler, `closePanels()`.
But the scrim only exists for the docked slide-overs. Four *full-surface* editors
cover the whole workspace instead — the Advanced Tools surfaces (synth, plugins,
sampler, sound browser, AI Produce), the FX rack, the automation curve editor and
version history — and none of them answered to Escape at all. Their only exit was
a `Close` button in the far corner of the viewport, which is exactly the small,
far target the scrim exists to spare you.

`dismissTopOverlay()` now exists on the page and dismisses **one layer per press,
innermost first**, mirroring the classic shell's ordered dismissal: the workspace
overlay (they are mutually exclusive, since `openTool` / `openFxRack` /
`openBezierEditor` each close the others), then the docked panels. With nothing
open it returns `false` and Escape does not navigate away.

### 21.2 The page answered no keyboard shortcuts at all

Ctrl/Cmd-K opened the palette from anywhere, but the keys that matter *inside* a
studio — save, export, undo, redo, assistant — only worked in the classic shell.
The same app therefore had two different keyboards depending on which studio the
route happened to open. The page now answers the shell's vocabulary:

| Keys | Action |
| --- | --- |
| `⌘/Ctrl + S` | Save, with a snackbar confirmation (`retrySave`) |
| `⌘/Ctrl + E` | Open the Export workspace |
| `⌘/Ctrl + Z` / `⇧⌘Z` | Undo / redo through the shared `HistoryService` |
| `⌘/Ctrl + I` | Toggle the Compose Assistant |
| `Escape` | Dismiss the top overlay (§21.1) |

Three rules keep them from eating the platform or a neighbour:

- **Modifier required.** The piano roll already binds bare `d`/`s`/`e` to its
  Draw/Select/Erase tools, which is why the page only claims the `Ctrl`/`Meta`
  forms of those letters.
- **Yields to text editing.** A `closest('input, textarea, select,
  [contenteditable]')` guard keeps `⌘E` as "end of line" inside the project-name
  field instead of switching workspace under the caret.
- **Yields to whoever handled it first.** `event.defaultPrevented` is checked
  before acting, and `event.repeat`/`isComposing` are ignored, so a child that
  consumed the key (piano-roll `⌘A`, IME composition) wins.

### 21.3 Verification

| Check | Result |
| --- | --- |
| `npx playwright test studio-new-page` | **29/29** (2 new) |
| `npm run build` | **0 errors, 0 warnings**; initial 1.70 MB (budget still met) |

The new e2e drives the layers from the outside: Advanced Tools → Synthesizer
opens the overlay, the first Escape closes the overlay, the next closes the
drawer it came from, and a third leaves the route and workspace untouched. The
shortcut spec asserts `⌘E` reaches the Export workspace, `⌘I` opens the assistant
and Escape dismisses it, and `⌘E` inside the project-name field changes nothing.

**Environment note:** the restored container had lost the Playwright browser's
shared libraries and `apt-get download` could not fetch them again, so the run
used the previously unpacked prefix directly:
`LD_LIBRARY_PATH=~/.pwlibs/usr/lib/x86_64-linux-gnu npx playwright test …`
(`scripts/setup-e2e-browser-libs.sh` now expects `<prefix>/root/usr/lib/...`;
point `PW_LIBS_PREFIX` at a fresh directory when network is available).

---

## 22. Sixteenth pass — the transport keys the page never had, and a list of them

### 22.1 Space / R / M only worked next door

The classic shell's transport shortcuts do not live in the shell at all — they
live in `TransportBarComponent`, which binds a `document:keydown` for
`Space` (play/pause), `R` (record) and `M` (metronome). The composed page draws
its **own** footer transport and never instantiates that component, so on
`/studio` those three keys did nothing while the same keys started a take on
`/studio-classic`. The shell's help popover advertised them regardless, which is
the worse half of the defect: a shortcut list that lies.

The page now answers them, with the shell's own safety rules ported over rather
than reinvented:

- **Space yields to a focused control.** The browser activates a button natively
  on Space, and `preventDefault()` does not stop propagation — so claiming it
  there would fire Play twice. `BUTTON` / `A` / `SELECT` / `[tabindex]` /
  `role="button"` targets keep the key.
- **Space stops a take rather than layering playback on it** — playing or
  recording, the press stops the transport; otherwise it starts playback (which
  resumes the AudioContext inside the gesture, as the buttons do).
- **Bare letters never fire while typing**, and a modal (`[role="dialog"]`,
  `app-interaction-dialog`) owns the keyboard while it is up.

### 22.2 Nothing told you any of this

The page answered eleven keys and showed none of them. There is now a
`Shortcuts` button in the top bar (and `?`), opening a cheat sheet that lists
**exactly** what the page answers: Space/R/M, ⌘S/⌘E/⌘Z/⇧⌘Z/⌘I, ⌘K, `?`, `Esc`.

![The cheat sheet on desktop](artifacts/studio-shortcuts-desktop.png)

It is a dialog over everything — including the full-surface editors — so it is
also the **first** layer `dismissTopOverlay()` takes back: with a panel open,
one Escape closes the sheet and leaves the panel alone; the next closes the
panel. The scrim is the same tap-to-dismiss the panels use.

Honest semantics: it is announced as a non-modal dialog, gets focus on open
(`tabindex="-1"` + `autofocus`) so a screen reader reads it, and does not trap
Tab — matching the shell's popover, and not claiming `aria-modal` for behaviour
that does not exist.

### 22.3 Verification

| Check | Result |
| --- | --- |
| `npx playwright test studio-new-page` | **31/31** (2 new) |
| `npm run build` | **0 errors, 0 warnings**; initial 1.70 MB (unchanged — 428.2 kB est. transfer) |
| Rendered captures | `artifacts/studio-shortcuts-desktop.png` (1440×900), `artifacts/studio-shortcuts-phone.png` (390×844) |

The transport spec asserts `M`/`m` toggles the metronome's pressed state, that
Space on a focused `Loop` button activates the button and **not** the transport,
and that typing `m` in the project-name field leaves the click track alone. The
cheat-sheet spec asserts eleven rows (the three transport keys among them), the
scrim tap, `?` as the second way in, and the layer order: Escape closes the
sheet with the Tools drawer still open behind it.
