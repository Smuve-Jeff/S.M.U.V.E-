# S.M.U.V.E. 2.0

**Strategic Music Utility Virtual Enterprise — presented by Smuve Jeff**

S.M.U.V.E. 2.0 is an artist operating system: a music-production Studio, an AI strategic
partner, a cinema-style visual lab, release/business planning, and a gaming/community
hub, all inside one Angular application with a shared shell and a real backend.

It is built for independent artists who want to run the entire journey — record, mix,
master, plan releases, grow a career, and unwind in the arcade — from one installable
PWA, with an Android and desktop build from the same codebase.

---

## Highlights

- **22-view Studio** with WebGL piano roll, DJ decks, drum machine, mixer, channel rack,
  effects rack, sampler, six synth engines, vocal suite, performance pads, mastering,
  smart recording, and deterministic offline export.
- **Save integrity first** — every project write is durable before it reports success;
  autosave, recovery, `.smuve` bundle import/export, and a **My Sets** browser for
  saved sessions.
- **One-tap mobile instrumentals** — six quick-start recipes (trap, lofi, house,
  neo-soul, drill, afrobeats) that build a full loop on a phone in one tap.
- **S.M.U.V.E. Prime AI** — an in-character executive advisor, producer, and collaborator
  powered by Gemini, with strategy audits, viral hooks, session musicians, and
  artist-granted full-control mode.
- **Cinema engine room** — `Image & Video Lab` with layered timeline, titles, narration,
  FX rack, and delivery cutdowns.
- **Tha Spot** — a 900+ cabinet browser-gaming and community hub with rooms,
  matchmaking, leaderboards, XP, and a remix arena.
- **Real backend** — Express + TypeORM + Postgres, JWT auth with account recovery,
  Socket.IO collaboration/presence, and same-origin deployment.

---

## Workspaces

The signed-in app is wrapped in an auth guard; `/login` and `/reset-password` are the
public routes.

| Route | Workspace | Purpose |
| --- | --- | --- |
| `/hub` | Label Hub | Command center: releases, profile context, playback, navigation |
| `/studio?view=…` | Studio | Core production workspace — 22 switchable views (see below) |
| `/piano-roll` | Piano Roll | WebGL note editor, bezier CC lanes, MIDI import/export |
| `/canvas-piano-roll` | Canvas Piano Roll | Alternative canvas editor for lighter devices |
| `/mixer` | Mixer | Channel strips, sends, VCA rack, honest metering |
| `/drum-machine` | Drum Machine | Step grid, swing, humanize, probability |
| `/performance` | Performance | MIDI pad grid, velocity layers, pressure pads |
| `/mastering` | Mastering Suite | Spectrum analysis, soft-clip, limiting, AI mix master |
| `/vocal-suite` | Vocal Suite | Capture, comping, and vocal enhancement |
| `/dj` | DJ Booth | Two-deck mixer with crossfader, platters, stems (`/turntable`, `/decks` alias here) |
| `/lyric-editor` | Lyric Editor | Writing and lyric ideation |
| `/practice` | Practice Space | Rehearsal protocols and metronome tools |
| `/produce` | AI Produce | Assisted beat and arrangement generation |
| `/command-center` | Command Center | Operational cockpit for projects and tasks |
| `/neural-foundry` | Neural Foundry | In-browser ML/ONNX tooling |
| `/image-video-lab` | Image & Video Lab | Cinema timeline, layers, titles, narration, FX (`/image-editor`, `/video-editor` alias here) |
| `/projects` | Projects | Local project shelf and work-in-progress management |
| `/release-pipeline` | Release Pipeline | Stage tracking from instrumental → released |
| `/analytics` | Analytics | Audience and performance monitoring |
| `/strategy` | Intel Lab | AI strategy, campaigns, market intelligence |
| `/career` | Career Board | Career planning and momentum tracking |
| `/business-suite` | Business Suite | Business operations and pipelines |
| `/business-pipeline/:id` | Pipeline Detail | Single-pipeline drill-down |
| `/artist-development` | Artist Development | Growth programs and missions (`/dev-hub` alias) |
| `/knowledge-base` | Knowledge Base | AI reference surface |
| `/cowrite` | Cowrite Studio | Collaborative writing sessions |
| `/profile` | Profile | Artist identity, scoring, and settings context |
| `/journey` | Artist Journey | Onboarding and progression map |
| `/store`, `/products` | Storefront | Product catalog |
| `/cloud` | Cloud Vault | Cloud project storage |
| `/timeline` | Session Timeline | Session history |
| `/inbox` | Challenge Inbox | Incoming challenges and invites |
| `/remix-arena` | Remix Arena | Competitive collaboration space |
| `/tha-spot` | Tha Spot | Gaming + community hub (`/tha-spot/browse`, `/tha-spot/room/:id`, `/tha-spot/game/:id`, `/networking`) |
| `/settings` | Settings | Visual, audio, AI, studio, and security controls |
| `/login`, `/reset-password` | Auth | Sign-in and single-use account recovery links |

### Inside the Studio

`/studio?view=<view>` switches between 22 views: arrangement, session, piano-roll,
drum-machine, channel-rack, mixer, effects-rack, vocal-suite, dj, performance, mastering,
ai-produce, sound-browser, sound-pad, synthesizer, chord-editor, sampler, score,
sample-library, plugins, audio-recorder, and performer.

The shell layers a grouped, scrollable component rail, a fixed transport, a project
status strip (save state/dirty flag), a **My Sets** shelf (open/delete saved sets), smart
creation sheets, an AI assistant, and keyboard shortcuts. On phones the bottom bar
becomes a one-tap quick-start lane.

#### Project & session integrity

- Projects persist to IndexedDB; `ProjectWorkspaceService` owns manual save, autosave,
  crash recovery, and set listing.
- Save resolves only after the IndexedDB transaction commits; failures surface instead
  of reporting false success.
- Bundle import validates metadata, tracks, audio assets (>256 MiB rejected), structure,
  and automation before replacing a session.
- Export renders offline through `OfflineAudioContext` (deterministic WAV, honors
  solo/mute/gain/pan), with MIDI import/export alongside.

#### Engines

- `AudioEngineService` transport/scheduler on Web Audio + AudioWorklets, with Tone.js
  available for instruments.
- Six synthesis engines (subtractive, FM, wavetable, granular, physical modeling,
  advanced), a sampler with velocity layers/round-robin, and drum synthesis.
- Smart recording: punch-in/out, comping with crossfades, silence detection, and
  take management.
- Stem separation through ONNX Runtime Web (Demucs-class model).

---

## AI system

S.M.U.V.E. ships as **S.M.U.V.E. Prime**, a theatrical executive persona; artists can
switch to Elite, Balanced, or Supportive modes in Settings. It powers:

- strategic audits and **Strategic Decrees** that react to the active workspace,
- market alerts, intelligence briefs, and career/business guidance,
- one-tap production and mixing assists,
- viral hook generation and release strategy,
- autonomous session musicians (bassist, drummer, keyboardist),
- a RAG-style knowledge base for artist-growth answers,
- **full-control mode** (off by default; grantable in Settings → AI) that can drive
  navigation, transport, mixer, projects, and exports — confirming irreversible or
  outward-facing actions first.

Gemini access is wired through `@google/genai`; the backend proxies AI traffic so keys
never ship to the client.

---

## Cinema: Image & Video Lab

The visual workspace is a cinema-style editor rather than a simple preview:

- multi-track timeline with visual, overlay, voiceover, and score lanes,
- movie, stream, and vlog production modes with landscape/vertical delivery presets,
- clip controls for trimming, transitions, filters, brightness/contrast, noise
  reduction, background removal, and upscale toggles,
- an engine-room layer renderer with titles, narration, an FX rack, and cutdowns,
- canvas-based preview and export integration.

---

## Tha Spot (community & gaming)

- 900+ game catalog with curated rails, rooms, spotlights, and search,
- matchmaking, invites, and challenges, leaderboards and live events,
- XP, streaks, rewards, and profile-linked progression,
- Remix Arena for competitive collaboration,
- cross-frame safety: embedded cabinets validate `event.origin` on every message,
- an artwork pipeline with title-art fallbacks and provenance tracking
  (see `docs/tha-spot-modern-games-review.md`).

---

## Architecture

### Frontend

- **Angular 21** standalone components with signals, lazy-loaded routes, and an
  `authChildGuard` around the signed-in shell.
- **PWA** via `@angular/service-worker` (`ngsw-config.json`) — installable and
  offline-capable.
- **Audio/visual**: Web Audio, AudioWorklets (`src/assets/worklets/`), WebGL and Canvas
  renderers, ONNX Runtime Web, HLS.js for Smuve TV.
- **UI**: Tailwind plus the project's global “Analog Engine” design system in
  `src/styles.css` and `src/studio-redesign-global.css`.

### Backend (`src/routes`, `src/entities`, `src/middleware`, `src/socket`)

- **Express 5 + TypeORM + Postgres** with zod validation and a centralized error handler.
- **Auth**: bcrypt + JWT, API-first login, and single-use password-reset links.
- **Email**: Plunk transactional email (secret `sk_*` key required).
- **Realtime**: Socket.IO for presence, rooms, direct messages, challenges, and WebRTC
  voice signaling.
- **Storage**: S3-compatible client for media uploads (`src/services/storage.service.ts`).
- `authentication-worker/` is an optional Cloudflare Worker JWT gate that can front the
  API (see its `wrangler.toml`).

### Data

- IndexedDB (`SMUVE_OFFLINE_DB`) for projects, autosaves, and recovery records.
- A cloud-sync queue isolates remote failures so local saves always succeed.
- Postgres stores accounts, social graph, collaborative packets, and catalog mirrors.

---

## Repository layout

```text
src/app/            Angular application
  studio/           22-view production module (components, services, engines, wasm/)
  components/       workspace modules (hub, profile, tha-spot, cinema lab, business…)
  hub/              label hub + Tha Spot data/services
  services/         app-wide services (audio engine, AI, auth, storage, cloud…)
  neural-foundry/   in-browser ML workspace
src/routes…         Express API (routes, entities, middleware, socket, database)
src/assets/         worklets, icon set, catalogs, game cabinets
tests/e2e/          Playwright suites
tests/dsp/          pytest suite for the Python engine
scripts/            catalog, audit, deployment, and build tooling
smuve_*.py          S.M.U.V.E- Python DSP/CLI engine (see below)
android/ electron/  Capacitor 8 Android + Electron shells
docs/               plans, sweeps, and deployment guides
```

---

## Getting started

**Prerequisites:** Node 22.12 (`engines` + `.nvmrc`), npm ≥ 10.

```sh
npm install --legacy-peer-deps     # or: npm run install:legacy
npm run dev                        # http://localhost:4200
```

### Environment

Copy `.env.example` → `.env` for the API base keys (`NODE_ENV`, `PORT`, `DATABASE_URL`, `JWT_SECRET`, `FRONTEND_URL`); email keys are added in deployment settings or `.env`:

| Variable | Purpose |
| --- | --- |
| `NODE_ENV` | `development` / `production` |
| `PORT` | API port (default 4000) |
| `DATABASE_URL` | Postgres connection string |
| `JWT_SECRET` | Required in production (dev derives an ephemeral one) |
| `FRONTEND_URL` | Allowed frontend origins (comma-separated) |
| `PLUNK_API_KEY` | Plunk **secret** key (`sk_*`) for account-recovery email |
| `PLUNK_FROM_EMAIL` / `PLUNK_FROM_NAME` | Verified sender identity |

Never commit real secrets; `.env*` is gitignored except `.env.example`.

### Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Angular dev server on `0.0.0.0:4200` |
| `npm run build` | Production Angular build → `Build/browser` |
| `npm run build:server` | Compile the Express API → `Build/api` |
| `npm run start` | Serve the built Angular bundle |
| `npm run start:unified` | Run the unified Angular + API server (`Build/api/server.js`) |
| `npm test` | Jest (Angular + server projects) |
| `npm run lint` / `npm run format` | ESLint / Prettier |
| `npx playwright test` | E2E suites in `tests/e2e` |
| `npm run build:wasm` | Build the WASM DSP modules (emscripten pipeline) |
| `npm run cap:sync` | Sync the web build into the Android shell |
| `npm run audit:tha-spot-artwork` | Tha Spot artwork audit (add `--live --smoke` for browser checks) |

### Verification

```sh
npx tsc -p tsconfig.json --noEmit          # frontend typecheck
npx tsc -p tsconfig.server.json --noEmit   # server typecheck
npm test -- --runInBand --runTestsByPath <spec paths>
npx playwright test tests/e2e/<spec>       # against a running dev server/preview
```

The Studio quality sweep and its evidence live in
[`docs/STUDIO_QUALITY_SWEEP.md`](docs/STUDIO_QUALITY_SWEEP.md); the prioritization plan
lives in [`docs/MASTER_PLAN.md`](docs/MASTER_PLAN.md).

---

## Python companion engine

The repo also ships a NumPy-based offline DSP/CLI engine (`smuve_*.py`, entry point
`smuve_main.py`) covering synth voices, sequencer, sampler, mixer bus, EQ, filters,
dynamics, saturation, sidechain, modulation, stem export, and project sessions
(`*.smuve`):

```sh
python -m pip install -r requirements-dev.txt
python smuve_main.py        # interactive studio menu
pytest                      # tests/dsp suite (pytest.ini)
```

Factory presets live in `presets/`.

---

## Deployment

- **Render (canonical):** [`render.yaml`](render.yaml) defines one Node service that
  serves the Angular bundle **and** the Express API on the same origin
  (`npm run install:legacy && npm run build && npm run build:server`, start
  `npm run start:unified`, health `/api/health`) plus Postgres. Attach
  `smuvejeffpresents.com` in Render → Custom Domains.
- **Self-hosted tunnel:** [`CLOUDFLARE_TUNNEL.md`](CLOUDFLARE_TUNNEL.md) covers the
  `smuve-connect` Cloudflare Tunnel path for running both from this machine.
- **Static hosting:** `npm run deploy` builds with the `ghpages` configuration and
  publishes `Build/browser` via `angular-cli-ghpages`.
- **Android:** [`docs/PLAY_STORE_DEPLOY.md`](docs/PLAY_STORE_DEPLOY.md) (Capacitor 8,
  `com.smuve.smuve2`).
- **Desktop:** [`docs/DESKTOP_DEPLOY.md`](docs/DESKTOP_DEPLOY.md) (Electron shells in
  `electron/`).

---

## Documentation

| Document | Contents |
| --- | --- |
| [`docs/MASTER_PLAN.md`](docs/MASTER_PLAN.md) | Competitor-beating feature plan and prioritization |
| [`docs/STUDIO_QUALITY_SWEEP.md`](docs/STUDIO_QUALITY_SWEEP.md) | Studio audit, repairs, and verification evidence |
| [`docs/PLAY_STORE_DEPLOY.md`](docs/PLAY_STORE_DEPLOY.md) | Android release checklist |
| [`docs/DESKTOP_DEPLOY.md`](docs/DESKTOP_DEPLOY.md) | Electron packaging |
| [`docs/CAPACITOR_PLUGIN_AUDIT.md`](docs/CAPACITOR_PLUGIN_AUDIT.md) | Native plugin inventory |
| [`docs/VOICE_SPECTRUM_VERIFICATION.md`](docs/VOICE_SPECTRUM_VERIFICATION.md) | Voice-spectrum verification run |
| [`docs/tha-spot-modern-games-review.md`](docs/tha-spot-modern-games-review.md) | Catalog additions and artwork provenance |
| [`CLOUDFLARE_TUNNEL.md`](CLOUDFLARE_TUNNEL.md) | Self-hosted tunnel setup |
| [`LEARNINGS.md`](LEARNINGS.md) | Engineering learnings log |
| [`AGENTS.md`](AGENTS.md) | Conventions for agents working in this repo |

---

© Smuve Jeff Presents · S.M.U.V.E. 2.0 — Strategic Music Utility Virtual Enterprise
