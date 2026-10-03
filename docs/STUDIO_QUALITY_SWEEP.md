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
| Studio-pattern unit suites (studio + engine/music-manager/project/export specs) | **882 tests / 59 suites passed** |
| `npm run build` (repo AGENTS.md submission gate) | pass, 26.3 s; `studio-component` lazy chunk 797 kB raw / 129 kB transfer |
| `tests/e2e/studio-quality-sweep.spec.ts` (managed preview) | **25/25 passed** |
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
