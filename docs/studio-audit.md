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
| Chord editor | The list advertised drag-to-arrange through `cdkDropList`/`cdkDrag` attributes that were never imported, so the drop event never fired and progressions could not be reordered at all; `dropChord` was a dead placeholder. | Native pointer reorder with a floating drag ghost, live index tracking, edge auto-scroll, primary-button/button-hit filtering and an Alt+Arrow keyboard path that keeps focus on the moved card. |
| Offline bounce | Synth notes were rendered by a private oscillator + fixed 5 ms envelope: the track's filter, ADSR, sub oscillator, LFO, glide and note pan were dropped, so an export did not match playback (`bounceTrack` also rendered clips against a hard-coded 4-beat bar). | `renderNote` calls the engine's shared `scheduleOfflineNote` voice builder with the track's own synth patch, and all bar/clip maths goes through the meter-aware bar length. |
| Meter | The time-signature chip was a static `"4/4"` string; the metronome always accented every 4th quarter and the position readout forced a 16-step bar. | The chip is a meter select (2/4–12/8) backed by `AudioEngineService.timeSignature`. Metronome accents, count-in length, bar:beat:subdivision readout and bounce bar lengths all follow the selected meter (16th-note sequencer grid unchanged). Meter automation adds a variable bar clock: each marker starts a new bar, and clip starts, lengths, fades, the arrangement playhead and offline export windows all retime through it. |

## Remaining notes

- **Sequencer grid.** The piano roll and step sequencer remain a 16th-note grid;
  the meter changes bar grouping, accents, count-in and readout, not the number
  of steps stored per pattern. A 3/4 pattern is 12 steps long at the default
  four-bar loop.
- **Meter persistence.** The chosen meter is saved in the set metadata
  (`metadata.timeSignature`) with every manual save, autosave and export, and is
  restored onto the engine when a set is opened. Sets saved before meters were
  stored open in 4/4.
- **Per-view visual QA** (phone/tablet layouts, touch targets) is not covered by
  these checks; the sweep above is wiring, dead-control and stub coverage, not a
  pixel review.
- **Auditioning** the pads, metronome and bounce needs an audio device; unit
  tests and the production build cover the automation, not what the speakers do.

## Verification

- Focused Jest suites: instruments, audio engine (both specs), audio session,
  transport bar, chord editor, offline bounce, piano roll, drum machine, quick
  session, music manager.
- Production build (`npm run build`) is the submission gate.
