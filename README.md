# S.M.U.V.E. 4.0

S.M.U.V.E. 4.0 is an Angular-based browser application for independent artists who need production tools, AI-assisted strategy, release planning, and creative support in one place.

The app ships with a command-hub landing page and a set of routed workspaces covering music production, vocal capture, visual creation, artist profile management, strategy, business planning, analytics, and community/gaming experiences.

## What the application includes

### Core creation surfaces

- **Label Hub (`/hub`)**  
  The main landing page and control room. It surfaces playback, quick profile setup, executive notes, market pulse, and direct access to the rest of the platform.

- **Studio (`/studio`)**  
  The main production workspace with DAW-style controls, DJ/deck functionality, mixing tools, effects, and mastering-oriented utilities.

- **Piano Roll (`/piano-roll`)**  
  MIDI-style note editing and arrangement control for composing and refining parts.

- **Vocal Suite (`/vocal-suite`)**  
  Recording-focused tooling for vocal sessions, microphone workflows, and take monitoring.

- **Lyric Editor (`/lyric-editor`)**  
  A songwriter workspace for writing lyrics with AI-assisted rhyme and idea support.

### Visual and release tooling

- **Image & Video Lab / CinemaEngine (`/image-video-lab`)**  
  A visual production workspace for cover art, visual concepts, and multi-track video timelines with delivery presets.

- **Release Pipeline (`/release-pipeline`)**  
  A launch-readiness surface for release staging, cohesion checks, and rollout management.

- **Projects (`/projects`)**  
  Catalog-style project management for creative work in progress.

### Strategy and business surfaces

- **Strategy Hub / Intel Lab (`/strategy`)**  
  AI strategy, campaign planning, intelligence briefs, outreach, and market analysis.

- **Career Hub (`/career`)**  
  A career-planning board for opportunities, growth priorities, and momentum tracking.

- **Business Suite (`/business-suite`)**  
  Business pipeline management and infrastructure tracking.

- **Business Pipeline Detail (`/business-pipeline/:id`)**  
  Drill-down view for a specific business pipeline item.

- **Analytics Dashboard (`/analytics`)**  
  Performance and audience-oriented dashboards for releases and artist activity.

- **Knowledge Base (`/knowledge-base`)**  
  A strategy-oriented information surface for AI and planning workflows.

### Profile, practice, and community

- **Profile / Journey (`/profile`)**  
  Artist identity, onboarding, goals, and settings.

- **Practice Space (`/practice`)**  
  Practice and rehearsal-oriented tooling.

- **Tha Spot (`/tha-spot`)**  
  A gaming and community hub with discovery, matchmaking, reputation, and social-energy presentation.

### Utility routes

- **Settings (`/settings`)**  
  Theme, performance, and visual-behavior controls.

- **Login (`/login`)**  
  Authentication entry point.

## Route aliases and shared entry points

Several routes intentionally point to the same feature surface:

- `/player` → Hub
- `/dj` → Studio
- `/image-editor` and `/video-editor` → Image & Video Lab
- `/gaming-hub` and `/networking` → Tha Spot

## Command shell features

Across the shared shell, the app also includes:

- **Command Palette** for quick navigation and actions
- **Interaction Guide** for contextual usage tips
- **Theme and performance controls** for adjusting the UI experience

## Tech stack

- **Framework:** Angular 21
- **Language:** TypeScript
- **Audio:** Tone.js + Web Audio APIs
- **AI integration:** Google Generative AI client
- **Styling:** Tailwind CSS + custom component styles
- **Unit testing:** Jest
- **E2E tooling present:** Playwright

## Prerequisites

- **Node.js:** `22.12.0`
- **npm:** `>=10.0.0`

The repository currently declares an exact Node engine version in `package.json`.

## Installation

```bash
npm install --legacy-peer-deps
```

## Development

Start the local development server:

```bash
npm run dev
```

Then open:

```text
http://localhost:4200/
```

The app redirects the root route to `/hub`.

## Build

Create a build with Angular:

```bash
npx ng build --configuration development
```

You can also use the package script:

```bash
npm run build
```

## Tests

Run Jest tests:

```bash
npm test
```

Useful targeted commands while working in this repository:

```bash
npm test -- --runInBand src/app/app.component.spec.ts src/app/hub/hub.component.spec.ts
npx ng build --configuration development
```

## Linting and formatting

```bash
npm run lint
npm run format
```

## Deployment

The repository includes a GitHub Pages deployment script:

```bash
npm run deploy
```

## Notes

- Some routes are guarded and depend on the app's auth/permission flow.
- The application is intentionally multi-surface: production, visuals, strategy, business, and community tooling all live inside the same shell.

## License

© Smuve Jeff Presents. All rights reserved.
