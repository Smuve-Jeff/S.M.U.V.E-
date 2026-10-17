# Studio Parity Risk Audit — top Play store DAWs

*Audit date: 2026-10-16 · Scope: the 8 risk areas raised for Play-store parity
(latency/CPU, memory + sample streaming, battery/thermal, background recording,
audio I/O + device compatibility, touch UX, instrument quality, licensing).*

Method: read the shipped code, not the plan. Every finding below names the file
and line the claim comes from, so the same claims can be re-checked after a fix.
Where a risk is already closed by existing work it is marked **SHIPPED** — the
goal of this document is to stop us re-solving solved problems and to price the
ones that are still open.

Reproduce the evidence:

```bash
# AudioWorklet DSP surface
rg -n "addModule|new AudioWorkletNode" src/app src/assets/worklets
# Main-thread DSP call sites (only the no-Web-Audio capability shim is left)
rg -n "createScriptProcessor" src/app --glob '!*.spec.ts'
# WASM kernels + SIMD build
rg -n "simd128|EXPORTED_FUNCTIONS" scripts/build-wasm.sh
# Memory model: every sample fully decoded to an AudioBuffer
rg -n "decodeAudioData" src/app
# Recording take: streamed out of the capture buffer, never reassembled
rg -n "drainGroups|WavStreamWriter|recordedPeaks" src/app/studio --glob '!*.spec.ts'
# Native shell
cat android/app/src/main/AndroidManifest.xml
```

---

## 1. Real-time latency & CPU — **SHIPPED for main-thread DSP** (two smaller gaps open)

**Already shipped.** Critical DSP already leaves the main thread: nine worklet
processors in `src/assets/worklets/` (synth, sampler, master bus, effects,
sidechain, recording, pitch corrector, stem separator, plugin chain) plus the generic
`src/assets/audio-processor.worklet.js`, wired
from `sampler.ts:79`, `subtractive-synth.ts:86`, `audio-engine.service.ts:836`
(master) and `:3071` (sidechain), `effects/dynamic-effects-rack.ts:351`,
`pitch-correction.service.ts:126`, `studio-recording-engine.service.ts:77`,
`stem-separation.service.ts:405`. The engine detects a host without
AudioWorklet and degrades loudly to a `setInterval` scheduler
(`audio-engine.service.ts:732`, `:1053`) instead of silently failing. WASM is a
first-class path: `studio/wasm/wasm-loader.service.ts` (fetch + instantiate,
JS fallback), JS kernels in `studio/wasm/wasm-dsp-kernels.ts`, C kernels with
`-msimd128` in `scripts/build-wasm.sh:68` and `studio/wasm/c/*.cpp`.

**Closed in this pass — the live plugin chain ran on the main thread.** This was
the single highest-ROI item in the audit. A 512-frame `createScriptProcessor`
block at 48 kHz is ~10.7 ms of kernel work done on the thread that renders the
arrangement, the piano roll and the mixer, so every enabled plugin made
note-entry jitter worse — the "feels cheap on Android" symptom.

| Was (line at audit time) | Disposition |
| --- | --- |
| Master-bus plugin insert, spliced after the width stage (`:2041`) | now the `plugin-chain-processor` worklet |
| Per-track plugin insert (`:2729`) | now the `plugin-chain-processor` worklet |
| Master-bus plugin insert, legacy splice at `masterGain` (`:2789`) | **deleted** — superseded by the width-preserving insert and called from nowhere but its own spec |
| Row 4 (`:2569`), listed here as a "sidechain tap" | **corrected:** that line was the dither noise generator, not a sidechain tap. It is now a looping `AudioBufferSourceNode` |

`rg -n "createScriptProcessor" src/app --glob '!*.spec.ts'` now matches only
`createSilentAudioContext()`, the capability shim the engine hands to callers in
a host with no Web Audio at all — never a live DSP path. See §9f for the design,
and for the parity spec that keeps the worklet's DSP identical to the kernels the
offline render uses.

**Open — low-power adaptation was wired to nothing.** `performanceTier` only
ever changed via `updateAdaptivePerformance(load)`
(`audio-engine.service.ts:3031`), which had **no caller anywhere in the app**:
`rg -n "updateAdaptivePerformance"` matched the definition only. So every device
booted at `ultra`. The Studio already reacts correctly when the tier *does*
change — `studio.component.ts:1375-1403` disables Stage FX with an explanatory
snackbar and `studioClass` switches to `studio-perf`. Closed in this pass by
`StudioDeviceProfileService` (see §9).

**Closed in this pass — six extra AudioContexts** (see §9e). Every non-engine
graph used to call `new AudioContext()` with no `latencyHint`
(`cowrite.service.ts:317`, `vocal-ai.service.ts:112`,
`peer-networking.service.ts:227`, `stem-separation.service.ts:422`,
`audio-recorder-view.component.ts:674`, `haptic.service.ts:222`), so each one
asked the host for an interactive (small-buffer, CPU-hungry) output stream that
competes with the primary engine for the audio device. Each site now states its
latency intent, decode-only work shares a single playback-hinted context instead
of opening one per call, and the two graphs that stayed open for the life of the
app (the call analyser and the separation worklet context) are closed when their
work ends.

**Still open on this item:** the auxiliary contexts are still *separate* from
the engine's (`audioEngine.ctx`), so a call or a separation run still adds an
output stream rather than reusing the one the Studio already has. Merging them
is the larger fix — it means routing co-write preview and input monitoring
through the engine graph, which is a design change, not a `latencyHint`.

**Open — mid-range micro-optimisation.** `sampleRate` is never normalised: a
44.1 kHz device runs the 48 kHz-tuned DSP without resampling. Reuse the existing
`AudioEngineLatencyService` sample-rate warning
(`audio-engine-latency.service.ts:317`) as the trigger for a one-time
`OfflineAudioContext` resample of imported stems.

## 2. Memory & sample streaming — **OPEN** (everything is fully decoded)

`decodeAudioData` appears in 20+ places (`file-loader.service.ts:64/81/133`,
`library.service.ts:59`, `audio-import.service.ts:770`,
`arrangement-view.component.ts:1037`, `vocal-suite.component.ts:294`,
`drum-machine.component.ts:1442`, `sampler.ts` load path, …). Every import is
decoded to a full PCM `AudioBuffer` in the JS heap and then shipped whole to the
worklet (`sampler.ts:129` and `:167` post the entire `Float32Array`).
`src/assets` is only 2.5 MB and `src/assets/instruments` is 8 KB, so today this
is an **imported-material** problem rather than a bundled-bank problem: a
5-minute 48 kHz stereo stem is ~115 MB decoded (14.4 M frames × 2 ch × 4 B),
and a 12-track arrangement of imported stems is ~1.4 GB before any effects —
far past what a mobile WebView heap survives, even on a 4 GB phone.

**Shipped — the recording capture buffer is now bounded.** The engine used to
push every render quantum into `leftChannel`/`rightChannel` and never spill,
cap or page it: ~23 MB of Float32 per minute, ~1.4 GB for a 60-minute session,
with the join at `stopRecording()` doubling the peak transiently. It now
captures into `RecordingCaptureBuffer`, which holds a 64 MB resident window
(≈2.8 min of 48 kHz stereo) and spills the overflow to IndexedDB; the take is
encoded group by group straight out of the store and the resident window, so it
is never reassembled — see §9. A failed or unavailable spill puts its chunks
back in memory rather than dropping audio, so the worst case is the old
behaviour, never a truncated take.

**Also shipped — the stop-time join is gone, and so is the rehydration. The
take is encoded as it streams.** `stopRecording()` walks the capture buffer's
groups and feeds a `WavStreamWriter` (`wav-stream-encoder.util.ts`, §9b), so the
PCM is never joined into two contiguous `Float32Array`s and never held as a
second copy. Each spilled group is **unlinked from IndexedDB the moment its
bytes are in the WAV**, so the end-of-take footprint is the bounded resident
window (~64 MB) plus the encoded file itself: for the 60-minute 48 kHz stereo
case above, ~750 MB at stop against ~2.1 GB before (the whole performance pulled
back into memory as PCM, with the encoded file built beside it), and during the
take itself ~64 MB rather than ~1.4 GB. Nothing is rebuilt or re-decoded, and
there is no longer a spike at the instant the artist presses stop. The per-channel peak is measured during that same encode, so the
comp lane reads a level instead of decoding or re-scanning the performance.

**Still open:**
1. ~~A `SampleStreamer` for long imports: keep a bounded preview buffer resident,~~
   **shipped (`src/app/services/sample-streamer.service.ts` +
   `src/app/studio/audio-import.service.ts` +
   `src/app/services/music-manager.service.ts` +
   `src/app/services/audio-engine.service.ts`):** a bounded preview buffer is
   resident for long imports (>10 s), playback windows are served from the stored
   file via `AudioBufferSourceNode` slices, and the worklet sampler is kept for
   short one-shots only. Import-side and playback-side wiring are both connected:
   the import path probes the file to attach the real sample rate / channel count,
   the resident window is surfaced through `ImportedAudio.sampleStreamer`,
   `addToProject` stamps `clipStreamer` (`clipOriginSeconds`,
   `clipLengthSeconds`, `clipSampleRate`, `clipChannels`) onto the arrangement
   clip, and `playStep` / `triggerSampler` schedule from the streamer's resident
   window while advancing its playhead.
2. Surface a live memory estimate (resident bytes from the capture buffer, plus
   `performance.memory` where available) in the Engine Metrics card so the
   artist sees the wall before they hit it.

## 3. Battery / thermal — **PARTIAL**

Visual work is the main main-thread cost and it is already tiered: the DJ deck
drops its scopes to 30 fps on mobile/low-power
(`dj-deck.component.ts:385`, `:437`), `UIService.isLowPower`
(`ui.service.ts:86`) drives the `perf-mode-active` body class, and the Studio
has a `studio-ultra` / `studio-perf` shell split (`studio.component.ts:979`).
**Open:** the low-power switch was manual only (user had to find Settings) —
now auto-seeded from the detected device class (§9). Still open: no thermal
signal. Web has no thermal API, so the honest proxy is *sustained* benchmark
degradation — `runOfflineBenchmark()` already exists
(`audio-engine-latency.service.ts:156`) and its rolling window
(`recentBenchmarks`) can be compared first-vs-last to detect throttling and
drop a tier.

## 4. Background recording / long-running tasks — **PARTIAL** (playback shipped, capture open)

**Already shipped:** background *playback* is real, not a WebView trick.
`radio-background-audio.service.ts:29-96` binds
`@mediagrid/capacitor-native-audio`, and `AndroidManifest.xml` declares the
`MediaSessionService` with `android:foregroundServiceType="mediaPlayback"`, the
matching `FOREGROUND_SERVICE_MEDIA_PLAYBACK` permission, `WAKE_LOCK` and
`POST_NOTIFICATIONS`.

**Shipped — the take no longer dies with the process.** The session already
answered `visibilitychange` by stopping the transport (`AudioSessionService`
`handleVisibilityChange`), but the save was fire-and-forget:
`MusicManagerService.stopRecording()` called
`this.recordingEngine.stopRecording()` and returned `Promise.resolve(null)`, so
nothing could know whether the worklet had flushed, the WAV was encoded or
IndexedDB had committed — a WebView frozen mid-flush lost the performance while
every caller reported success. Now (§9c): the promise is awaited; `freeze`
(Page Lifecycle API — fires just before the WebView is suspended) and `pagehide`
(which covers tab discard/swipe-away, where `visibilitychange` never fires) both
finalize a live session through the same path; a capture that outlived the
transport is caught too; and the in-flight save is exposed so a caller can await
durability.

**Still open — capture cannot *continue* in the background.** The manifest
declares `RECORD_AUDIO` but **no `FOREGROUND_SERVICE_MICROPHONE` permission and
no service with `foregroundServiceType="microphone"`**, which is what Android 14
requires for a microphone foreground service. `StudioRecordingEngineService` is
pure Web Audio + `MediaStream` with no native keep-alive, so backgrounding ends
the pass (safely, now) instead of continuing it. **Fix:** a mic foreground
service (native plugin, or the `@capacitor/local-notifications` + FGS pairing
scoped in `docs/CAPACITOR_PLUGIN_AUDIT.md:42`), the
`FOREGROUND_SERVICE_MICROPHONE` permission and a `microphone` FGS declaration.
That is native work this repository cannot verify without an Android build.

## 5. Audio I/O permissions & device compatibility — **PARTIAL**

Capture already asks for the right constraints — `echoCancellation: false`,
`noiseSuppression: false`, `autoGainControl: false`
(`studio-recording-engine.service.ts:62-70`) — which is what a DAW needs and
what most web apps get wrong. A headless/no-mic host is classified as an
environment, not a fault (`NotFoundError` → warn, `:118`).
**Open:** the touchy part is measurement, and it is unmeasured. There is no
recorded per-device latency baseline. `AudioEngineLatencyService` can already
capture `baseLatency`/`outputLatency` and its headroom hint
(`audio-engine-latency.service.ts:126`), and the
`latencyCompensation` profile setting exists — but nothing writes a baseline
from a real device run. **Fix:** an in-app "calibrate this device" action that
persists `{ deviceModel, apiLevel, totalLatencyMs, benchmarkSpeedRatio }` into
the profile, then use it to pre-fill compensation.

## 6. UX polish & touch ergonomics — **PARTIAL**

Covered by real work: `enhanced-touch-gesture.service.ts`,
`studio/shared/platform-ux.css`, `tests/e2e/studio-touch-gestures.spec.ts`, the
touch-oriented sound-pad grids, and the shipped 5-step onboarding tour (Master
Plan C3). **Open:** the not-yet-covered ergonomics are the fine-motor surfaces —
piano-roll note resize/velocity drag, arrangement clip trim/loop handles, and
mixer fader precision on a 5" screen. These are CSS/`pointer`-level fixes, not
architecture, and they are the cheapest competitor-visible win in the list
(`touch-action`, larger hit targets, long-press context menus, haptic confirm on
`haptic.service.ts`).

## 7. Instrument / plugin sound quality — **PARTIAL**

The JS→WASM duality is already honest: `wasm-dsp-kernels.ts:6` documents that the
JS kernels are the reference implementation and `saturation.cpp:6` mirrors them
"exactly", with `WasmLoaderService` falling back automatically and the UI
badging the runtime (`plugin-store.component.html:19-25`). **Open:** quality
upside is still on the table in two places — (a) the C kernels are a subset
(dynamics, EQ, saturation, master chain, algorithmic reverb) while granular /
convolution / wavetable interpolation remain JS
(`studio/granular-synth.ts`, `studio/wavetable-synth.ts`,
`studio/effects/convolution-reverb.service.ts`), and (b) there is no bundled
instrument content at all (`src/assets/instruments` is 8 KB of presets), so
"ship curated sample banks or native-rendered synths" is untouched. The store's
sound-pack SKUs are a seeded catalog (`docs/MASTER_PLAN.md` C2) and need a real
content pipeline before they can be sold.

## 8. Legal / licensing — **OPEN (cheap to close, expensive to skip)**

There is **no `LICENSE` and no `NOTICE`/`THIRD_PARTY_NOTICES` file at the
repository root**, yet the app bundles third-party audio code
(`@mediagrid/capacitor-native-audio`, `onnxruntime-web`, `tone`) and ships an
`AndroidManifest.xml` with `com.google.android.gms.permission.AD_ID`
(advertising ID) in a paid DAW. **Fix:** an in-repo attribution file generated
from `package.json` licenses, a decision recorded on the AD_ID permission
(remove it outright unless an ads SDK genuinely ships — Play asks about it on
the Data Safety form), and a provenance note for every sample bank before the
first bank is commercially distributed.

---

## Prioritized backlog

| # | Item | Area | Effort | Payoff |
| --- | --- | --- | --- | --- |
| P0 | ~~Move the live plugin chain (track + master inserts) from `ScriptProcessor` to an AudioWorklet hosting the existing kernels~~ **shipped (§9f)** | 1 | — | No main-thread DSP left in the engine; input→output jitter on Android |
| P0 | ~~Bound / page the recording capture buffer before it OOMs a 3 GB phone~~ **shipped (§9)** | 2 | — | Long takes no longer crash the WebView |
| P1 | ~~Stream the WAV encode from the collected chunks (removes the stop-time join)~~ **shipped (§9b)** | 2 | — | Stop-time peak is the take, not 2× it |
| P0 | Microphone foreground service so capture *continues* while backgrounded (permission + `microphone` FGS type + native plugin) | 4 | 1–2 d | Recording parity with FL Mobile / Cubasis |
| P1 | ~~Backgrounding silently destroyed a live take~~ **shipped (§9c)**: durable finalize on hidden/freeze/pagehide; the engine's stop promise is no longer dropped | 4 | — | The captured audio survives backgrounding |
| P1 | **Shipped in this pass:** device-class detection driving the adaptive engine tier (§9) | 1, 3 | — | Low-end devices stop booting the full budget |
| P1 | ~~Cap the "extra AudioContext" count / pass `latencyHint` at the six non-engine call sites~~ **shipped (§9e)** | 1, 3 | — | Every auxiliary graph states its latency intent; decode work shares one context; call/separation graphs are released |
| P1 | ~~Sample streaming for long imports (bounded preview + windowed playback)~~ **shipped (§2)**: `SampleStreamer` resident window + clip-streamer admission & playback coupling | 2 | — | Multi-stem projects on low-RAM devices |
| P1 | Device calibration run persisted into the profile (latency baseline per model/API level) | 5 | 1 d | Accurate record compensation without guesswork |
| P2 | Piano-roll / arrangement / mixer touch ergonomics pass | 6 | 2–3 d | Visible polish; table stakes vs the leaders |
| P2 | Granular / convolution / wavetable kernels to WASM with SIMD | 7 | 3–5 d | Quality + CPU on the heaviest instruments |
| P2 | `LICENSE` + third-party notices + AD_ID decision | 8 | 0.5 d | Play Data Safety + legal hygiene |
| P3 | Thermal-proxy tiering from the rolling benchmark window | 1, 3 | 1 d | Sustained-session stability |
| P3 | Curated sample-bank content pipeline | 7 | — | Commercial content store |

## Measurement plan (what to run, and what "good" is)

Nothing in this document should be closed by opinion; each P0/P1 item has a
number attached:

| Metric | Target | How |
| --- | --- | --- |
| Round-trip latency (input → monitored output) | < 20 ms musician-acceptable, < 30 ms OK | `AudioEngineLatencyService.captureSnapshot()` on device; `/produce` Engine Metrics card already renders it |
| Concurrent tracks + live plugin inserts before audible glitching | ≥ 8 tracks / ≥ 4 inserts on a mid phone | Load a fixed 8-track project, sweep plugin count, log dropouts |
| Offline render speed ratio | ≥ 1.0 (faster than real-time) | `runOfflineBenchmark(1)` — existing rolling window |
| Memory with a representative 5-minute multi-stem project | < 400 MB and flat over 10 min | Chrome DevTools memory timeline over USB + Capacitor WebView debugging |
| Battery | < 8 %/h playback, < 15 %/h with capture armed | `adb shell dumpsys batterystats` before/after a scripted 30-minute session |
| Tier stability | No unintended tier flips in a 30-minute session | `StudioDeviceProfileService.profile()` + the DEVICE reason list in Engine Metrics |

Device matrix to run before the next Play upload: the capacitor config targets
API 36 (`capacitor.config.ts`), so cover at least one API 33/34 device (the
Android 14 FGS-type rules), one budget device (≤ 4 cores / 3 GB), one mid phone
and one tablet — plus the WebView-only path with AudioWorklet disabled, which is
what `StudioDeviceProfileService` now classifies.

## 9. Delivered in this pass

### 9a. Bounded recording capture (`RecordingCaptureBuffer`)

`src/app/studio/recording-capture-buffer.ts` (+ `recording-spill.store.ts`,
`recording_chunks` store, DB v8) — the recording engine no longer holds a whole
session in RAM:

- Resident PCM is capped at 64 MB; overflow is spilled **oldest first**, one
  group in flight at a time, so spilled records are contiguous and always older
  than anything resident. `drainGroups()` streams records-by-index followed by
  the resident window, i.e. capture order, with no gap when a spill happened
  mid-take, and unlinks each record once its group has been handed to the
  encoder.
- `IdbRecordingSpillStore` **verifies each write**: `LocalStorageService.saveItem()`
  is a deliberate silent no-op when IndexedDB is missing/blocked, which would
  otherwise let the buffer discard audio it never stored. The store checks
  `persistenceStatus()` first and reads the record back, throwing on either
  failure — the buffer then restores the chunks in front of the resident queue
  and stops spilling for that take.
- `clear()`/`beginSession()` filter by `sessionId`, so finishing one take can
  never unlink another take's audio; each new take retires the previous
  session's chunks in the background once its WAV exists.
- Tests: 10 in `recording-capture-buffer.spec.ts` (budget, ordering, no-spill
  store, write-failure recovery, session retirement, release, streaming the take
  out of the store while unlinking each group, no double yield on a second
  drain, channel mirroring)
  and 6 in `recording-spill.store.spec.ts` (write verification, blocked
  persistence, per-session read/clear isolation), plus an end-to-end engine test
  in `studio-recording-engine.service.spec.ts` that drives the real worklet
  message path with a tiny budget and asserts the finished WAV still carries
  every captured frame.

### 9b. Streaming WAV encode + per-take peaks (`WavStreamWriter`)

`src/app/studio/wav-stream-encoder.util.ts` — the take is encoded as it streams
out of the capture buffer instead of being joined and encoded in one pass.
`StudioRecordingEngineService.stopRecording()` walks `capture.drainGroups()` and
pushes each group into a `WavStreamWriter`, so the stop-time allocation is one
group rather than the whole file, and the take is never reassembled.

- Each group becomes its own Blob part, and the **header is written from the
  frames that actually arrived** (`end()`), so a RIFF length that disagrees with
  the data chunk is unrepresentable. The old shape — join the take, allocate
  the encoded copy, write a header from a frame count the caller tracked
  separately — could report a length the data chunk did not have.
- `drainGroups()` **unlinks each spilled record as its bytes land in the WAV**,
  so a 60-minute take does not leave its PCM on IndexedDB after the file exists.
  Unlinking is by record id (`CaptureSpillStore.remove`), not a full store read
  per group, and a failed unlink is recorded (a storage leak) rather than thrown
  — the caller already holds the audio.
- The writer **measures each channel's peak as it writes** (`stats.peakLeft` /
  `peakRight`, converted by `peakDbFs()`), published as
  `recordingEngine.recordedPeaks()`. `SmartRecordingService` comp captures read
  `recordedBlob()` + `recordedPeaks()` and now only rehydrate
  (`getRecordedBuffers()`) as a fallback for the case where the engine produced
  no blob at all — a long comp pass no longer pays for a second copy of itself.
- `WavStreamEncoder` (chunk-array in, Blob out) is kept as the thin wrapper the
  other capture callers use; it and the writer are **proven byte-identical** to
  `WavEncoder.encodeMultiChannel(joined, …)`: 7 spec cases compare raw bytes
  across uniform chunks, ragged/odd chunk boundaries (what a 50 ms worklet chunk
  plus a short flush actually produces), mono, the 16-bit clamp/scale range,
  group-by-group feeding, and non-`wav-16` formats. Anything the streaming path
  cannot prove identical (different chunk layouts per channel) falls back to the
  contiguous encoder rather than guessing.
- `end()` is idempotent, so a retried save reuses the finished file instead of
  building a second copy, a group whose channels do not line up is rejected
  rather than silently interleaved wrong, and a mono writer mirrors its one
  channel as the right peak. 14 spec cases in
  `wav-stream-encoder.util.spec.ts`.
- The engine spec keeps the end-to-end guarantee: the same performance run
  through a 64-byte budget (spilling) and through a 64 MB budget (no spill)
  produces **byte-identical take audio**, the spilled record is unlinked once
  the take is out, and the finished blob is published with its measured peaks;
  `smart-recording.spec.ts` covers the comp lane taking that streamed blob and
  its peaks instead of calling `getRecordedBuffers()`.

### 9c. Background-safe take finalize

`audio-session.service.ts` + `music-manager.service.ts`:

- `MusicManagerService.stopRecording()` now **awaits** the recording engine
  (worklet FLUSH → WAV encode → IndexedDB commit) instead of dropping that
  promise and resolving instantly, so "the take is saved" is a statement a
  caller can act on. Guarded, so the empty engine doubles in the existing specs
  stay valid.
- `AudioSessionService` finalizes a live session on `freeze` and `pagehide` in
  addition to `visibilitychange`, and the guard now also catches a capture graph
  that outlived the transport (`recordingEngine.isRecording()`, which is the
  case for a pass started outside the record button). `lastBackgroundStopAt`
  records when it happened so the Studio can explain why the transport stopped,
  and `whenTakeSaved()` resolves once the audio is durable.
- Tests: 6 new cases (pagehide saves a live pass, freeze saves, a capture that
  outlived the transport is caught, an idle session is left alone, a pass that
  captured nothing is *not* faked as saved, and the save promise really gates on
  the engine), plus 2 in `music-manager.service.spec.ts` pinning that
  `stopRecording()` resolves only after the engine's stop settles, and resolves
  without throwing against a double with no `stopRecording`.

### 9d. Device capability detection (`StudioDeviceProfileService`)

`src/app/services/studio-device-profile.service.ts` — capability classifier +
budget, wired into the Studio Engine Metrics card. It closes the "detection"
half of the low-power item:

- Deterministic classification from `hardwareConcurrency`, `deviceMemory`,
  mobile WebView, AudioWorklet availability, WebAssembly + SIMD validation
  (standard `wasm-feature-detect` probe), Data Saver and reduced-motion.
- Per-tier budgets (`high` 32 voices / 8 effects / 24 tracks → `low` 8 / 2 / 6)
  that consumers can opt into.
- It is the missing caller of `AudioEngineService.updateAdaptivePerformance()`:
  a ground-floor device now boots at the `performance` tier, which the Studio
  already handles (`studio.component.ts:1375` disables Stage FX and explains
  why; the shell switches to `studio-perf`). Mid phones deliberately keep
  `ultra` plus a smaller budget, so the common device is not punished.
- Engine Metrics gained `Device class` + `Voice budget` cells and a `DEVICE`
  reason list, so a tier change is never unexplained.
- 13 unit tests (`studio-device-profile.service.spec.ts`) pin the tier
  boundaries, the safe fallback for browsers that report nothing, the
  AudioWorklet/Data-Saver downgrades, and the engine wiring.

**Still open on this item:** nothing consumes `budget()` to actually *enforce*
the voice/effects ceilings yet. The integration point is the instrument
constructors, which hardcode polyphony today
(`wavetable-synth.ts:45` `super(audioContext, 10)`, `drum-machine.ts:27`
`super(context, 32)`, `advanced-synth.ts:82` `super(audioContext, 8)`); they take
an `AudioContext`, not DI, so enforcement needs a small factory/service that
injects the budget at construction time.

### 9e. Auxiliary audio-graph policy (`AuxAudioContextService`)

`src/app/services/aux-audio-context.service.ts` — the single place the
non-engine graphs are created, so "what buffer does this ask for, and when is it
torn down" is one decision instead of six copies:

- `analysisContext()` — one shared, playback-hinted context for work that only
decodes or measures. `VocalAiService.describeVocalTake()` used to build and
discard a whole interactive output stream per uploaded take; it now decodes on
the shared one, which is never connected to the destination and so never
competes for playback.
- `createAuxContext(hint)` — an owned, one-shot context, defaulting to
  `'playback'` because a stale interactive stream is the costly mistake. The
call voice-activity analyser and the stem-separation worklet both ask for it;
both used to leave their context open for the life of the app.
- `attachSilentSink()` — a zero-gain path to the destination. Web Audio only
pulls a node that reaches the destination, so the call analyser (and a
`numberOfInputs: 0` worklet) reported silence until it was wired through this;
the recording engine already relied on the same trick.
- The graphs a human hears immediately keep constructing inline with an explicit
  `{ latencyHint: 'interactive' }` — the co-write preview, the haptic feedback
click and the recorder's input monitoring — and the policy's doc comment says
why, so the reasoning lives in one place rather than in three comments.
- `PeerNetworkingService.endCall()` now closes the analyser context (it stayed
open and running for the life of the app after the first call) and the
separation worklet closes its context on every exit path (success, message
error, module-load failure).
- 6 unit tests (`aux-audio-context.service.spec.ts`) pin the default hint, the
  explicit-interactive pass-through, the shared analysis instance, the zero-gain
  sink, the degrade-to-`null` path when the graph cannot be wired, and full
  release on destroy.

### 9f. Live plugin inserts hosted on the audio thread (`plugin-chain-processor`)

`src/assets/worklets/plugin-chain-processor.worklet.js` hosts the plugin
framework's DSP for both insert points, and the engine hosts the node:

- **Kernels, not closures.** An AudioWorklet cannot receive JS closures, so the
  chain crosses the thread as data — `{ type: 'chain', slots: [{ id, kernel,
  params }] }` — and the worklet resolves `kernel` by name (`compressor`,
  `limiter`, `eq`, `saturate`, `process`, the monolithic mastering chain).
  `LivePluginSlot` / `LivePluginChainProvider`
  (`audio-engine.service.ts`) are the hand-off types;
  `PluginStoreService.liveInsertSlot(id)` builds a slot from a manifest, so the
  effects rack and the track chain resolve params through one code path.
- **The worklet owns the state.** `wasm-dsp-kernels.ts` declares its compressor
  envelope, biquad memory and limiter gain *inside* the function body, because
  the offline path treats one call as the whole signal. A real-time host cannot:
  a per-quantum reset re-attacks the compressor every 2.7 ms. Each slot is
  therefore built once by a factory that owns its state for the life of the
  chain, and `plugin-chain-processor.spec.ts` pins the first render quantum to
  the offline kernel sample for sample (max diff < 1e-9, every kernel) — the two
  copies of the DSP can no longer drift apart silently. The same spec pins the
  streaming state (gain reduction carries into the next quantum and releases),
  the biquad memory, the mono track path and the pass-through cases.
- **The chain is polled, not pulled from an audio callback.** The providers used
  to be called per render quantum, which was cheap but meant the only way a
  param could reach the DSP was to re-resolve it on the main thread every block.
  Now the engine polls the provider every 200 ms (`PLUGIN_CHAIN_POLL_MS`) and
  posts only a changed signature; the poller stops the moment the insert is
  removed, and `releaseTrackPluginInsert(trackId)` is called by
  `MusicManagerService.removeTrack` so a deleted track does not leave a timer
  behind (undo re-installs it).
- **No main-thread fallback.** When the host has no AudioWorklet the insert is
  not spliced at all, `masterPluginIds` does not change, and the engine logs a
  warning — the same "degrade loudly, never run main-thread DSP" rule §1 states,
  rather than a silent second implementation.
- **Two live-path bugs fell out of the move.** The insert passed an *empty*
  `Float32Array` as kernel params, so the live chain ignored every knob and ran
  on kernel defaults — the params now come from the plugin store. And the
  per-track `onaudioprocess` returned early when its kernel provider resolved
  nothing, *without* writing its output buffer, i.e. enabling a plugin on a track
  silenced that track; an unresolved slot is now the worklet's identity kernel.
  Community plugins were also invisible to the live and offline paths
  (`valuesFor`/`kernelParamsFor`/`loadModule` searched the built-in catalog only);
  they now resolve through `manifestFor`, so an imported plugin's declared kernel
  name and params are honoured.
- 17 new/rewritten engine-spec cases (master splice, chain order and params,
  dry-host behaviour in both directions, no double install, poller re-post and
  stop, identity fallback, track release) plus 4 store cases
  (`plugin-store.service.spec.ts`) and 4 caller cases
  (`music-manager.service.spec.ts`, `effects-rack-ui.component.spec.ts`).
