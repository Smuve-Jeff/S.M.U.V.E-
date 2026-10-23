# Studio parity audit — every component vs. professional Play Store DAWs

*Audit date: 2026-10-23 · Method: read the shipped code and templates, then compare
against the current Android feature set of the apps a Play Store user will judge us
against. Every finding cites the file that produces the behaviour, so it can be
re-verified after a fix. This document is a gap map and a priced backlog, not a plan
of record — `docs/STUDIO_PARITY_RISK_AUDIT.md` remains the latency/CPU/memory
risk register and `docs/STUDIO_QUALITY_SWEEP.md` the UI sweep.*

## Baseline apps (verified October 2026)

| App | Android version evidence | Why it is the baseline |
|---|---|---|
| FL Studio Mobile | 5.0.2, 21 Oct 2026 ([release history](https://forum.image-line.com/viewtopic.php?t=260871)) | The default "real DAW on a phone": 8 instruments, 1 000+ sounds, 30+ effects, `.flp` export |
| Cubasis 3 | docs 3.8.x ([Steinberg](https://www.steinberg.help/r/cubasis/3.8/en/cubasis/topics/version_history_x.html)) | The pro multitrack reference: unlimited tracks, 8 inserts, DAWproject, Ableton Link |
| Audio Evolution Mobile | Play listing 8 Oct 2026 ([Play](https://play.google.com/store/apps/details?id=com.extreamsd.aemobile)) | The audio-engineering reference: USB audio, routing, punch-in, stems |
| n-Track Studio | Play listing 21 Sep 2026 ([Play](https://play.google.com/store/apps/details?id=com.ntrack.studio.demo)) | The best-value multitrack: background audio, group/aux channels, USB audio |
| BandLab | Play listing 23 Oct 2026 ([Play](https://play.google.com/store/apps/details?id=com.bandlab.bandlab)) | The social/cloud reference: free unlimited projects, community, distribution |
| Koala Sampler | Play listing 17 Oct 2026 ([Play](https://play.google.com/store/apps/details?id=com.elf.koalasampler)) | The sampling/chop reference: auto-chop, time-stretch, Ableton Link |
| Voloco | Play listing 13 Oct 2026 ([Play](https://play.google.com/store/apps/details?id=com.jazarimusic.voloco)) | The vocal reference: real-time tuning, 50+ vocal FX, fast export |
| Music Maker JAM | Play listing 13 Aug 2026 ([Play](https://play.google.com/store/apps/details?id=com.magix.android.mmjam)) | The beginner loop reference: 500 000+ loops, guided arrangement |

Ableton Note is **iOS-only** and is used here only as a workflow reference.

## Scorecard

Verdict scale: **Ahead** (we ship something the baseline apps do not), **At parity**,
**Behind** (a pro user would notice), **Blocking** (would stop a pro user adopting
us, or stop Play review from shipping us).

| # | Component | Verdict | The single most important gap | Effort |
|---|---|---|---|---|
| 1 | Shell / navigation / onboarding | At parity | No first-run project template tour; help is a shortcuts sheet | S |
| 2 | Transport bar | Behind | Fixed 4/4, one global tempo, no tempo/time-signature track, no note-repeat | M |
| 3 | Arrangement view | Behind | Timeline follows the song and clip fades now survive export; still no drawn-overlap crossfade, ripple editing or track freeze | M |
| 4 | Session view (clip launcher) | At parity | Follow-actions exist; no per-clip loop length or launch sync to external clock | S |
| 5 | Piano roll | At parity | No arpeggiator/note-repeat generator, no strum/randomise, no MIDI-file drop | M |
| 6 | Channel rack + step sequencer | At parity | No per-lane length presets beyond polymeter; no swing-per-lane UI | S |
| 7 | Drum machine | **Ahead** | Nothing structural; needs pattern library breadth | S |
| 8 | Mixer | Behind | Bus routing exists as an API but has no UI or signal path; sends are fixed A/B | M |
| 9 | Effects + plugin store | Behind | No third-party plugin hosting, no per-slot preset browser, no metering per insert | M |
| 10 | Instruments (synth/sampler/browser) | At parity | No patch search across instruments; no multi-timbral instrument instance | S |
| 11 | Audio recording + vocal suite | **Ahead** | No latency-calibration wizard surface; monitoring is device-dependent | S |
| 12 | Comping (take lane / vocal comp) | **Ahead** | Not discoverable outside the vocal flow | S |
| 13 | DJ deck | **Ahead** | No record-a-set export; no external MIDI-clock *input* | S |
| 14 | Mastering suite | Ahead | Reference A/B with loudness matching and one-tap delivery-target conform; no preset idempotence, no spectral delta, no FLAC | M |
| 15 | Performance mode / pads / performer | At parity | Pad MIDI learn is per-screen; no MIDI-map import/export | S |
| 16 | Automation | At parity | No automation for VCA/bus or FX-slot params outside the rack | S |
| 17 | Export / bounce / share | Behind | Stems, 24-bit and 48 kHz now ship; no FLAC, MP3 bitrate fixed, no project interchange, no export job | **L** |
| 18 | Project workspace / cloud | **Blocking** | Cloud sync is `MockCloudServer` in the shipping build | **L** |
| 19 | MIDI hardware + sync | **Blocking** | Web MIDI only; Android WebView has no `requestMIDIAccess` | M |
| 20 | Store/packaging (billing, background, signing) | **Blocking** | Billing is a shim, background playback stops, no release signing config | M |

Everything below expands one row at a time: what actually ships, what the baseline
apps do, and the concrete improvement with an effort estimate (S ≤ 1 day, M ≤ 1 week,
L > 1 week of focused work).

---

## 1. Shell, navigation and onboarding

**Ships**
- Ten-plus surfaces behind a persistent shell (`src/app/studio/studio.component.ts`),
  Android system-back unwinding one surface per press (`registerNativeBackButton`, `confirmDirtyExit`).
- Beginner mode (`beginner-wizard/`), a creation sheet with recent-memory
  (`shared/smart-creation-sheet/`), an AI assistant with personas and action chips
  (`shared/ai-assistant/`), a global shortcuts sheet (`toggleShortcuts`).
- Adaptive display and pane budgeting (`src/studio-adaptive-display.css`, `tests/e2e/studio-pane-budget.spec.ts`).

**Baseline**
- FL Mobile 5 added portrait mode and live UI scaling; Cubasis ships a project
  template picker and interactive help; BandLab onboards with a genre pick instead of a manual.

**Gaps**
- There is no "start from a template" path that creates tracks, instruments and a
  loop in one tap. `SmartCreationSheet` opens *tools*, not a finished 8-bar idea.
- Help is a keyboard-shortcut overlay, not task help ("how do I comp a vocal?").
- Beginner mode is a toggle, not a progressive disclosure of advanced controls;
  the same dense panels remain mounted.

**Improvements**
- **S** — Template launch: 4 genre templates that build tracks + instruments +
  a 4-bar pattern, reusing `SmartCreationSheet.loadStarter` and `MusicManagerService.addTrack`.
- **S** — Contextual coach marks on first visit per surface, stored in the same
  local memory key the creation sheet already uses.
- **S** — Surface-level "what changed" badge after updates (FL/Cubasis both do this
  and it measurably reduces one-star "it broke" reviews).

## 2. Transport bar

**Ships** (`transport-bar/transport-bar.component.ts`)
- Play/stop/record, tap tempo, tempo nudge, loop toggle, loop markers, count-in,
  punch-in, metronome + volume, master volume, undo/redo, ideas sheet,
  WAV/MIDI export + share, output-device picker.
- Play modes (song/pattern) and song-end acknowledgement in the arrangement.

**Baseline**
- Cubasis: tempo **and time-signature tracks**, multiple tempo changes, metronome
  with per-beat accents, Ableton Link and MIDI clock output.
- FL Mobile: tempo changes per project, count-in, metronome, MMC transport.
- Audio Evolution: gradual tempo changes and time-signature changes.

**Gaps**
1. **Fixed 4/4 and one global tempo.** `timeSignature = "4/4"` is a display string
   in the transport; `Project.timeSignature` exists in `studio.types.ts` but nothing
   edits or conducts it. Any song with a 6/8 bridge or a ritardando is out.
2. **No note-repeat / arpeggiator in the transport.** Cubasis and FL both expose
   note repeat from the transport; a grep for `noteRepeat` in `src/app` returns nothing.
3. **No external sync indication.** There is a DJ-side MIDI clock transmitter
   (`services/dj-midi.service.ts`) but the studio transport neither sends nor
   receives clock, and there is no Link-style phase indicator.
4. **Count-in is global, not per-record-mode** (audio vs MIDI), and punch-in state
   is not reflected in the record button's long-press affordance.

**Improvements**
- **M** — Tempo map: `TempoEvent[]` on the project, consulted by
  `AudioEngineService.secondsPerStep` call sites and by `ExportService.renderProjectOffline`
  (which currently assumes a single `tempo`), plus a tempo lane in the arrangement.
- **S** — Time-signature events with a 6/8 and 7/8 grid in the piano roll/arrangement.
- **S** — Note-repeat control on the transport that arms the existing
  `performer` arpeggiator-lite path for the focused track.
- **S** — Link/clock status pill fed by the DJ MIDI service, so sync state is visible
  instead of a hidden setting.

## 3. Arrangement view

**Ships** (`arrangement-view/`)
- WebGL timeline with lanes, clip draw/move/trim/slip/split/duplicate/glue,
  grid snap, quantise selection, consolidate, bounce-track-to-audio, markers,
  track groups and folders, automation lane entry, take-lane toggle, stem splitter,
  pinch zoom, two-finger pan, `requestViewChange` for empty-state CTAs.
- Clip fades (`fadeIn`/`fadeOut` in bars), per-clip offset and streamer admission
  fields for long imports.

**Baseline**
- Cubasis: unlimited length, crossfades, range/ripple editing, tempo track lane.
- FL Mobile: playlist with audio/automation clips, per-clip stretch, unlimited length.
- Audio Evolution: unlimited tracks/groups, non-destructive clip editing, crossfades.

**Gaps**
1. ~~**64-bar ceiling is hard-coded.**~~ **Closed 2026-10-23.** `totalBars` is now a
   computed value: the timeline shows `max(64, song boundary, last clip/note + 8 bars,
   manual extension)`, `gridWidth()` and the WebGL renderer use it, drags and draws
   near the end grow it automatically, and a `+ 16 BARS` control extends it on demand.
   `MusicManagerService.arrangementEndBar` also feeds song length, so a clip at bar 90
   is reachable by the loop markers and playback runs to it. Evidence:
   `arrangement-view.component.ts` (`totalBars`, `songEndBar`, `extendTimeline`,
   `ensureTimelineCovers`), `music-manager.service.ts` (`arrangementEndBar`), tests in
   both specs.
2. **No crossfade between adjacent audio clips.** Per-clip fade-in/out exists and,
   as of 2026-10-23, the offline render applies the same envelope as live playback
   (a bounced fade used to be a hard edge). Drawing an overlap between two touching
   clips is still a manual two-step (set fade-out on A, fade-in on B); the
   `crossfade` hits in the codebase are DJ-deck only.
3. **No range/ripple editing.** Trim affects one clip; moving a clip does not offer
   ripple or "insert time".
4. **No track freeze / bounce-in-place for MIDI.** `bounceSelected` exists on a
   track's tool row but there is no frozen-state model, so heavy projects cannot
   trade CPU for disk.
5. **No clip gain envelope or reverse.** Reverse appears only in sampler/audio
   tooling, not as a clip operation.

**Improvements**
- **M** — Dynamic song length: drop the 64 constant, derive bars from
  `songStructureEnd`, virtualise the WebGL draw range by viewport, and add an
  "end of song" marker. This alone changes the product category.
- **M** — Crossfade tool: when two audio clips touch, draw the overlap and apply an
  equal-power fade on both edges (reuse the existing fade scheduling).
- **S** — Range selection + ripple delete / insert-time on the selected range.
- **M** — Track freeze: render a MIDI track through `OfflineBounceService`, store the
  buffer in `stemAudioCache`, mark the track `frozen`, and bypass live voices.
- **S** — Clip reverse + clip gain (a `clipGain` field applied in `triggerSampler`).

## 4. Session view (clip launcher)

**Ships** (`session-view/`, `performance-grid/`)
- Scene/clip grid, launch quantise, scene rename/duplicate, follow-actions,
  per-clip automation points and curves, long-press move/reorder, level meters.
- `PerformanceGridComponent` adds a second, pad-style launcher.

**Baseline**
- Ableton Note: 8×8 grid, scene follow actions, Link.
- BandLab/Loop apps: loop-grid launching with quantised starts.
- FL Mobile: performance mode with clip triggering.

**Gaps**
- Launch quantise is a **single project-wide signal** (`launchQuantize = signal("none")`
  in `session-view.component.ts`), so every scene and clip obeys one setting. Live/Koala
  allow per-clip launch modes.
- No per-clip loop length (a 2-bar clip cannot loop against a 4-bar scene).
- No external sync: launching with a hardware sequencer or another app is impossible
  (see §19).
- Scenes cannot be exported as a performance arrangement ("capture as arrangement").

**Improvements**
- **S** — Per-clip launch mode (trigger/toggle/repeat) and loop length in bars.
- **S** — "Capture to arrangement": replay the launch history into clips on the
  timeline, which turns a jam into an editable song.
- **S** — Per-scene tempo override for transitions.

## 5. Piano roll

**Ships** (`piano-roll/`, 2 177 lines)
- WebGL note grid, draw/resize/velocity, ghost notes from other tracks, quantise
  presets (`QuantizationService`), key/scale detection (Krumhansl–Kessler),
  articulations (legato/staccato/pizzicato/accent/portamento), slide notes,
  per-note probability, CC lanes with MIDI learn and recording, pitch-bend lane,
  bezier automation hand-off, note preview audition.

**Baseline**
- Cubasis: draw/move, velocity, quantise, transpose, CC/parameter editing.
- FL Mobile: pitch, length, velocity + note effects; stamp/chop tools.
- Koala Samurai: piano-roll editor for chopped samples.

**Gaps**
1. **No generative note tools.** No arpeggiator, no note-repeat, no strum, no
   randomised velocity/humanise *inside* the editor (humanise and arpeggiate exist
   only as AI-assistant actions on a whole track).
2. **No scale-lock on drawing.** Scale detection exists; drawing outside the scale
   is still allowed with no visual constraint toggle.
3. **No MIDI file drop into the roll.** `MidiImportService` imports a whole file
   into tracks; there is no "import to this clip at the playhead".
4. **No note-group operations** (legato-join, clip-to-scale, invert, mirror, duplicate
   to next bar with one gesture).
5. **Velocity editing is per-note only** — no velocity ramp/shape over a selection.

**Improvements**
- **M** — Arpeggiator + note-repeat as *clip processors* (pattern → notes on commit),
  reusing `MusicManagerService.arpeggiateTrack` but scoped to a selection.
- **S** — Scale lock toggle that snaps new/resized notes to the detected or chosen scale.
- **S** — Selection ops: legato-join, transpose ±octave, duplicate-to-next-bar, velocity ramp.
- **S** — Drag-and-drop `.mid` onto the roll at the playhead.

## 6. Channel rack and step sequencer

**Ships** (`channel-rack/`)
- Per-track channel strip with instrument picker, mute/solo, volume/pan, clone,
  reorder, drag-and-drop, a 16-step-per-bar sequencer grid with paint-drag,
  bar windowing and per-step pitch entry.

**Baseline**
- FL Mobile's channel rack is the direct ancestor of this design and remains the
  benchmark for fast pattern work.

**Gaps**
- No per-lane step count UI (polymeter exists in the drum machine, not here).
- No swing/shuffle per lane; swing is a global drum-track attribute.
- No pattern *length* control per lane beyond the bar window.
- No "flip/rotate/shift" pattern transforms.

**Improvements**
- **S** — Lane length + swing per lane, mirrored from `DrumMachineComponent.setPolymeter`.
- **S** — Pattern transforms (shift left/right, invert, double/halve) with undo.
- **S** — Step velocity via long-press (the drum machine already has this gesture).

## 7. Drum machine

**Ships** (`drum-machine/`, 1 457 lines)
- 16 pads, per-step probability, ratchet, polymeter, swing, groove presets,
  pattern copy/paste, genre generation, evolve-rhythm, pad cross-linking,
  tap tempo, per-step sheet, WebGL-free canvas pads.

**Baseline**
- FL Mobile: step sequencer + drum pads; Cubasis: drum pads + note repeat;
  Koala: 64-pad sampling and sequencing.

**Verdict: ahead on per-step musicality** (probability + ratchet + polymeter + evolve
is more than FL Mobile's step editor). The gap is content, not engine.

**Gaps**
- Small factory kit library and no kit browser with audition-in-context.
- No per-pad choke groups / polyphony limit UI (engine-level choke may exist, UI does not).
- No drag-a-sample-onto-a-pad flow (sampler has drop zones; drum pads do not).

**Improvements**
- **S** — Kit browser with preview + "load into project".
- **S** — Drop-to-pad sample assignment, reusing `SamplerComponent.onDrop`.
- **S** — Choke/polyphony per pad.

## 8. Mixer

**Ships** (`mixer/`, `vca-bus.service.ts`, `mixer-strip.ts`)
- Horizon-style strips: fader, pan, mute/solo, peak hold, master fader, AUX A/B
  send view with dB readouts, VCA bus rack (create/delete, assignments, multiplier),
  mobile inspector, drag/keyboard fader input, haptics.

**Baseline**
- Cubasis: channel strips with 8 inserts, 8 global send buses, 8 master inserts,
  record-arm per channel, automation on every control.
- n-Track/Audio Evolution: group channels, aux channels, routing matrix.
- FL Mobile: mixer with per-track FX rack and sends.

**Gaps**
1. **Bus routing is an unfinished path, not a feature.** `TrackType` includes `'bus'`,
   the arrangement can add a bus track (`createGroup` → `addTrack(..., 'bus')`), and
   `MusicManagerService.setTrackBus`/`createBus` exist — but no surface calls
   `setTrackBus`, `AudioEngineService.updateTrack` never reads `busId`, there is no bus
   strip in the mixer, and `ExportService` skips bus tracks. So a "group" is currently
   a coloured lane with no summing, no processing and no export.
2. **Sends are fixed A/B.** Cubasis exposes eight global send buses with their own
   FX; we have two hard-wired destinations.
3. **No insert count per channel in the mixer UI** — inserts live in the channel rack
   and effects rack, so mixing and processing are two different screens.
4. **No pan law or mono-compatibility control** (pro users on headphones notice).
5. **No meter scaling options** (peak/RMS/LUFS per strip) and no numeric fader entry
   beyond the drag readout.

**Improvements**
- **M** — Finish bus channels end to end: assign tracks from the strip (`setTrackBus`),
  sum them in `AudioEngineService.getTrackOutput`, show a bus strip with its own
  inserts in the mixer, and mix buses in `ExportService.renderProjectOffline`.
- **M** — Expand sends to N aux buses with a send matrix.
- **S** — Insert slots on the strip that open `EffectsRackUiComponent` in a sheet.
- **S** — Pan law selector (0 / −3 / −4.5 dB) applied in the track panner.

## 9. Effects and plugin store

**Ships** (`effects/`, `effects-rack-ui/`, `plugin-store/`, `assets/worklets/`)
- Built-in dynamics/EQ/reverb/delay/chorus/saturation/sidechain, a
  `DynamicEffectsRack` with worklet-hosted inserts, master worklet (EQ, compressor,
  saturation, lookahead limiter), per-slot enable/remove, param specs, A/B mix,
  community plugin import/export with parameter mapping.

**Baseline**
- FL Mobile: 30+ built-in effects, no third-party plugins.
- Cubasis Android: built-in effects, **no third-party plug-in support**.
- Audio Evolution: optional ToneBoosters packs + Vocal Tune Studio as IAP.

**Gaps**
- No third-party plugin format (none of the Android DAWs have one either — parity).
- No insert preset browser ("Vocal air", "808 glue") — FL and Cubasis both ship
  effect presets; we ship parameter specs only.
- No per-insert gain-reduction/reduction meter in the rack UI.
- Master worklet has no true-peak oversampling readout, so the limiter ceiling is
  a target, not a measured guarantee (see §14).

**Improvements**
- **S** — Factory insert presets per effect type, exposed in the rack's add menu.
- **S** — GR meter on compressor/limiter slots (the analyser tap already exists).
- **M** — Optional 4× oversampled true-peak detector in the master worklet, surfaced
  as "TP" in the mastering suite.

## 10. Instruments, sampler, sound browser

**Ships**
- `synthesizer/` (subtractive, wavetable, FM, granular, physical-modelling classes,
  patch load, LFOs, ADSR visualisation, beginner toggle).
- `sampler/` (zones, round-robin, ADSR, loop with crossfade, pitch-shift, tempo-match,
  drag/drop import, MIDI note mapping).
- `sound-browser/` (presets, tags, favourites, similar, AI search, drag to track),
  `sample-library/` (tags, audition, drag), `chord-editor/`, `score-view/`.

**Baseline**
- FL Mobile: 8 instruments, 1 000+ sounds, 30+ effects, direct drag-and-drop from
  other apps, streamed sound previews.
- Cubasis: HALion Sonic SE-style instrument set, MediaBay file browser.
- BandLab: 436+ instruments and a 250k sample library (membership-gated).

**Gaps**
1. **Library size and curation.** We ship a preset set, not a 1 000-sound library with
   genre packs; FL and BandLab win the "open it and something sounds good" test.
2. **No multi-timbral instrument** (one instance per track only).
3. **No streamed audition** for large samples in the browser (Koala/FL both preview
   without downloading); `SoundBrowser.previewPreset` synthesises, so this is only a
   gap for audio libraries.
4. **No patch-level search across instruments** (search filters presets of one instrument).
5. **No user sample folders** with rescan/relink (import is per-file).

**Improvements**
- **M** — Ship 3 genre packs (trap/afrobeats/lo-fi) as JSON + audio, with a
  "load pack" action; this is content work, not engine work.
- **S** — Global patch search across all instruments and sample tags.
- **S** — Sample folder watch with relink on project load (reuse `SampleStreamer` source URL).

## 11. Audio recording, microphone interface and vocal suite

**Ships** (`audio-recorder-view/`, `vocal-suite/`, `microphone-interface/`,
`recording-capture-buffer.ts`, `smart-recording.service.ts`)
- Input device picker, monitoring toggle with monitor nodes, noise gate with
  threshold, level meter, take list with rename/mute/delete/select, promote-to-take,
  spill-safe capture buffer, background-safe take finalize, WAV write via
  `wav-stream-encoder.util.ts`, export to arrangement, retry/keep-latest paths.
- Vocal suite: tuning (`PitchCorrectionService`, worklet), de-esser, exciter,
  presence/air, spectrograph, take envelope, normalize/trim-silence, download.
- Latency service with per-device calibration (`audio-engine-latency.service.ts`).

**Baseline**
- Voloco: 50+ voice effects, 12 packs, real-time correction, harmonies, vocoder,
  noise removal, auto-mix/master.
- Cubasis: input monitoring, offset compensation, multi-track arm.
- Audio Evolution: punch-in/out, Vocal Tune Studio, latency compensation.

**Verdict: ahead on capture engineering** (bounded capture buffer + spill + background
finalize is better than most Android DAWs), **behind on surface polish**.

**Gaps**
- No in-app latency **wizard**: calibration exists as a service call
  (`calibrateFromCurrentDevice`), but there is no guided "tap along" screen, so users
  never discover it. Voloco's FAQ and reviews show exactly this complaint.
- Monitoring is a plain toggle: no headphone/feedback guard (a grep for
  "headphone"/"feedback" in `src/app/studio` returns no guard copy), no one-tap mute
  on feedback, and no "monitor through the interface, not the speaker" hint.
- No input gain/trim before the gate (clipping is unrecoverable).
- No punch-in/out region UI on the recorder (transport has the flag only).

**Improvements**
- **S** — Latency calibration wizard with click-track loopback and a stored offset.
- **S** — Input trim + clip indicator before the capture buffer.
- **S** — Punch region handles on the recorder waveform, wired to transport punch.

## 12. Comping (take lane and vocal comp view)

**Ships**
- `take-lane/` (comp mode, per-bar sections, punch-in stamp, take select/mute/delete),
  `vocal-comp-view/` (groups, reference take, compare, assemble comp, AI best-take
  suggestion, export comp and all takes).
- `vocal-comp-suggester.service.ts` scores takes.

**Baseline**
- Cubasis 3.8 documentation does not describe a Cubase-style take-lane comping system;
  FL Mobile does not advertise comping; Audio Evolution does not advertise take comping.
  BandLab ships "Takes" for comping.

**Verdict: ahead of every dedicated Android DAW here, at parity with BandLab.**
The gap is discovery and reach: comping lives in the vocal flow, not on every audio track.

**Improvements**
- **S** — Enable take-lane comping on any audio track from the arrangement strip,
  not only the vocal path.
- **S** — Comp flatten-to-clip command so a comp becomes a normal audio clip for export.
- **S** — Show the comp score ("take 3 is best for bars 5–8") as a chip, not a modal.

## 13. DJ deck

**Ships** (`dj-deck/`, 2 359 lines)
- Two decks with platters, waveform overviews, hot cues, loops, beat-jump, FX pads,
  sampler pads, crossfader, channel meters, stem gains, scratch monitor,
  deck loop region scaling, MIDI clock output, reactive visuals.

**Baseline**
- FL Mobile performance mode; Koala for live sample triggering; dedicated DJ apps
  (djay, Cross DJ) are a different category.

**Verdict: ahead** — no Android DAW ships a deck this complete.

**Gaps**
- No "record this set" export (the studio recorder can capture master, but the DJ
  surface has no one-tap set capture).
- No external MIDI-clock **input** (only output via `DjMidiService`), so beat-matching
  to hardware or another app is one-way.
- No keylock/tempo-range control surfaced despite playback-rate support.
- No library analysis persistence (BPM/key) across sessions in a visible form.

**Improvements**
- **S** — "Record set" button writing master to a WAV with a set-length timer.
- **S** — Clock input (listen) mode with a phase meter, plus Link-compatible beat phase.
- **S** — Keylock + tempo-range selector on the deck header.
- **S** — Persist analysed BPM/key per track and show it in the deck library.

## 14. Mastering suite

**Ships** (`mastering-suite/`, `loudness-meter.ts`, `export.service.ts`)
- BS.1770-style gated integrated LUFS, true peak (inter-sample aware), LRA,
  correlation, spectrogram, genre presets with band deltas, target LUFS/ceiling,
  offline render-and-master, AI roast, master worklet limiter with ceiling.
- Reference-track A/B (2026-10-23): import a commercial master, decode and measure
  it with the same BS.1770 meter, A/B audition it, and one-tap match loudness.

**Baseline**
- FL Mobile: basic master chain; Cubasis: master inserts; Audio Evolution: master
  effects + Vocal Tune; dedicated mastering apps (e.g. Mastergrade-style) offer
  reference matching and delivery targets.

**Gaps**
1. ~~**No reference-track A/B.**~~ **Closed 2026-10-23.** A "Reference A/B" card
   decodes a picked file through the live context, measures it with
   `ExportService.analyzeBuffer` (the same BS.1770 meter that grades the mix), shows
   reference LUFS / true peak / length next to the master's meters, A/B auditions the
   reference through the existing audition path, and offers one-tap loudness matching
   via the new `AudioEngineService.setMasterMakeupDb` (a ±12 dB makeup on
   `_preMasterGain`, in front of both master paths, with the limiter still holding the
   ceiling). Clearing the reference resets the makeup to 0 dB. Evidence:
   `mastering-suite.component.ts` (`onReferenceChosen`, `referenceDeltaDb`,
   `matchReferenceLoudness`, `toggleReferenceAudition`, `clearReference`),
   `audio-engine.service.ts` (`setMasterMakeupDb`), new spec
   `mastering-suite.component.spec.ts`. **Still open:** the loudness *match* is
   broadband only — spectral/EQ delta overlay is still future work.
2. ~~**No delivery targets.**~~ **Closed 2026-10-23.** A "Delivery Targets" card lists
   the specs the platforms publish (Spotify −14/−1, Apple Music −16/−1, YouTube
   −14/−1, Podcast −16/−1.5, Club −9/−0.3); tapping one conforms `targetLufs` +
   `safeCeiling` (which routes to the live limiter through
   `AudioEngineService.setMasteringTargets`), marks the chip active, deactivates the
   genre preset, and — when the last Render & Master pass has measured the bounce —
   applies the shortfall as master makeup so the next render lands on the target
   rather than just aiming at it. Evidence: `mastering-suite.component.ts`
   (`DeliveryTarget`, `applyDeliveryTarget`), suite spec (5 conform tests).
   **Still open: nothing on conform; see gap 3 for preset idempotence.**
3. **Presets overwrite targets only** — `applyPreset` sets goals but per-band deltas
   are additive on current gains, so repeated preset taps drift the EQ.
4. ~~**No 24-bit master**~~ **Closed 2026-10-23.** The transport's export menu now
   carries "Export WAV (24-bit)" and the stem set writes 24-bit WAVs (§17). FLAC is
   still absent.
5. **No album sequencing / DDP** — acceptable for a phone app; Cubasis doesn't either.

**Improvements**
- ~~**M** — Reference lane: import a track, loudness-match it.~~ **Shipped.**
- **M** — Spectrum/EQ delta overlay against the reference (`analyzeBuffer` already
  measures both sides).
- ~~**S** — Delivery target table + conform-to-target action.~~ **Shipped.**
- **S** — Preset application should set absolute band gains (store base gains with
  the preset) so it is idempotent.
- ~~**M** — 24-bit WAV master export (§17).~~ **Shipped.**
- **M** — FLAC master export (needs a lossless encoder; WebCodecs has no FLAC
  `AudioEncoder` to fall back on).

## 15. Performance mode, pads and performer

**Ships** (`performance-mode/`, `performer/`, `sound-pad/`, `sound-pad-grid/`)
- 4×4/8×8 pad grids with velocity from touch position, long-press reassign,
  MIDI learn per pad, keyboard view with pitch bend/mod wheel/velocity,
  smart chords, scene launch, arpeggiator toggle, live engine routing, visualiser.

**Baseline**
- Cubasis: on-screen keyboard, chord and drum pads, note repeat.
- FL Mobile: performance mode with pads and clip triggering.

**Gaps**
- MIDI mappings are per-screen and not persisted as a shareable map.
- No note-repeat on pads (Cubasis has it; Koala relies on retrigger).
- No scale-locked keyboard mode on the performer (piano roll has scale knowledge).
- No "hold/latch" chord mode with sustain handling.

**Improvements**
- **S** — JSON MIDI-map import/export shared across performance surfaces.
- **S** — Pad note-repeat rate control.
- **S** — Scale lock + chord latch on the performer keyboard.

## 16. Automation

**Ships** (`automation/`, `automation.service.ts`)
- Per-lane automation with bezier curves, WebGL curve editor, presets, commit,
  record-arm from the piano roll, automation points on session clips, lane toggle
  from the arrangement.

**Baseline**
- Cubasis: automation on every mixer/instrument parameter, tempo and signature tracks.
- FL Mobile: automation clips in the playlist.

**Gaps**
- Automation does not reach VCA faders, aux send buses, or master worklet params.
- No automation lane for tempo (same gap as §2).
- No touch-write/latch modes (read-only + manual points today).

**Improvements**
- **S** — Expose VCA/send/master params to the same lane model.
- **M** — Touch/latch write with smoothing.
- **S** — "Show automated params" filter in the lane picker.

## 17. Export, bounce and share

**Ships** (`export.service.ts`, `offline-bounce.service.ts`, `transport-bar`)
- Offline render (deterministic, streamed clips supported, clip fades applied),
  WAV 16-bit and 24-bit at 44.1 or 48 kHz, MP3 192 k / AAC / Opus via WebCodecs with
  WAV fallback, MIDI export, canvas video export with master audio, Web
  Share/download fallback, mastering polish pass, project MIDI. Stems are 24-bit at
  the same chosen rate as the master; a 32-bit-float master is available through
  `OfflineBounceService` and the mastering suite.

**Baseline**
- FL Mobile: WAV, MP3, AAC, FLAC, MIDI, `.flp` interchange, cloud backup, device-to-device share.
- Cubasis: WAV, FLAC, MP3, MIDI, stems, **DAWproject** import/export.
- Audio Evolution: WAV, MP3, AIFF, FLAC, OGG, stems, iOS project interchange.
- n-Track: WAV/MP3, `.sng` interchange, DAWproject in v10.2.2.

**Gaps (this is the biggest functional cluster)**
1. ~~**No stem/by-track export.**~~ **Closed 2026-10-23.** `ExportService.exportStems()`
   renders the master plus one WAV per unmuted, non-bus track through the same offline
   graph and length, ignores solo so a stem set is complete, sanitises names, skips
   collisions, and bundles everything with `zip.util.ts`; the transport exposes
   "Export Stems (.zip)" and reuses the existing `isExporting` guard. Evidence:
   `export.service.ts` (`exportStems`, `renderProjectOffline` options), transport
   component/template, `tests/export.service.spec.ts`.
2. ~~**No 24-bit WAV.**~~ **Closed 2026-10-23.** `audioBufferToWav(buffer, 24)`
   writes packed 24-bit PCM through the existing `WavEncoder` 24-bit path, `wav24` is
   an `EXPORT_FORMATS` entry, `exportProjectWav(24)` renders once and tags the filename
   `_24bit`, the transport exposes "Export WAV (24-bit)", and stems are 24-bit so a
   receiving engineer never starts from truncated samples. Evidence:
   `export.service.ts`, `wav-encoder.util.ts`, `transport-bar`, both export specs.
   **Still open:** no FLAC (no encoder available).
3. ~~**Fixed 44.1 kHz.**~~ **Closed 2026-10-23.** `renderProjectOffline` takes a
   `sampleRate` (the offline context itself is created at 44.1 or 48 kHz, so the
   audio is synthesised at that rate rather than a relabelled bounce),
   `exportProjectWav(bitDepth, sampleRate)` tags non-default files `_48k`, and
   `exportStems({ bitDepth, sampleRate })` renders every stem at the same rate as the
   master. The transport exposes a persistent "Export rate: 44.1 kHz / 48 kHz"
   toggle used by the WAV and stem actions. **Still open:** MP3 bitrate is fixed at
   192 k, and the share/social path (`exportAndShare`) always renders at 44.1 kHz.
4. **No project interchange**: no `.flp`, no DAWproject, no AAF (§19).
5. **Export is a blocking button, not a job.** `TransportBar.exportWav()` sets
   `isExporting` and disables the menu ("Rendering…"), but a multi-minute arrangement
   shows no percentage, no ETA and no cancel; `ExportService` exposes neither progress
   nor an abort path, unlike `OfflineBounceService.bounce` which has both.
6. **Video export is a separate flow** without a "share to social" preset (9:16 vs 16:9).

**Improvements**
- ~~**L** — Stem export.~~ **Shipped** — see gap 1 above. BPM is not appended to the
  filename yet; that is a one-line follow-up when the tempo map lands (§2).
- ~~**M** — 16/24-bit choice.~~ **Shipped.**
- ~~**M** — Sample-rate choice (44.1/48 kHz).~~ **Shipped.**
- **M** — FLAC encoder (needs a WASM encoder; WebCodecs has no FLAC `AudioEncoder`),
  plus a bitrate choice for MP3.
- **S** — Export job sheet with progress, cancel and "share when done".
- **M** — DAWproject export first (XML + media, no licensing), then import.

## 18. Project workspace, autosave and cloud

**Ships** (`project-workspace.service.ts`, `services/cloud-sync.service.ts`)
- Save/load with source attribution (manual/autosave/recovery), 30 s autosave,
  dirty tracking, recovery snapshot restore, version history list, offline queue,
  conflict map with mine/theirs/merge strategies, timeline log, local manifest mirror.
- Project bundles via `zip.util.ts`.

**Baseline**
- BandLab: automatic cloud save across devices, unlimited projects, collaboration.
- Cubasis/FL: cloud backup and device-to-device transfer.
- Music Maker JAM: **local-only** projects and documented data loss — the cautionary tale.

**Gap (Blocking)**
- `CloudSyncService` injects **`MockCloudServer`**, not a network backend
  (`services/cloud-sync.service.ts` line ~42, comment "Signal-driven orchestrator on
  top of MockCloudServer"). Every "synced" state in the UI is simulated. On a real
  device, a user who switches phones loses their projects — the exact complaint that
  defines Music Maker JAM's one-star reviews.
- No multi-device conflict UX beyond the resolver modal; no "restore this version"
  from the project screen (only from the sync panel).
- No collaboration/invite model (BandLab's core loop).

**Improvements**
- **L** — Replace `MockCloudServer` with the real API (`src/routes/project.routes.ts`
  and `src/services/project.service.ts` already exist server-side): authenticated
  push/pull, ETag/version concurrency, resumable upload for large audio, and a
  migration path for existing local projects.
- **S** — Surface "last backed up / not backed up" in the project header, so the state
  is honest even when offline.
- **M** — Collaboration: share a project link with per-device push/pull and a review
  pass (BandLab parity), gated behind the billing work in §20.

## 19. MIDI hardware, sync and interchange

**Ships**
- Web MIDI via `navigator.requestMIDIAccess` (`services/hardware.service.ts`,
  `permission.service.ts`, `dj-midi.service.ts`), MIDI learn per control,
  MIDI file import (`midi-import.service.ts`) and export (`midi-writer.util.ts`),
  DJ-side MIDI clock **output**.

**Baseline**
- FL Mobile: wired/Bluetooth MIDI controllers, CC mapping, MMC; explicitly **cannot**
  sync to external MIDI clock.
- Cubasis: MIDI hardware, MIDI clock out, MIDI Thru, Learn, Mackie/HUI, **Ableton Link**.
- Audio Evolution: USB MIDI + USB audio driver, MIDI remote.
- Koala: Ableton Link.

**Gaps (Blocking)**
1. **Android System WebView does not expose `requestMIDIAccess`.** There is no
   Capacitor MIDI plugin in `package.json`, so on the target platform the MIDI
   feature silently no-ops (`hardware.service.ts` returns early). A user plugging in a
   Launchkey gets nothing — FL and Cubasis both work.
2. **No USB/class-compliant audio input** (Audio Evolution and n-Track both support it;
   our recording path is the device microphone/WebRTC input).
3. **No Ableton Link, no MIDI clock in** for the studio transport.
4. **No DAWproject/AAF interchange** (Cubasis ships DAWproject since 3.7.5).

**Improvements**
- **M** — Capacitor MIDI bridge (`@capacitor-community/midi` or a thin Android
  `MidiManager` plugin) that implements the same interface `hardware.service.ts`
  already expects, including Bluetooth MIDI and hot-plug.
- **M** — USB audio input via `@mediagrid/capacitor-native-audio` or an Android
  `AudioRecord` bridge feeding `RecordingCaptureBuffer`.
- **M** — Link/clock sync service consumed by transport and session view.
- **M** — DAWproject export (then import), which buys interchange with Cubasis,
  Bitwig, Studio One and Reaper without inventing a format.

## 20. Store readiness: packaging, billing, background, signing

**Ships**
- Capacitor Android project, targetSdk 36 / minSdk 24 (`android/variables.gradle`),
  manifest with RECORD_AUDIO, media audio read, WAKE_LOCK, foreground media service
  (radio), Bluetooth connect, notifications (`android/app/src/main/AndroidManifest.xml`).
- `ScreenWakeLockService` during playback; studio audio **finalizes when the app is
  backgrounded** (`audio-session.service.ts` `finalizeForBackground`).

**Baseline**
- Cubasis and n-Track document background playback; Audio Evolution explicitly
  requires foreground. FL Mobile's background playback is iOS-only.
- All the commercial apps monetise through Play Billing (subscription or IAP packs).

**Gaps (Blocking for a paid or subscription launch)**
1. **Billing is a shim.** `services/play-billing.client.ts` documents itself as a
   Sprint C2 shim; there is no Play Billing dependency in `package.json` or Gradle,
   so no purchase can complete.
2. **Background playback stops.** `finalizeForBackground` tears down the audio session
   on `pagehide`/`freeze`; a user locking the screen during a mix loses playback.
   (Defensible vs FL, but Cubasis/n-Track set the expectation.)
3. **No release signing config.** `android/app/build.gradle` has only a `release`
   block with `minifyEnabled false` and no `signingConfig`; versionCode/versionName
   are `1` / `"1.0"`.
4. **AD_ID permission declared with no ads SDK** (`AndroidManifest.xml` line ~83,
   no AdMob dependency). Play's Data Safety form will be inconsistent with the manifest.
5. **No crash/ANR telemetry wiring in the store build** beyond the in-app telemetry
   service; Play vitals will be the only signal.
6. **Bundle budget already exceeded** (1.97 MB initial vs 1.75 MB budget) — Play
   doesn't care, but cold start on a low-end phone does.

**Improvements**
- **M** — Real Play Billing 6+ client with a single subscription SKU, entitlement
  check on launch, restore-purchases, and server-side receipt validation against
  `src/routes`.
- **M** — Background playback via a foreground media service that keeps the
  AudioContext alive (or a native audio bridge), with an explicit "playback may stop
  in background" setting for battery-sensitive users.
- **S** — Release keystore + `signingConfig` + versioning script; strip AD_ID or add
  the ad SDK deliberately.
- **S** — Crash reporting (Sentry/Crashlytics) in the release build.

## 21. Cross-cutting: performance and visual layer

**Ships** — WebGL timeline/piano-roll/automation renderers, a visual scheduler with
FPS budget (`StudioVisualSchedulerService`), device profiling
(`studio-device-profile.service.ts`), adaptive display CSS, worklet DSP.

**Gaps**
- The timeline renderer redraws all 64 bars every frame when dirty; a longer song
  (§3) makes this the next performance cliff.
- No explicit "low power" mode that disables WebGL visuals while keeping audio
  (FL Mobile has battery-saving options).
- Visual layers (stage FX, atmosphere) are separate from the audio power profile.

**Improvements**
- **S** — Low-power toggle: drop to 30 fps DOM meters, disable atmosphere/stage FX.
- **M** — Viewport-culled draw range when the 64-bar cap is removed.

---

## Prioritized backlog

### P0 — ship blockers (a pro user or Play review stops here)
1. Real cloud backend instead of `MockCloudServer` (§18).
2. Android MIDI bridge so hardware controllers work (§19).
3. Play Billing client + entitlements (§20).
4. Release signing + version code strategy (§20).
5. ~~Remove the 64-bar ceiling.~~ **Done 2026-10-23.**
6. ~~Stem export.~~ **Done 2026-10-23.**

### P1 — what reviewers compare first
7. Tempo/time-signature map + note repeat (§2).
8. FLAC export (§17) — 24-bit WAV and 44.1/48 kHz shipped 2026-10-23.
9. Group/bus channels and N aux sends (§8).
10. Drawn clip crossfade + ripple editing (§3) — fades now survive export.
11. Latency calibration wizard (§11).
12. Background playback (§20).
13. Mastering preset idempotence + spectral delta vs reference (§14).
14. Track freeze / bounce-in-place (§3) — promoted from P2 because the longer
    timeline makes long MIDI projects the next CPU cliff.

### P2 — depth and differentiation
15. Generator tools in the piano roll (arp/note-repeat/strum) (§5).
16. DAWproject export (§19).
17. Ableton Link / clock in (§19).
18. Genre sound packs (§10).
19. Insert presets + GR meters (§9).
20. Capture-to-arrangement from session view (§4).

### P3 — polish
21. Scale lock, pad note-repeat, MIDI map import/export (§5, §15).
22. Automation for VCA/send/master params (§16).
23. DJ set recording + clock input (§13).
24. Low-power mode (§21).
25. Onboarding templates and coach marks (§1).

## Where we are already ahead (protect these)

- **Comping**: take lanes + vocal comp view + best-take suggestion is beyond FL Mobile,
  Cubasis Android and Audio Evolution; at parity with BandLab's Takes.
- **Capture engineering**: bounded `RecordingCaptureBuffer`, spill-to-disk, and
  background-safe finalize are stronger than what the commercial Android DAWs document.
- **Stem separation** in-app: BandLab has it, the dedicated Android DAWs do not.
- **Per-step musicality** in the drum machine (probability, ratchet, polymeter, evolve).
- **A full DJ deck inside the DAW** — no Play Store DAW ships this.
- **AI copilot, session musicians, mastering roast** — no baseline app has an
  assistant that acts on the project graph rather than a chat sidebar.
- **Loudness analysis** (gated LUFS, true peak, LRA, correlation) is measurable and
  standards-based; most mobile DAWs show only peak/RMS.

## What not to copy

- **BandLab's ad pressure** — its Play reviews are dominated by complaints about ads
  and paywalled features. Monetise with a clear subscription or one-time unlock.
- **Music Maker JAM's local-only projects** — documented project loss on device change.
  This is exactly the failure mode §18 must close before launch.
- **Voloco's hidden latency problem** — calibration must be discoverable, not a doc page.
- **FL Mobile's no-MIDI-clock limitation** — if we add sync, do it bidirectionally.
- **Loop-pack dependency** — Music Maker JAM cannot import external audio for remixing;
  our import path is a genuine advantage, keep it first-class.

## Closed in the 2026-10-23 parity pass

Seven items from this audit were implemented and verified in the same working tree:

1. **Song-length timeline** (§3). The arrangement no longer stops at 64 bars. Length
   follows clips and notes (`songEndBar`), the song boundary (`effectiveBars`), a
   manual `+ 16 BARS` control, and grows automatically when a clip is dragged or
   drawn past the end. Song length in `MusicManagerService` now includes
   `arrangementEndBar`, so playback and loop markers reach the new content.
   - Tests: `arrangement-view.component.spec.ts` ("grows the timeline past the
     classic 64 bars", "extends the timeline when a clip is drawn past the end"),
     `music-manager.service.spec.ts` ("reports the last occupied bar").
2. **Stem export** (§17). `ExportService.exportStems()` renders master + one WAV per
   audible track, ignores solo, keeps every stem the same length/sample rate, and
   zips them; exposed as "Export Stems (.zip)" in the transport menu.
   - Tests: `tests/export.service.spec.ts` (bundle shape, skipped muted/bus tracks,
     solo ignored for stems, solo honoured for a full render).
3. **24-bit WAV export** (§14, §17). `WavEncoder` gained a `wav-24` format,
   `audioBufferToWav(buffer, 24)` writes packed 24-bit PCM, `wav24` joined
   `EXPORT_FORMATS`, `exportProjectWav(24)` renders once and tags the download
   `_24bit`, the transport menu gained "Export WAV (24-bit)", and every stem is now
   24-bit so a receiving engineer never starts from 16-bit truncation.
   - Tests: `export.service.spec.ts` (24-bit header/block-align/byte-rate, packed
     ±0.5 frames, 1.5× payload vs 16-bit, `_24bit` filename),
     `tests/export.service.spec.ts` (every stem encoded at 24-bit).
4. **Fades survive export** (§3). The offline render used to sum audio clips straight
   into the track bus, so a clip fade heard live came out of the bounce and every stem
   as a hard edge. Each clip now owns a panner + fade gain whose envelope is copied
   from `triggerSampler` (same clamps, same linear ramps, same "fade-out never starts
   before the fade-in ends"), which also makes an overlapping pair sum as a crossfade.
   - Tests: `tests/export.service.spec.ts` ("bounces an audio clip's fades instead of
     exporting a hard edge" asserts the 0→1 @ 2 s and 1→0 @ 6–8 s ramps at 120 BPM).
5. **44.1/48 kHz delivery rate** (§17). `renderProjectOffline` accepts a
   `sampleRate` and builds the `OfflineAudioContext` at that rate, so a 48 kHz master
   is synthesised at 48 kHz; `exportProjectWav(bitDepth, sampleRate)` tags the file
   `_48k`, `exportStems({ bitDepth, sampleRate })` renders every stem at the master's
   rate, and the transport carries a persistent "Export rate" toggle.
   - Tests: `tests/export.service.spec.ts` (the offline context is constructed as
     `[2, 5 s × 48 000, 48 000]`, stems render at the requested rate),
     `export.service.spec.ts` (`renderProjectOffline` receives 48 000, `_48k`
     filename), `transport-bar.component.spec.ts` (toggle label + arguments passed to
     the WAV and stem exports).
6. **Reference-track A/B + loudness matching** (§14). A "Reference A/B" card in the
   mastering suite decodes a picked file, measures it with the shared BS.1770 meter,
   A/B auditions it, shows the measured delta, and applies it as master makeup
   (`setMasterMakeupDb`, ±12 dB on `_preMasterGain`, in front of both master paths);
   clearing the reference resets the makeup.
   - Tests: new `mastering-suite.component.spec.ts` (decode + shared-meter analysis,
     decode failure cleanup, delta math both directions, matching through the makeup
     stage and reset, refusal to match an unmeasured master, A/B play/stop through the
     audition path).
7. **Delivery-target table + conform** (§14). The suite has a "Delivery Targets"
   card with the published platform specs; conforming sets the loudness target and
   limiter ceiling, and reuses the render measurement to compute and apply makeup.
   - Tests: `mastering-suite.component.spec.ts` (spec table values, conform wiring
     with chip highlight + preset deactivation, measured-shortfall makeup, refusal to
     fabricate a delta without a render, unknown-id guard).

Verification run for this pass: `npx tsc --noEmit -p tsconfig.json` (clean),
`npm test -- --runInBand` across the whole project (217 suites, 3 337 tests, all
passing; run with a 4 GB heap — the default 2 GB heap is borderline for the full
suite), and `npm run build` (exit 0, pre-existing 1.97 MB vs 1.75 MB bundle-budget
warning only).

### Not closed, and why it cannot be honest to close it here

| Gap | Blocker |
|---|---|
| Real cloud backend (§18) | Needs a deployed API origin + auth configuration and live storage; the repo's sync layer is wired to `MockCloudServer`, and swapping it without a reachable server and credentials would ship a worse failure (silent data loss) |
| Play Billing (§20) | Needs Play Console products/SKUs, a signed release build and server-side receipt validation; a client-only shim that "succeeds" would be fake |
| Release signing (§20) | Needs the owner's upload keystore; generating and committing one would be a security incident |
| Android MIDI bridge (§19) | Needs a Capacitor plugin plus a physical controller to verify; there is no device in this environment, and claiming MIDI works untested is worse than documenting the gap |
| Background playback (§20) | Needs a foreground service/media session wired to the WebView audio context; cannot be exercised without a device |
| Tempo map, drawn crossfades, freeze, buses, FLAC, DAWproject, Link | Larger, independent features; each needs its own design and test pass rather than a rushed batch. Per-clip fades are now exported, but a one-gesture overlap between two touching clips is still open |

## Verification appendix

Re-check the claims in this document with:

```bash
# timeline length now follows the song (no literal 64 in the renderer)
rg -n "totalBars|songEndBar|extendTimeline|ensureTimelineCovers" src/app/studio/arrangement-view
rg -n "arrangementEndBar" src/app/services/music-manager.service.ts

# fixed 4/4 and single tempo
rg -n "timeSignature" src/app/studio/transport-bar src/app/services/project.service.ts

# no note repeat / no arp insert
rg -n "noteRepeat|note repeat" src/app

# export surface (stems, 24-bit and 48 kHz ship; no FLAC)
rg -n "exportStems|EXPORT_FORMATS|wav24|applyClipFade|SAMPLE_RATES|sampleRate" src/app/services/export.service.ts
rg -n 'wav-24|wav-32-float' src/app/studio/wav-encoder.util.ts

# reference A/B ships (mastering suite, shared meter)
rg -n "onReferenceChosen|referenceDeltaDb|matchReferenceLoudness" src/app/studio/mastering-suite/mastering-suite.component.ts
rg -n "setMasterMakeupDb|masterMakeupDb" src/app/services/audio-engine.service.ts
rg -n "DeliveryTarget|applyDeliveryTarget" src/app/studio/mastering-suite/mastering-suite.component.ts

# cloud is mocked
rg -n "inject\(MockCloudServer\)|MockCloudServer" src/app/services/cloud-sync.service.ts

# no Android MIDI bridge
rg -n "requestMIDIAccess" src/app/services/hardware.service.ts
rg -n -i "midi" package.json

# billing is a shim, no signing config
sed -n '1,40p' src/app/services/play-billing.client.ts
sed -n '1,40p' android/app/build.gradle

# background playback tears down
rg -n "finalizeForBackground|pagehide|freeze" src/app/studio/audio-session.service.ts
```
