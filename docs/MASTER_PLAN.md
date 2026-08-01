# S.M.U.V.E. 2.0 — Mobile DAW Supremacy Master Plan

**Goal:** Be the DAW that beats FL Studio Mobile, BandLab, Cubasis 3, n-Track,
Audio Evolution Mobile and Koala Sampler on the Google Play Store — by shipping
every pro feature they have, plus the AI + career ecosystem they can't copy.

This document is the source of truth for prioritization. Every sprint in this
plan is tracked against a **competitor-beating rationale** so we never polish a
feature nobody measures.

---

## 1. Current capability inventory (what we already ship)

S.M.U.V.E. 2.0 Studio today (verified against `src/app/studio`, 205 files,
18 switchable views):

| View | Status | Notes |
| --- | --- | --- |
| Arrangement (timeline) | ✅ | WebGL timeline renderer, clips, VCA/group buses |
| Piano Roll | ✅ | 60fps WebGL, bezier CC lanes, CC readout, MIDI learn, pitch bend lane, sustain/half-pedal |
| Drum Machine | ✅ | Step grid, swing, humanize |
| Mixer | ✅ | Channel strips, sends, VCA rack, master controls, gain-reduction meters |
| Channel Rack / Effects Rack | ✅ | Insert chains, dynamic rack, sidechain, convolution reverb |
| Sampler (v2) | ✅ | Drag-drop import, round-robin, velocity layers, waveform, zone editor, loop handles, worklet engine |
| Synthesizer | ✅ | 6 engines: subtractive, FM, wavetable, granular, physical modeling, advanced |
| Audio Recorder | ✅ | Mic/line capture, component recording, smart recording |
| Performance Mode / Performer | ✅ | MIDI pad grid, velocity layers, pressure-sensitive pads, MIDI mapping |
| Mastering Suite | ✅ | Spectrum analyzer, soft-clip, limiting, AI Mix Master w/ genre presets |
| Stem Separation | ✅ | ONNX Demucs-based (6 stems) |
| Vocal Suite | ✅ | Pitch correction, comp view |
| DJ Deck | ✅ | Deck A/B matrix, MIDI slave sync, BLE-ready |
| MIDI | ✅ | WebMIDI in/out, CC out selector, learn, pitch bend, sustain |
| Offline Bounce / Export | ✅ | WAV encoder, MIDI writer, offline bounce |
| WASM DSP | ✅ | Emscripten kernels (saturation, algorithmic reverb) |

**Unique moat (competitors cannot copy):** the *career ecosystem* — AI
strategic audit, artist DNA, genre presets, stem split + AI mix + master in one
tap, Tha Spot social arcade, and a single subscription that covers studio +
AI + distribution tooling. No DAW on Play bundles a career engine.

---

## 2. Competitor benchmark (Google Play, 2026)

| Capability | FL Studio Mobile | Cubasis 3 | BandLab | n-Track | Audio Evolution | Koala | S.M.U.V.E. today |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Track count | 99+ (CPU) | ∞ | ∞ | ∞ | ∞ | 64 pads | ∞ (CPU) |
| Piano roll depth | ★★★★★ slide notes | ★★★★ | ★★★ | ★★★ | ★★★ | ★★★ | ★★★★ (bezier CC, learn) |
| **Slide / glide notes** | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ **GAP** |
| **Scale guessing** | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ | ⚠️ chord editor only |
| **Time-stretch / pitch-shift** | ✅ (elastique-class) | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ **GAP** |
| Audio comping / takes | ❌ | ✅ | ❌ | ✅ | ✅ | ❌ | ⚠️ comp view, no takes |
| **Loop recording / live looping** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ **GAP** |
| **Song mode / clip launcher** | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ⚠️ arrangement only |
| Score / notation view | ❌ | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ **GAP** |
| VST/AU support | ❌ (iOS AUv3) | ✅ iOS AUv3 | ❌ | ❌ | ❌ | ✅ iOS | ⚠️ WASM plugins (ours is the Android answer) |
| AI mastering | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ✅ **LEAD** (genre presets) |
| AI stem separation | ❌ | ❌ | ✅ cloud | ✅ | ❌ | ❌ | ✅ **LEAD** (on-device ONNX) |
| Real-time collab | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ⚠️ peer-networking skeleton |
| Cloud sync | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ | ⚠️ offline-sync |
| MIDI learn / out | ✅ | ✅ | ⚠️ | ✅ | ✅ | ✅ | ✅ **LEAD** (per-lane CH + learn) |
| Undo history | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Export formats | WAV/MP3/FLAC/OGG/MIDI | WAV/AAC | WAV/MP3 | WAV/MP3/FLAC/OGG | WAV/MP3/FLAC/OGG | WAV | ⚠️ WAV/MIDI only |
| Price | $14.99 | $29.99–49.99 | Free+ads | $4.99/mo | $11.99 | $4.99 | Free + Pro sub (planned) |

**Where we lose today:** time-stretch/pitch, slide notes, loop recording, song
mode, notation, export formats.

**Where we already win:** AI mastering + stem split on-device, MIDI learn/CC
depth, career ecosystem, WASM plugin path (no Android DAW has a WASM plugin
framework; this is our Apple-GarageBand-killer angle).

---

## 3. Master roadmap (beating each app)

### Phase A — Feature parity (Sprints A1–A6)
*Goal: match the top-tier checklist so the comparison table has zero red cells.*

- **A1 — Time-stretch & pitch engine** (WSOLA + resample). Powers tempo match,
  sample pitching, vocal formant tricks, stem remix. ✅ *Sprint 1 of this plan.*
- **A2 — Slide / glide notes in piano roll** (FL-style "toggle slide": pitch
  glide over note duration, plus volume/pan glide). Kills FL's signature.
- **A3 — Loop recording + take lanes + audio comping** (Cubasis/Audio Evo
  parity): punch in/out, multi-take lanes, per-take comp highlighting.
  ✅ *Shipped across 4 phases — TakeManagerService data foundation, punch-in
  arm + take stamping in the transport bar, take-lane panel in the arrangement
  view, active-take playback from note snapshots, loop-pass take recording,
  and comp stacking with APPLY/CLEAR (later takes win overlaps).*
- **A4 — Song mode / clip launcher** (session view scenes, launch clips,
  performance quantization) — beat BandLab's grid and Koala's scenes.
- **A5 — Notation view** (basic score from MIDI: clefs, note heads, rests,
  velocity shading) — only Cubasis has it; we ship it free.
  ✅ *Score view ships staves per MIDI track with clef, bar ruler, accidentals,
  duration labels, quarter-note rest glyphs on empty beats, and velocity
  shading on note heads.*
- **A6 — Export formats + cloud** (MP3/FLAC/OGG encode, .mid, project cloud
  save with offline-sync merge) — n-Track/BandLab parity. *SHIPPED: real
  `exportToFormat()` (WAV PCM encode + WebCodecs MP3/OGG/M4A with WAV
  fallback), `exportProjectMidi()` via the MidiWriter util (track→channel
  mapping, tempo, muted/audio/empty skip), and a real offline render —
  `renderProjectOffline()` now schedules actual notes on an
  OfflineAudioContext instead of returning silence. Transport-bar export
  dropdown gained an Export MIDI action.*

### Phase B — Ecosystem lock-in (Sprints B1–B4)
*Goal: features competitors cannot copy because they don't have our stack.*

- **B1 — WASM plugin framework** (official plugin API, sandboxed DSP modules,
  community plugin store) — the Android answer to AUv3. Nobody else has it.
  *Phase 1 SHIPPED: `PluginStoreService` plugin registry (manifests, persisted
  enabled state, kernel-chain buffer processing) over the existing
  `WasmLoaderService` + DSP kernels (dynamics, mastering EQ, saturation,
  algorithmic reverb, full mastering chain); WASM-first with automatic JS
  fallback; plugin-store UI in the Studio (cards, enable toggles, param
  sliders, WASM/JS runtime badge); enabled plugins now drive the
  `applySmuvePolish` export stage.*
  *Phase 2 SHIPPED: community store (export/import `.smuveplugin` JSON
  manifests with validation + persisted community catalog, share/remove UI);
  LIVE plugin inserts — per-track `pluginIds` chain rendered by a
  ScriptProcessor insert in each track's signal chain (kernels run on every
  render quantum while playing), wired from the Effects Rack WASM Inserts
  strip; mastering gained Render & Master — real-synth offline bounce →
  WASM polish chain → analyzed meters (true peak / integrated LUFS / RMS).*
- **B2 — Real-time collab sessions** (multi-user project editing, live chat,
  voice signals — already have peer-networking skeleton).
  *Phase 1 SHIPPED: `CollaborationService` project-snapshot protocol —
  envelope-typed `PROJECT_SYNC` messages dispatched through the existing
  `SocialNetworkingService` party room, version-stamped + debounced + stale
  dropped, echo/loopback guard against `currentUserId`, presence counter
  (`peerCount`) reflecting the active party. Plus two polish surfaces that
  share the audio engine: `AudioEngineService.playAudition()` / `stopAudition()`
  plays the mastered offline render through a dedicated monitor gain (bypasses
  the master bus) with progress + duration signals for the Mastering Suite
  Play/Stop UI; `installMasterPluginInsert()` splices a `ScriptProcessor`
  between `masterGain` and `preMasterGain` so any enabled WASM polish
  plugin processes the entire mix live, surfaced as a Master-Bus strip in
  the Effects Rack.*
  *Phase 2 SHIPPED: hardened collab protocol — per-track diff sync
  (`TRACK_DELTA_SYNC` envelopes with per-field version registry, light
  enough for every incremental edit; a 30s heartbeat `PROJECT_SYNC` keeps
  peers eventually consistent); field-level last-writer-wins (LWW) with
  an 800 ms near-simultaneous-edit guard that surfaces a structured
  `pendingConflicts` signal; `resolveConflict('mine'|'theirs'|'discard')`
  re-dispatches the chosen value so peers converge; voice bridge through
  `PeerNetworkingService` — `inviteToVoice()` / `acceptVoiceInvite()` /
  `declineVoiceInvite()` / `endVoice()` round-trip through the party room
  with a `voicePeers` map + `voiceActive` computed; peer cursors
  (`PEER_CURSOR` envelopes with normalized {x,y} on a named surface),
  throttled to 80 ms with a `lastSentX/Y` dedup so sub-pixel motion is
  dropped silently. Studio header gained a presence cluster — session
  code chip, 5-up avatar pill stack with talking dot that lights when
  `voicePeers[userId]` is `connected` or `muted`, `+N` overflow, and a
  voice-active chip; peer cursors render as labeled markers over the
  studio canvas. New conflict entries route through `SnackbarService`
  so the user is alerted the moment their edit collides.*
- **B3 — AI-assisted everything**: one-tap "Produce" (idea → beat → mix →
  master → release checklist), genre instrument recommendations, AI lyrics +
  vocal tuning.
  ✅ *Phase 1 SHIPPED: `AiProduceService` orchestrator wires the existing
  AI services into a single gesture — 5 cancellable stages (idea · beat ·
  lyrics · mix+master · release-checklist) with signal-driven progress.
  Idea: `applyIdea(opts)` synthesizes a `ProduceIdea` (title, genre, mood,
  key, BPM, energy, theme, estimated bars) with prompt-keyword mood
  detection. Beat: reuses `AiBeatGeneratorService.generateBeat()` to lock
  a full arrangement (drum pattern + bass + chords + melody + section
  breakdown). Lyrics: reuses `SongwritingAssistantService.generateLyrics()`
  for verse/chorus/bridge with chord set. Mix+Master: routes through
  `AiMixAssistantService.autoMaster()` with a beat-genre→mastering-preset
  inference (`guessBeatGenre` collapses Trap/Hip Hop/etc. to one of the
  nine genre presets) and exposes the per-line report. Release: calls
  `ReleasePipelineService.initializeRelease()` + `addTrack()` and stamps
  the four pre-master stages Completed for the new track. Apply: rolling
  Apply button creates the drum/bass/chord/lead track quartet via a
  hardcoded role→instrument map (decoupled from per-genre recommender
  order). UI: `/produce` route mounts `AiProduceComponent` with a sticky
  progress bar, 5-up stage-pill nav, idea form (prompt + genre + mood +
  BPM override + title override), and 5-stage review cards that light up
  as the pipeline produces real artifacts. Cancellation: cancel-anytime
  flag, three log entries (`/produce` log table) and a per-stage review
  surface keep the user in the driver's seat. Master Plan / Hub spotlight
  updated.*
- **B4 — Career pipeline inside the DAW**: export straight to release
  pipeline, distribution metadata, revenue forecasts.
  ✅ *SHIPPED: `CareerPipelineService` (signal-driven charter orchestrator)
  wires the existing `ReleasePipelineService` + `MarketingService` into a
  one-tap post-master flow that produces three draft artifacts per
  release — `DistributionMetadata` (DSP-ready title/artist/genre/copyright
  + platform map), `RevenueForecast` (3-tier low/mid/high stream + yearly
  revenue estimate driven by `genreMomentumTier()` heuristics on the
  trap/house/lo-fi/jazz/reggaeton buckets), and `OutreachPacket` (curator
  pitch with subject + body + CTA + target list size). `buildCharter()` is
  deterministic per release, `commitCharter()` promotes the draft to
  `committed` and kicks off a Marketing campaign without mutating user
  profile state until the user explicitly commits. `/release-pipeline` got
  a Charter card with Generate / Re-draft / Commit + Copy Subject / Copy
  Body clipboard hooks. New spec covers build determinism, forecast
  tiering (trap > jazz), outreach CTA targeting, commit + marketing
  handoff, and unknown-id no-op safety.*

### Phase C — Polish & storefront (Sprints C1–C3)
- **C1 — Performance audit**: AudioWorklet benchmarks, buffer tuning, 60fps
  stress on mid-range Android, latency reduction (already planned: "latency &
  engine").
  ✅ *SHIPPED: `AudioEngineLatencyService` (decoupled from the engine
  hot path) — a snapshot service that reads the engine public surface
  (`baseLatency`, `outputLatency`, `nativeSampleRate`, `masterWorkletActive`,
  `performanceTier`, scheduler lookahead + tick) on a 1.5s refresh and
  surfaces `snapshot()` / `readSnapshot()` / `getEngineMetrics()` as
  plain-object shape. Plus an on-demand `runOfflineBenchmark()` that
  schedules 4 oscillators onto an `OfflineAudioContext` (1-second buffer
  default) and reports wall-clock render time + speedRatio (≤1 means
  faster than real-time). `buildSummary()` rolls benchmark history plus
  live state and emits actionable tips — contextState, totalLatency, sample
  rate, master worklet, render speed. `/produce` gained an Engine
  Metrics sub-card showing sample rate, round-trip latency, scheduler
  lookahead, scheduler tick, master worklet state, CPU tier. The
  round-trip latency chip turns red when ≤60 ms is exceeded. New spec
  covers snapshot capture, headroom hint escalation (headroom → near →
  tight), suspended-context prompts, missing-master-worklet flag, rolling
  benchmark window cap, and plain-object read.*
- **C2 — Play listing + IAP**: RevenueCat wiring, Pro tier, sound packs,
  screenshots that show the 60-second demo (8-bar trap → 6 stems → AI mix →
  master at −14 LUFS).
  ✅ *SHIPPED: `StorefrontService` + `play-billing.client.ts` shim —
  8-SKU deterministic seed catalog across 4 categories (sound-pack /
  instrument-pack / ai-bundle / subscription) tagged for genre-aware
  `recommendFor(viewMode, profileGenre)`. Drives a `MockPlayBillingClient`
  that resolves after 1.2s (1.4s including ack) so the preview shows end
  to end without a Play backend; production swaps in a dynamic import of
  the real client. `purchase(skuId)` produces an `OwnershipState` row,
  removes the cart line, and persists to `smuve_store_owned` so a reload
  keeps your collection. `cart / addToCart / removeFromCart / clearCart /
  totalPriceCents` are signal-driven and shout at the user when they try
  to re-buy an owned SKU. `/store` route + `StorefrontComponent` (grid +
  category filter + cart drawer + ownership pill) lives on the hub's new
  1×1 shopping_bag bento card. Catalog spec covers 4 categories, free
  + paid price labels, cart dedup + ownership refusal, success and
  failure paths, acknowledge, restore (mock), recommend scoring
  (category + tag overlap), persist + reload, and clear cart.*
- **C3 — Onboarding that beats BandLab**: 5-minute guided first beat with AI
  session musicians.
  ✅ *SHIPPED: extended `OnboardingService` (existing `steps()/progress()` API
  stays intact) with `currentTour()` signal, `tourSteps()` signal-driven
  5-step tour, `tourProgress()` 0..100 computed, `startTour()` /
  `completeTour()` / `exitTour()` / `markStepComplete(id)` /
  `openStep(step)` methods, plus cached completion in
  `smuve_tour_progress` so reload + rehydrate doesn't lose marks. New
  `FirstBeatTourComponent` (TS+HTML+CSS) renders the tour as a styled
  overlay with a stepped progress bar, per-step "Open Step" /
  "Mark Complete" buttons, a "Skip Tour" escape hatch, and a "Finish Tour"
  button that locks once progress hits 100. Tour steps: profile → studio →
  produce → store → strategy. Hub gained a 1×1 "First Beat Tour" bento
  card + an inline CTA on the First-Signing Path panel; new
  `/onboarding/tour` route. Spec covers seeding, mark-step climbing,
  completeTour reset, exitTour state-clear and persistence survival.*

---

## 4. Sprint status tracker

| Sprint | Deliverable | Competitor killed | Status |
| --- | --- | --- | --- |
| A1 | Time-stretch / pitch engine | FL Mobile, Cubasis, n-Track | ✅ |
| A2 | Slide notes | FL Mobile | ✅ |
| A3 | Loop record + comping | Cubasis, Audio Evolution | ✅ |
| A4 | Song mode / clip launcher | BandLab, Koala | ✅ |
| A5 | Notation view | Cubasis | ✅ |
| A6 | Export formats + cloud | n-Track, BandLab | ✅ |
| B1 | WASM plugin framework | ALL (Android) | ✅ |
| B2 | Real-time collab | BandLab | ✅ |
| B3 | AI end-to-end produce | ALL | ✅ |
| B4 | Career pipeline in-DAW | ALL | ✅ |
| C1 | Performance + latency | ALL | ✅ |
| C2 | Play listing + IAP | ALL | ✅ |
| C3 | Onboarding | BandLab | ✅ |
| X1 | Math/Date/JSON/parseInt/Number/window/document/localStorage in-template sweep (Angular template globals inaccessible — added roundPct() helper to session-view and shipped first-ever spec for that component to catch any regression) | Latent production crashes | ✅ |
| X2 | B3 polish — voice-preview stage added to /produce between Lyrics and Mix+Master (synthesizes chorus hook on OfflineAudioContext, auditionable on engine via `playAudition()`, optional per-run checkbox toggle in the form; stage pill + status card + audition progress bar) + B4 charter UI + C1 latency profile surfaced in `/produce` engine-metrics sub-card | AI Lyrics tuning gap | ✅ |
| X3 | Engine Run Benchmark CTA on `/produce` — one-tap OfflineAudioContext probe via `AudioEngineLatencyService.runOfflineBenchmark(1)`, inline result card showing wall-clock ms + speedRatio (≤1 = real-time-or-better; >1 = slower-with-rationale phrasing), aria-busy state, new jest case asserting isBenchmarking + result signals | Production-truth engine metrics | ✅ |

*Definition of done for each sprint: feature ships with unit tests, build
clean, and the comparison-table cell flips to ✅.*
