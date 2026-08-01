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
| D1 | Cloud Sync / Cross-device project sync | BandLab, n-Track | ✅ |
| D2 | Session replay + project version history | Cubasis (sessions), FL Mobile (alt take history) | ✅ |
| D3 | Branching & merge (3-way merge + rebase + cherry-pick) | Git CLI metaphor (all DAWs) | ✅ |
| D4 | Merge graph visualization + auto-record on save | All (graph viz is a DAW first) | ✅ |
| X1 | Math/Date/JSON/parseInt/Number/window/document/localStorage in-template sweep (Angular template globals inaccessible — added roundPct() helper to session-view and shipped first-ever spec for that component to catch any regression) | Latent production crashes | ✅ |
| X2 | B3 polish — voice-preview stage added to /produce between Lyrics and Mix+Master (synthesizes chorus hook on OfflineAudioContext, auditionable on engine via `playAudition()`, optional per-run checkbox toggle in the form; stage pill + status card + audition progress bar) + B4 charter UI + C1 latency profile surfaced in `/produce` engine-metrics sub-card | AI Lyrics tuning gap | ✅ |
| X3 | Engine Run Benchmark CTA on `/produce` — one-tap OfflineAudioContext probe via `AudioEngineLatencyService.runOfflineBenchmark(1)`, inline result card showing wall-clock ms + speedRatio (≤1 = real-time-or-better; >1 = slower-with-rationale phrasing), aria-busy state, new jest case asserting isBenchmarking + result signals | Production-truth engine metrics | ✅ |
| E1 | Studio product telemetry + Insights panel — local event bus (`StudioTelemetryService`), north-star metrics (session length, idea→first loop, export success, crash-free, collab rate), weighted competitor gap backlog, topbar Insights slide-over, unit coverage | Data-driven Studio backlog vs BandLab/FL/Koala | ✅ |

### Phase D — Continuity cloud (Sprints D1–D2)
*Goal: features competitors can't copy because they assume a single device. Every artist now works across phone, tablet, and desktop without losing the lab session in transit.*

- **D1 — Cloud Sync / Cross-device project sync**: end-to-end project sync
  with conflict resolution and per-device history. Beat BandLab + n-Track
  parity and add real cross-device presence. ✅ *SHIPPED. `cloud-sync.types.ts`
  contract (ProjectManifest, SyncEnvelope, CloudDevice, ConflictRecord,
  RemoteSnapshot, SyncTimelineEntry). `mock-cloud-server.ts` shim — 350–700ms
  deterministic latency, per-project + per-device snapshot table, conflict
  surfaced on version mismatch. `CloudSyncService` — stable per-device id
  (`smuve_cloud_device`), manifest mirror (`smuve_cloud_projects::manifests`),
  push / pull / refresh / restore APIs, three-way conflict resolution
  (`mine` re-push +1, `theirs` accept & bump mirror version, `merge`
  deep-union & max-version +1), `isCloudReachable()` computed from
  `navigator.onLine` + `OfflineSyncService.networkStatus()` + a manual
  `simulatedNetworkOnline` chaos switch, automatic degradation
  (`/mock-cloud/push` op queued through the existing `OfflineSyncService`
  when offline). 10 spec cases — push & version bump, conflicting-edit
  detection, mine/theirs/merge strategies with version arithmetic,
  pull-then-mirror, offline-degradation, simulated-network toggle,
  timeline, etc. UI: `/cloud` route + `CloudVaultComponent` —
  device-registry card with editable nickname, demo-project push
  (JSON payload editor), conflict queue with three CTA per row,
  recent cloud projects + per-project snapshot history with Restore,
  sync timeline of last 12 events with status pill. Hub gained a 1×1
  Cloud Vault bento card with reachability + project-count + conflict
  badge; header gained a slim `cloud_sync` status pill (online dot vs
  amber offline dot, conflict-count chip). New master-plan row: D1 ✅.*
- **D2 — Session replay + project version history**: git-style branches,
  rewinds, replay events and chapter shortcuts so the user can chapter
  a session like a CLI.
  ✅ *SHIPPED. `session-history.types.ts` contract (SessionCheckpoint,
  SessionBranch, BranchLineage, RewindRequest, SessionRestore,
  ReplayEvent, DiffPatch / DiffEntry). `djb2-hash.util.ts` (32-bit djb2
  + canonical-JSON serializer so `{a:1,b:2}` ≡ `{b:2,a:1}`).
  `json-patch.util.ts` — top-level shallow diff + patch application +
  replay materializer that walks forward through the delta stream.
  `SessionHistoryService` — per-project branch registry, signal-driven
  `checkpointsByBranch`, `activeBranchByProject`, `branchesByProject`;
  auto-creates a `main` branch on first checkpoint; dedupes identical
  payloads by canonical djb2 hash; promotes every 10th checkpoint
  to a full snapshot (intermediates are JSON-patch deltas against the
  previous checkpoint in the same branch); `createBranch` / `renameBranch`
  / `deleteBranch` with active-branch guards; `switchBranch` moves the
  head pointer + returns the reconstructed state; `rewind` materializes
  any historical checkpoint by walking forward from the nearest full
  snapshot; `diff` produces before/after pairs across any two
  checkpoints; `replayEvents` enumerates the running state at every
  checkpoint in head-to-tail order; `restoreToCloudCheckpoint` copies
  a D1 RemoteSnapshot as a fresh, labelled checkpoint on the active
  branch. 12 jest specs cover auto-branch creation, dedup, delta
  advancement, every-10th snapshot promotion, fork point handling,
  switchBranch head swap, exact rewind round-trip, diff delta-analysis,
  replay event ordering, cloud-restore, chaptering, branch rename +
  delete guards. UI: `/timeline` route +
  `SessionTimelineComponent` (TS+HTML+CSS) — checkpoint-intake card,
  branch list with Switch/Delete/Active pill, checkpoint timeline
  hairline with full-snapshot vs delta dot styling, replay panel with
  tick-based progress + Start/Pause + JSON payload preview, top-level
  diff list (first→last), cloud-vault restore rows that call back into
  `CloudSyncService.cloudProjects()`. Hub gained a 1×1
  `Session Timeline` bento card with project-tracked count.*
- **D3 — Branching & merge (3-way merge + conflict markers + rebase +
  cherry-pick)**: round out the git-CLI metaphor so the user can
  fork, fork again, resolve competing edits, replay history onto a
  different branch, and pluck single commits across branches.
  ✅ *SHIPPED. `merge.types.ts` contract (MergeRequest, MergeResult,
  ConflictMarker with `{field, base, mine, theirs}`, ConflictResolution
  with `pick: 'mine'|'theirs'|'custom'`, RebasePlan, CherryPickRequest,
  CherryPickResult, MERGE_SENTINEL constant, MergeCheckpointPayload
  shape). `SessionHistoryService` extensions: `findAncestor` walks
  back from both branches' parentId chains to find the LCA, with a
  fallback that searches either branch's CPS for the fork anchor;
  `threeWayMerge(projectId, source, target)` materializes base, mine,
  theirs; auto-resolves a field when only one side changed or both
  changed identically; emits a ConflictMarker when both sides changed
  the same field differently. Result is a forced full-snapshot
  checkpoint on target with `__merge__:true` sentinel + `auto` map +
  `conflicts` map + base / mine / theirs checkpoint ids.
  `resolveConflicts(projectId, mergeCheckpointId, resolutions)`
  rebuilds the merged payload from the resolutions and writes a final
  non-merge checkpoint on target; clears `pendingMergeByProject`.
  `rebase(projectId, source, onto)` replays every source checkpoint
  AFTER the LCA as a new cp on the target branch with new ids + same
  labels. `cherryPick(projectId, source, sourceCheckpointId, onto)`
  materializes sourceBefore from the fork-anchor state when no source
  parent exists, applies the field delta non-conflictingly, and emits
  a merge-cp if any field diverges. `readConflicts` returns open
  markers from a pending merge cp. Private `appendFullSnapshot`
  helper bypasses the every-10th promotion rule so merge payloads
  round-trip intact. 9 jest specs cover LCA on forked + disjoint
  graphs, clean + conflict three-way merges, the full resolve
  round-trip, rebase replay count, cherryPick clean + conflict, and
  readConflicts. UI: `SessionTimelineComponent` gained a
  "Branch operations" card with Source/Target `<select>` pickers for
  3-way merge, rebase, and cherry-pick; a conflict-resolution modal
  appears automatically when `pendingMerge()` is non-null, with
  per-field Mine / Theirs / Custom radio pickers + JSON custom-value
  input + "Resolve & commit" CTA.*
- **D4 — Merge graph visualization + auto-record on save**: render the
  per-project branch lineage as a git-log-style SVG graph and make
  every project save a checkpoint without lifting a finger.
  ✅ *SHIPPED. `session-graph.types.ts` (GraphNode, GraphEdge,
  GraphEdgeKind, SessionGraph). `session-graph.util.ts` — pure,
  deterministic `layoutSessionGraph(projectId, branches,
  checkpointsByBranch)` that assigns one lane per branch (creation
  order), one row per checkpoint (global chronological order),
  linear edges chaining consecutive cps within a branch, fork edges
  from the forkFromCheckpointId ancestor to the first cp of each
  derived branch, merge edges from the merge provenance heads (mine
  = target head, theirs = source head) into any MERGE_SENTINEL
  checkpoint, and cherry edges into cherry-pick conflict checkpoints;
  plus `graphDimensions()` for SVG viewBox math and `isMergePayload`.
  7 jest specs cover lane assignment, cross-branch chronological row
  ordering, linear chaining, fork edges, merge edges + merge-node
  flag, cherry edge kind, cp-id dedup across branches, and viewBox
  scaling. `SessionHistoryService` gained `autoRecordEnabled` signal
  + `toggleAutoRecord()` + `autoRecord(projectId, label, payload)`
  (honors toggle, canonical-hash dedup swallows no-op saves) +
  `buildGraph(projectId)` wrapper. `ProjectService` now auto-records
  a checkpoint on every add/update via a lazy Injector getter, so a
  project save becomes a graph node with a `save: <name>` label and
  the graph only grows when the project actually changed. UI:
  `SessionTimelineComponent` gained a full-width Merge graph SVG card
  (lane headers, linear/fork/merge/cherry stroke + dash styles,
  legend, full-snapshot vs delta vs merge node glyphs, click + Enter
  + Space to rewind from any node). New master-plan rows: D3 ✅ +
  D4 ✅.*

### Phase E — Product intelligence (Sprint E1)
*Goal: instrument Studio so every future sprint is ranked by measured
competitor gap and real north-star movement, not gut feel.*

- **E1 — Studio product telemetry + Insights panel**: ✅ *SHIPPED.
  `StudioTelemetryService` (localStorage-backed event bus, 7-day window,
  4k event cap) tracks session start/end, view changes, starter recipes,
  templates, collab join/leave/start, save/export/MIDI/comp export,
  AI mix, plugin store, share-link, and Insights opens. Computed
  north-star metrics: avg session minutes, idea→first loop seconds,
  export success rate, crash-free session rate, collab session rate.
  Weighted competitor parity matrix (BandLab / FL Mobile / n-Track /
  Audio Evolution / Koala) feeds a prioritized gap backlog. Studio
  topbar gained an INSIGHTS tool that opens a slide-over with the
  north-star grid, gap bars, and event volume. Jest coverage for
  session lifecycle, rates, backlog sort, rehydrate, and corrupt
  storage. Same-ms session teardown counts as completed.*

*Definition of done for each sprint: feature ships with unit tests, build
clean, and the comparison-table cell flips to ✅.*
