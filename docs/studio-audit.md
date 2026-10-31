# Studio professionalism audit

Date: 2026-10-31
Scope: every component under `src/app/studio` (44 view/component templates), plus the
audio engine and instrument services they drive.

## Method

1. **Template wiring sweep.** Parsed every Studio `*.component.html` for event bindings
   (`click`, `change`, `input`, `keydown.*`, `pointerdown`, `contextmenu`, `submit`,
   `blur`, `focus`) and resolved each bare handler call against its component class.
   Signal/computed reads inside expressions (`panelOpen()`, `showBpmDropdown()`) were
   excluded. Result: **no dead control** — every bound handler exists.
2. **Stub and placeholder sweep.** Searched all Studio TypeScript and templates for
   `TODO`, `FIXME`, `coming soon`, `not implemented`, `placeholder`, `stub`, `no-op`
   and `alert(`. Findings were reviewed individually; only real defects were changed.
3. **Behavioural review** of the transport, pads, recording path and audio engine, with
   the affected specs run before and after each change.

## Fixed in this pass

| Area | Defect | Fix |
| --- | --- | --- |
| Performance Pads | Pad labels named voices the presets do not contain ("CLAP", "CRASH", "LOOP 1/2"), and every pad auditioned the preset's default note, so "SNARE" played the kick. | Labels now name the real voices; each pad carries the MIDI note that voice lives on (trap kit 36/38/42/46, congas 60/64, tonal presets middle C). `InstrumentsService.audition()` gained an optional note and falls back to the nearest declared zone instead of silence. |
| Performance Pads | "ARMED" KPI counted loaded pads, not armed ones. | Renamed to **LOADED**. |
| Tempo | Changing BPM during playback updated the readout and echo but not the AudioWorklet tick clock — the beat only changed after a restart. | A signal effect now pushes `SET_TEMPO` to the worklet on every tempo write. |
| Tempo | Only integer BPM could be entered; out-of-range values silently did nothing and the field could disagree with the transport. | `AudioEngineService.setTempo()` clamps to 20–300 with one-decimal precision; the BPM dropdown has an exact-tempo field that echoes the committed value (tenths allowed). Nudge, presets and typed values share the same path. |
| Metronome | Clicks scheduled in the past (main-thread stall, or a re-timed beat) started late and produced a clipped double-click; the envelope opened with no attack. | Stale ticks are dropped, the rest are clamped to `currentTime`, and the click has a 2 ms attack and 60 ms decay. |
| Recording | The count-in picker only applied to Play — REC started instantly, so the artist's first bar competed with the click. | `AudioSessionService.toggleRecord(countInBars)` runs the engine count-in, waits for it (`waitForCountIn()`), then arms the take. Pressing Stop during the count-in aborts the pass cleanly (the engine resolves waiters on stop). |
| Dead code | `studio/effects/reverb.service.ts` was a placeholder class (empty `connect`/`disconnect`/`set`) injected nowhere; the real reverb is `ConvolutionReverbService`. | Removed the service and its spec. |

## Remaining known gaps (reported, not changed)

- **Chord editor drag-and-drop** uses a simplified index swap rather than
  `@angular/cdk/drag-drop`; reordering works, but there is no drag ghost, auto-scroll or
  keyboard reorder.
- **Time signature** is a display chip hard-coded to 4/4; the engine's step model and
  piano roll are 4/4-only by design.
- **Offline bounce** builds a simpler voice graph than the live engine
  (`OfflineBounceService.renderNote` vs `AudioEngineService`), so offline renders can
  differ in character from real-time playback even though levels and sample zones match.
- **Per-view visual QA** (phone/tablet layouts, touch targets) is not covered by these
  checks; the sweep above is wiring, dead-control and stub coverage, not a pixel review.

## Verification

- Focused Jest suites: instruments, audio engine (both specs), audio session, transport
  bar, piano roll, drum machine, quick session, music manager.
- Production build (`npm run build`) is the submission gate; see the commit message for
  the result of this pass.
