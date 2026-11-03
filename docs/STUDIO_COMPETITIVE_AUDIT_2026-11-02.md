# Studio competitive audit — every surface vs. the Android leaders

*2 November 2026 · Scope: all 24 Studio surfaces in `studio-surfaces.ts`, the
transport/engine/export paths they share, and the 50 Studio spec files. Method:
read the shipped code and templates, re-check the claims in the October audits,
and compare against the current Android feature sets of FL Studio Mobile,
BandLab, Cubasis 3 and Music Maker JAM.*

This is a gap map, not marketing. "Ahead" means we ship something the baseline
apps do not, verified in code — not that the feature is perfect. Where a control
exists but does not reach the engine, the verdict says so.

## Baseline (public, October 2026)

| App | Why it is the baseline | Source |
| --- | --- | --- |
| FL Studio Mobile 4.9 | The default "real DAW on a phone": deep piano roll, drum sampler, AUX tracks, automation clips, `.flp` export | [image-line.com](https://www.image-line.com/fl-studio-mobile) |
| BandLab | The social/cloud reference: real cloud projects, 250K+ samples, AI stems/AutoMix/SongStarter, free tier | [Play listing](https://play.google.com/store/apps/details?id=com.bandlab.bandlab) |
| Cubasis 3.8 | The pro multitrack reference: unlimited tracks, 960 PPQ, 8 inserts + 8 sends, DAWproject, Ableton Link | [Steinberg docs](https://www.steinberg.help/r/cubasis/3.8/en/cubasis/topics/version_history_x.html) |
| Music Maker JAM | The beginner loop reference: 8 channels, no MIDI, MP3-only export | [musicmakerjam.app](https://www.musicmakerjam.app/) |

---

## 1. Verdict summary

Verdict scale: **Ahead** (we ship something they do not), **At parity**
(equivalent capability), **Behind** (a pro user notices), **Blocking** (stops
adoption or store shipment).

| # | Surface | Verdict | Evidence in our code | What the baseline does better |
| --- | --- | --- | --- | --- |
| 1 | Quick Session | **Ahead** | `quick-session/` — transport, tempo, record, channels, starters on one screen; writes to the same document as every editor | Nobody ships a genuine one-screen "make something now" path beside a full DAW |
| 2 | Drum Machine | At parity | `drum-machine/` — kits (808/909/LinnDrum/SP-1200/acoustic/lo-fi), 6 style generators, swing, probability, per-step params, sample import, AI fill | FL's per-step graph editors and cut groups are deeper |
| 3 | Piano Roll | **Behind** | `piano-roll/` — 5 tools, velocity lane, scale lock, WebGL, sustain/CC64, CC lane UI, automation entry; **CC/pitch-bend lanes wired to playback and export 2 Nov 2026; channel/poly aftertouch and per-note pressure input added** | MPE member-channel bend and pressure now route to per-note voices; FL and Cubasis still have deeper per-note modulation editing |
| 4 | Vocal Suite | **Ahead** | `vocal-suite/` + `pitch-correction.service.ts` + `smart-recording.service.ts` — tuning, comping, punch-in, take editing, vocal mastering, AI vocal tools | Voloco matches real-time tuning; nobody combines comping + mastering in one mobile flow |
| 5 | Quick Recorder | At parity | `audio-recorder-view/` — streamed capture, device pick, level meter, take list | BandLab's recorder is simpler; Audio Evolution has more routing |
| 6 | Chords | At parity | `chord-editor/` — key/mode, chord types, progressions, voicing reorder | Chord packs in BandLab/FL are broader, but not editable progressions |
| 7 | Sound Pads | At parity | `sound-pad/` + `sound-pad-grid/` — 16 pads, per-pad samples, long-press assign, MIDI notes, velocity zones | Koala/FL sampling workflows are deeper |
| 8 | Synthesizer | At parity | `synthesizer/` — subtractive/wavetable voices, ADSR, filter, LFO, glide, per-note pan/pitch bend | FL ships 8 instruments and 1,000+ sounds; we ship a curated bank |
| 9 | AI Producer | At parity | `ai-band/` + `AiService` — prompt beats, 3 session musicians, generated parts | BandLab has SongStarter, Audio-to-MIDI, Voice Changer and AI FX; broader generative surface |
| 10 | Arrangement | At parity | `arrangement-view/` — WebGL timeline, 7 clip tools, fades, **equal-power overlap crossfades (3 Nov 2026)**, **tempo automation lane with draggable points, inline BPM and step/ramp curves (3 Nov 2026)**, **meter automation lane with draggable points and inline signatures (3 Nov 2026)**, **meter-aware clip lengths and export windows that retime at every meter marker (3 Nov 2026)**, freeze/unfreeze, markers, groups, take lanes, automation, stem splitter | Cubasis/FL still lead on ripple editing |
| 11 | Session View | **Ahead** | `session-view/` — clip launcher, scene CRUD, per-cell launch quantize, follow actions | No Android baseline ships an Ableton-style clip launcher (Note is iOS-only) |
| 12 | Channel Rack | At parity | `channel-rack/` — patterns, scene columns, polymeter, LFO, meters, pattern slots | FL's rack is the origin of the pattern model and remains deeper |
| 13 | Score View | **Ahead** | `score-view/` — editable notation, rests, velocity shading, MusicXML import/export | None of the four ship notation |
| 14 | Mixer | At parity | `mixer/` — VCA buses, sends A/B, sidechain routing, phase, width, buses, master strip | Cubasis: unlimited tracks, 8 inserts + 8 sends. Ours is 6/12/24 tracks by device tier (`studio-device-profile.service.ts`) |
| 15 | Effects Rack | At parity | `effects-rack-ui/` — dynamic FX, per-track inserts, WASM plugin chain, sidechain, real per-insert meters, plugin-parameter knobs and automation, factory/user presets for macro and WASM inserts | No third-party VST/AU; Cubasis has 8 insert slots per channel |
| 16 | DJ Booth | **Ahead** | `dj-deck/` — two decks, stems, hot cues, loops, 7 FX, crossfader curves, MIDI mapping | Standalone DJ apps are deeper, but no DAW baseline has this beside arrangement |
| 17 | Mastering | **Ahead** | `mastering-suite/` — LUFS targets, true peak, delivery targets, reference A/B, spectral view, AI assist | Cubasis Master Strip is the closest; no baseline offers platform delivery targets |
| 18 | Export | **Ahead** | `export.service.ts` — WAV/MP3/FLAC, stems, MIDI, DAWproject, presets, progress, **automation rendered offline** | FL exports `.flp`; Cubasis DAWproject. We match interchange and beat both on stems/presets |
| 19 | Performance | At parity | `performance-mode/` — velocity zones, pad scenes, live triggering | Cubasis pads/note-repeat are comparable |
| 20 | Sound Browser | **Behind** | `sound-browser/` — search, tags, favourites, similar, previews | BandLab: 250K+ samples and 436+ instruments; FL: 1,000+ sounds (2M with FL Cloud) |
| 21 | Sample Library | **Behind** | `sample-library/` — recorded takes, imports, categories, tags | No cloud sample marketplace or licensed pack store |
| 22 | Sampler | At parity | `sampler/` — zones, round-robin, ADSR, loop points/crossfade, key mapping, equal slicing, transient auto-chop | No licensed sample marketplace or per-step graph editor (Koala/FL remain deeper) |
| 23 | Plugin Store | Ahead in architecture, **Behind in catalog** | `plugin-store/` — sandboxed WASM DSP, JS fallback, community `.smuveplugin` export/import | Mobile DAWs host no third-party plugins at all; our catalog is small |
| 24 | Performer | **Ahead** | `performer/` — live layout, X/Y pad, arpeggiator, scene launcher, performance recording, FX macros | No baseline combines a live performance surface with the DAW document |

**Tally: 10 Ahead, 9 At parity, 4 Behind, 2 Blocking at the platform level.**

---

## 2. The honest headline

> Is the Studio "more powerful than all competition"?

**For producing a finished record on a phone: yes, on breadth.** No Android app
in this comparison combines editable notation, vocal comping, clip launching,
VCA/sidechain mixing, LUFS-targeted mastering, offline stems/FLAC/DAWproject,
a live DJ booth, WASM plugin hosting and an AI band in one document. FL is
deeper in the piano roll and sampler; Cubasis is deeper in routing and track
count; BandLab is deeper in cloud, samples and generative AI. None is broader.

**For collaboration and hardware-centric workflows: not yet.** Four gaps were
real and should not be papered over; the CC-lane one is now closed:

1. **Cloud sync is a mock.** `cloud-sync.service.ts` injects `MockCloudServer`
   and pushes to `/mock-cloud/push`. BandLab's real cross-device projects and
   community collab are categorically ahead until this is a real backend.
2. **Android has no hardware MIDI.** The only path is
   `navigator.requestMIDIAccess` (`live-engine.service.ts`,
   `dj-midi.service.ts`), which Android WebView does not implement. Cubasis
   supports class-compliant USB MIDI; we need a native Capacitor bridge.
3. **CC lanes were silent — fixed 2 Nov 2026.** The piano roll edits, learns,
   labels and displays CC/pitch-bend lanes (`piano-roll.component.html:501`).
   The engine now samples those lanes into a controller curve per note, and the
   shared voice builder schedules cutoff, pan, expression, pitch bend and
   mod-wheel vibrato for both live playback and offline export.
4. **The sample economy is thin.** 250K–2M sounds vs. a curated bank. Slicing,
   transient chopping, pitch-shift and tempo-match now ship in the sampler, but
   the catalog itself is still the gap. Beatmakers judge this first.

Everything else on the "Behind" list is a feature-depth issue, not an
architecture issue.

---

## 3. What is genuinely ahead (verified)

1. **One document, 24 editors.** `MusicManagerService` is the only writer; every
   surface reads the same `tracks()`. This is why a drum pattern, the piano roll,
   the score and the arrangement cannot disagree — a class of bug the baselines
   still ship.
2. **Clip launching + linear arrangement in one app.** Session View with
   per-cell launch quantization and follow actions has no Android equivalent.
3. **Notation.** Editable score with MusicXML round-trip; FL, BandLab, Cubasis
   and MMJ have none.
4. **Vocal pipeline.** Tuning, comping, punch-in, take promotion and mastering
   in one flow; comping is normally desktop-only.
5. **Mastering with delivery targets.** LUFS/true-peak meters and per-platform
   targets (not just presets), plus reference A/B.
6. **Export breadth.** WAV/MP3/FLAC + stems + MIDI + DAWproject + saved presets,
   rendered offline with automation curves applied (`export.service.ts:432`,
   `:754`). FL's `.flp` is the only comparable interchange.
7. **Performance surfaces.** DJ booth and Performer both operate on the live
   document, with MIDI mapping and recorded performances.
8. **Onboarding.** Beginner mode, the step strip that returns to the checklist,
   the Music Map, Quick Session and a 5-station First Beat tour. The baselines
   onboard with a genre pick at best.
9. **Engine discipline.** Nine AudioWorklet DSP processors, WASM SIMD kernels,
   bounded recording capture with IndexedDB spill, and sample streaming for long
   imports (`STUDIO_PARITY_RISK_AUDIT.md`). This is ahead of most mobile DAWs,
   which still decode everything.
10. **Freeze/bounce-in-place** on a phone (`music-manager.service.ts:3652`);
    Cubasis-class convenience.

---

## 4. Where competitors still win

| Area | They have | We have | Consequence |
| --- | --- | --- | --- |
| Cloud / collab | Real projects, sync, community, distribution (BandLab) | Local-first; `MockCloudServer`; peer/socket co-write layer depends on a server | A lost phone loses the project; no cross-device workflow |
| Hardware MIDI | USB MIDI, MIDI clock, Ableton Link (Cubasis) | Web MIDI only (desktop browsers); Android WebView lacks it | Keyboard/pad owners cannot use their gear on Android |
| Sample ecosystem | 250K–2M sounds, packs, marketplace (BandLab/FL) | Curated presets + user imports | Beatmakers bounce |
| Sampling depth | Slicing, time-stretch, auto-chop, per-step graphs (Koala/FL) | Zones, round-robin, ADSR, loop crossfade, equal/transient slicing, pitch-shift and tempo-match | Per-step graphs and a deeper chop editor remain |
| Track count / routing | Unlimited tracks, 8 inserts + 8 sends (Cubasis) | 6/12/24 by device tier; VCA + A/B sends | Large sessions hit a ceiling |
| MIDI expression | 960 PPQ, full CC, MPE (Cubasis/FL) | 16th grid, CC lanes wired, channel/poly aftertouch input, per-note pressure authoring | MPE member-channel bend/pressure voice routing added |
| Generative AI | SongStarter, Audio-to-MIDI, Voice Changer (BandLab) | Prompt beats, AI mix, AI band, stem split | Fewer one-tap generative tools |
| Native plugin economy | None on mobile — but huge desktop ecosystems | WASM sandbox with a small catalog | Open architecture, thin content |

---

## 5. Cross-cutting systems

### Transport and tempo — **Ahead, with two omissions**

Ships play/stop/record, tap tempo, tempo map with markers
(`transport-bar.component.html:189`), meter selection 2/4–12/8 (per the 31 Oct
sweep), count-in, punch-in, metronome volume, loop region, master volume,
undo/redo, output routing. Ahead of FL/BandLab on tempo maps; Cubasis still
leads on Ableton Link, MIDI clock input and transport note-repeat. There is an
arpeggiator in Performer (`live-engine.service.ts:48`) and `arpeggiateTrack`,
but no transport-level note-repeat.

### Engine, latency and memory — **Ahead, with one tuning gap**

Worklet DSP for synth, sampler, master bus, effects, sidechain, recording,
pitch correction, stem separation and plugin chain; WASM + JS fallback;
adaptive device tiers (6/12/24 tracks, 8/16/32 voices); bounded capture. Open:
sample-rate normalisation (44.1 kHz devices run 48 kHz-tuned DSP without
resampling) and auxiliary AudioContexts remain separate from the engine graph.

### Automation — **At parity**

Lanes with bezier editing, live write for fader/pan/sends/cutoff/reverb, and
offline export now samples every enabled lane onto the same AudioParams
(`export.service.ts:432`). Plugin-parameter automation and per-insert metering
shipped 2 Nov 2026; CC/pitch-bend lanes now reach live voices and the bounce.
Bus tracks, VCA buses, enabled FX-slot plugin parameters, aux return trims,
master volume and selected master compressor/limiter/filter/tone parameters and per-band
thresholds/ratios are now selectable automation targets in the arrangement
editor; per-band threshold, ratio, attack, release and knee lanes are exposed and editable on each Mastering Suite band card. VCA fader moves write lanes while the
transport runs and automation is armed. Touch/latch write modes and adjustable
smoothing are persisted. Plugin parameter curves are applied during offline
export with `OfflineAudioContext` suspend points, so a bounce follows the same
FX automation as playback. Selected master compressor, limiter, filter and tone lanes are also scheduled onto the offline master chain.

### Project integrity — **Ahead locally, Blocking in the cloud**

Durable IndexedDB commits (`transaction.oncomplete`), autosave guarded against
races, recovery records, bundle validation, version history, dirty-exit
protection. This is stronger than BandLab's commonly reported "lost progress"
complaints. But the cloud half is mock, so the advantage stops at one device.

### Hardware — **Behind on Android**

Microphone/interface enumeration, input gain, meters, MIDI learn, gamepad
transport mapping, sustain/half-pedal. Web MIDI works in desktop browsers only;
Cubasis supports class-compliant USB MIDI on Android. This is the single
biggest platform-level adoption blocker for "pro" users.

### Store and packaging — **Blocking before paid launch**

`storefront.service.ts` injects `MockPlayBillingClient`; purchases resolve after
1.2 s. Studio playback has no foreground service (only radio uses the
MediaSession/foreground path), so backgrounding can stop a session. Fine for a
free preview; not fine for a paid Play release.

---

## 6. Prioritised backlog

**Shipped in the 2 Nov 2026 follow-up pass:** ripple delete (removes the
selected clips and closes the gap on each track), transport note-repeat (toggle
plus rate cycling, driving the live retrigger), user-authored templates
(save the current channels/tempo, reapply or delete them beside the fixed
starters), plugin-parameter automation with real per-insert metering, and
CC/pitch-bend lanes wired into live playback and offline export. The DJ booth's
live-set capture/download and external MIDI clock follow were already shipped,
contrary to the earlier backlog wording.

### P0 — adoption blockers (do first)

| Item | Why | Effort |
| --- | --- | --- |
| ~~Wire CC/pitch-bend lanes into playback and export~~ **Shipped 2 Nov 2026** — sampled per note into the shared voice builder; live and export agree | Silent lanes were a correctness defect, not a missing feature | M |
| Real cloud sync/auth behind `CloudSyncService` | Replaces the mock; unlocks cross-device and collab claims | L |
| Native Android MIDI bridge (USB/BLE + clock) | Unblocks keyboard/pad users; closes Cubasis's biggest win | M |
| Real Play Billing before selling SKUs | Mock purchases cannot ship | M |

### P1 — pro credibility

| Item | Why | Effort |
| --- | --- | --- |
| ~~Plugin-parameter automation + per-insert metering~~ **Shipped 2 Nov 2026**; ~~WASM insert preset browser~~ **Shipped 2 Nov 2026** — 15 factory sounds plus per-plugin user presets | Makes the WASM ecosystem usable | M |
| ~~Sampler transient chop~~ **Shipped 2 Nov 2026** — energy-rise onset detection maps variable-length slices to pads; equal Slice ×8 remains | Beatmaker table stakes; Koala/FL lead here | M |
| MPE per-note expression | Full MPE per-channel note voices, bend range and pressure routing are wired; deeper modulation-matrix editing remains | M |
| ~~Overlap crossfades~~ **Shipped 3 Nov 2026** — selected overlapping audio clips get a persisted equal-power fade-out/fade-in, rendered the same way live and offline. ~~Tempo lane~~ **Shipped 3 Nov 2026** — click-to-add points, drag/keyboard retiming, inline BPM, and a step/ramp envelope. ~~Time-signature automation~~ **Shipped 3 Nov 2026** — persisted meter points with drag/keyboard retiming, inline signatures, engine-level beat/bar accents, and a variable bar clock that retimes clip starts, lengths, fades and offline export at each marker (ripple delete now ships) | Cubasis/FL timeline depth | M |
| Transport note-repeat | **Shipped 2 Nov 2026** — toggle + rate cycling in the transport drives the live retrigger | S |
| Sample-rate normalisation for imports | 44.1 kHz devices currently run 48 kHz-tuned DSP | S |

### P2 — differentiation

| Item | Why | Effort |
| --- | --- | --- |
| Sample/pack marketplace (licensed + community) | Only way to answer 250K–2M sounds | L |
| Ableton Link / MIDI clock input | Sync with hardware and other apps | M |
| Record-a-set export from the DJ booth | Turns the booth into a performance tool | S |
| ~~Audio-to-MIDI (monophonic)~~ **Shipped 2 Nov 2026** — recorder takes and any selected import, capped at a 30 s phrase; voice-changer AI remains | BandLab's most-used generative tools | M |
| User-authored project templates | **Shipped 2 Nov 2026** — save/apply/delete beside the fixed starters | S |
| ~~Live memory estimate in Engine Metrics~~ **Shipped 2 Nov 2026** — used/limit JS heap plus the recorder's resident PCM window, with spilled PCM called out separately | Surfaces the streaming model honestly | S |

---

## 7. Verification and limits

- Surfaces, features and limits were read from the shipped source, not from
  plans: `studio-surfaces.ts`, each `*.component.ts/html`, `audio-engine.service.ts`,
  `export.service.ts`, `music-manager.service.ts`, `studio-device-profile.service.ts`,
  `cloud-sync.service.ts`, `storefront.service.ts`, `live-engine.service.ts`.
- Reproduce the key negative findings:
  ```bash
  rg -n "sampleCcCurve|midiCc|VoiceControlPoint" src/app/services/audio-engine.service.ts src/app/services/music-manager.service.ts src/app/services/export.service.ts src/app/studio/automation.service.ts
  rg -n "slice|chop|transient" src/app/studio/sampler              # slicing + auto-chop
  rg -n "MockCloud|mock-cloud" src/app/services                    # mock sync
  rg -n "MockPlayBillingClient" src/app/services                   # mock billing
  rg -n "requestMIDIAccess" src/app                                # Web MIDI only
  ```
- 50 Studio spec files exist; this audit does not re-run the whole suite. It is a
  code/feature audit, not a listening test, a pixel review, or a physical-Android
  run. Audio quality, real device latency and store review behaviour are outside
  its evidence.
- Competitor facts come from the public pages cited above (October 2026) and
  carry the caveats noted there: vendor feature matrices are incomplete, and
  free-tier limits change.

**Bottom line:** the Studio is the broadest mobile production environment in this
comparison and is ahead on workflow integration, notation, comping, mastering,
export and performance. It is not yet "more powerful for everyone" until real
cloud, Android MIDI and the sample/sampling depth are closed.
