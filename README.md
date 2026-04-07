# Smuve Jeff Presents: S.M.U.V.E 2.0

**Strategic Music Utility Virtual Enterprise**

S.M.U.V.E 2.0 is a multi-surface artist platform that combines music production, AI strategy, visual creation, release planning, business operations, profile management, and community/gaming experiences inside one Angular application.

It is designed as an executive command deck for independent artists: build records, shape visuals, manage campaigns, coordinate releases, review analytics, protect sessions, and move across every workspace from a shared shell with AI assistance always close by.

---

## Platform overview

S.M.U.V.E 2.0 centers around a unified application shell with:

- a responsive sidebar + top command bar
- a global **Command Palette** (`Ctrl/Cmd + K`)
- an **Interaction Guide** (`?`)
- an always-available **AI advisor / chatbot drawer**
- live online / performance indicators
- theme and visual-performance controls
- route-based workspaces for creation, strategy, business, and community

The application defaults to `/hub` and uses lazy-loaded standalone Angular components for most major surfaces.

---

## Core capabilities

### 1. Music production and studio control

The production side of S.M.U.V.E 2.0 is built around the **Studio**, **Piano Roll**, and **Vocal Suite** workspaces.

- DAW-style studio surface with transport, mixer, effects, mastering, and performance-oriented controls
- DJ-style deck workflow with crossfader, platter interaction, and deck utilities
- piano-roll editing for composition and arrangement control
- step-sequencing with:
  - swing
  - humanize
  - per-step probability
  - ratchets
  - per-track lengths / polymeter behavior
  - velocity curves
  - pattern scenes and variations
- automation lanes with interpolation, modulation sources, and performance macros
- audio routing and production utilities powered by Tone.js / Web Audio
- vocal recording and microphone-oriented workflows

### 2. AI strategy and executive assistance

The AI system powers both ambient guidance and direct command-style workflows.

- executive advisor recommendations that react to the active workspace
- strategic briefs, market alerts, and decrees
- AI command flows for:
  - audits
  - auto-mix guidance
  - release strategy
  - business strategy
  - viral hooks
  - royalty and brand analysis
  - collaboration planning
- knowledge-driven guidance for artist growth, campaigns, and production decisions
- backend AI proxy support through the bundled Node/Express server

### 3. Visual production

The **Image & Video Lab** acts as a cinema-style visual workspace.

- multi-track timeline with visual, overlay, voiceover, and score lanes
- movie, stream, and vlog production modes
- delivery presets for landscape and vertical outputs
- clip controls for:
  - trimming
  - transitions
  - filters
  - brightness / contrast
  - noise reduction
  - background removal
  - upscaling toggles
- canvas-based preview and export integration

### 4. Release, marketing, and business operations

S.M.U.V.E 2.0 includes coordinated planning surfaces beyond creation.

- release pipeline with track-stage progression across instrumental, lyrics, vocals, mixing, and mastering
- automated marketing kickoff when a release reaches released state
- campaign planning and projections in the strategy workspace
- business suite and business pipeline detail views
- career tracking and opportunity planning
- analytics dashboards for audience / growth review
- project management and catalog-oriented workflows

### 5. Community and gamified engagement

**Tha Spot** is the social / gaming hub of the platform.

- room-based discovery and matchmaking
- live events
- leaderboards
- recommendation rails
- promotions
- social presence modules
- recently played history
- profile-linked progression, XP, streaks, and rewards
- fallback data source plus asset-driven live feed support

### 6. Profile, settings, and security

- artist profile editing and personalization
- synchronized app settings for UI, audio, AI, studio, and security
- local session persistence
- guarded routes with permission checks
- security logs and session management support
- profile sync to local backup and cloud endpoints

---

## Main workspaces

| Route | Workspace | Purpose |
| --- | --- | --- |
| `/hub` | Label Hub | Main command center for releases, profile context, playback, and navigation |
| `/studio` | Studio | Core music production workspace |
| `/piano-roll` | Piano Roll | MIDI-style note editing and arrangement |
| `/vocal-suite` | Vocal Suite | Vocal capture and refinement workflows |
| `/lyric-editor` | Lyric Editor | Writing and lyric-focused ideation |
| `/image-video-lab` | Image & Video Lab | Cinema-style visual production and preview |
| `/release-pipeline` | Release Pipeline | Track and release-stage coordination |
| `/projects` | Projects | Work-in-progress management |
| `/strategy` | Intel Lab / Strategy Hub | AI strategy, campaigns, social planning, and intelligence |
| `/career` | Career Board | Career planning and momentum tracking |
| `/business-suite` | Business Suite | Business operations and pipelines |
| `/business-pipeline/:id` | Business Pipeline Detail | Single-pipeline drill-down |
| `/analytics` | Analytics Dashboard | Audience and performance monitoring |
| `/knowledge-base` | Knowledge Base | AI-oriented planning and reference surface |
| `/profile` | Profile | Artist identity and settings context |
| `/practice` | Practice Space | Rehearsal-focused tools |
| `/tha-spot` | Tha Spot | Gaming, community, matchmaking, and discovery |
| `/settings` | Settings | Visual, performance, audio, AI, and security controls |
| `/login` | Login | Authentication entry |

### Route aliases

- `/player` → Hub
- `/dj` → Studio
- `/image-editor` → Image & Video Lab
- `/video-editor` → Image & Video Lab
- `/gaming-hub` → Tha Spot
- `/networking` → Tha Spot

---

## Shared experience layer

Several capabilities span the full application:

- **Command Palette** for fast actions and navigation
- **Interaction Guide** with context-sensitive tips
- **AI Advisor / Chatbot** drawer
- **Notification Toasts** for system feedback
- **Performance Mode** for lighter UI behavior on constrained devices
- **Theme controls** with persisted profile-backed settings
- **PWA support** with Angular Service Worker caching for app assets and API requests
- **Update prompts** when a new service-worker version is ready

---

## Architecture highlights

### Frontend

- **Angular 21**
- standalone components
- lazy-loaded routed workspaces
- TypeScript + Angular signals
- Tailwind CSS + custom styling
- Tone.js for audio workflows

### Data and persistence

- local backup through browser storage
- cloud profile and project sync through API endpoints
- asset-driven content feeds, including Tha Spot feed JSON data

### Backend

The repository also includes a lightweight backend in `/server`:

- Express API
- PostgreSQL persistence
- security log + session tables
- project/profile endpoints
- Google Generative AI proxy endpoint for AI responses
- rate limiting on `/api/*`

---

## Getting started

### Prerequisites

- **Node.js:** `22.12.0`
- **npm:** `>=10`

### Install dependencies

```bash
npm ci
```

### Start the frontend

```bash
npm run dev
```

Open:

```text
http://localhost:4200/
```

The root route redirects to `/hub`.

---

## Optional backend setup

If you want to run the bundled backend locally:

```bash
cd server
npm install
npm start
```

Expected environment variables for `/server`:

- `DATABASE_URL`
- `GEMINI_API_KEY`

---

## Validation and development commands

### Lint

```bash
npm run lint
```

### Unit tests

```bash
npm test -- --runInBand
```

### Angular development build

```bash
npx ng build --configuration development
```

### End-to-end tests

Install Playwright browsers first if needed:

```bash
npx playwright install
npx playwright test
```

### Production-oriented build script

```bash
npm run build
```

### GitHub Pages deployment

```bash
npm run deploy
```

---

## Repository structure

```text
src/app/
├── components/   # strategy, profile, business, visuals, settings, community
├── hub/          # label hub + Tha Spot feed/game services
├── services/     # AI, auth, sync, security, analytics, audio, commands
├── studio/       # production, sequencing, automation, DJ, mixer, piano roll
└── types/        # shared domain models

server/
└── index.js      # Express + PostgreSQL + AI proxy backend

tests/e2e/
└── *.spec.ts     # Playwright end-to-end coverage
```

---

## Notable implementation details

- Auth guards protect selected routes such as Studio, Analytics, Projects, Business Suite, Knowledge Base, and Settings.
- Tha Spot can load live hub data from `/src/assets/data/tha-spot-feed.json` and fall back to a bundled TypeScript feed.
- Release progression can trigger a marketing campaign automatically when a release is marked released.
- Service-worker caching is enabled for app assets and API requests to support faster repeat visits and offline resilience.
- Mobile behavior adapts the shell and automatically leans toward performance mode on supported handheld user agents.

---

## Brand

**Smuve Jeff Presents**  
**S.M.U.V.E 2.0 — Strategic Music Utility Virtual Enterprise**

This platform positions itself as an executive-grade operating system for modern artist development: part studio, part strategy lab, part launch system, and part community arena.
