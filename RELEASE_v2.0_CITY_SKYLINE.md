# 🚀 Release v2.0 — "City Skylines After Dark" Rebrand

> The Tan Era is over. S.M.U.V.E. now lives after dark — neon-lit, stage-ready, label-signed.

## 🎨 Palette: From Ivory + Teal → Midnight + Neon

| Token | Before | After | Role |
|---|---|---|---|
| `--ivory-bg` | `#F5EFE0` sand | `#0B0E1F` Midnight Base | Page background |
| `--ivory-paper` | `#FBF7EC` cream | `#1A2040` Raised Surface | Buttons / cards |
| `--ivory-deep` | `#DCD0B5` | `#06091A` Pit Black | Modal scrim |
| `--teal-500` | `#0E7C7B` muted | `#00E5FF` Neon Cyan | Primary accent |
| `--espresso-text` | `#1F1A12` | `#F1F5FF` Starlight | Text |
| `--orange` | `#D97706` | `#FFB627` Stage Spotlight | Warm accent |
| `--record` | `#B91C1C` | `#FF1A4D` ON-AIR Red | Recording |
| **NEW** `--neon-pink` | — | `#FF1A8C` | Party lights |
| **NEW** `--neon-violet` | — | `#8B5CF6` | Club |
| **NEW** `--neon-amber` | — | `#FFB627` | Spotlight |
| **NEW** `--neon-mint` | — | `#34F5C5` | LED |

**Dark mode is now "Lights Out / Stage Mode"** — even deeper black (`#000208`) with full neon halos and pulse shadows.

## 🏢 Hub → "PARALLAX RECORDS" (Independent Label)

- Scrolling marquee banner across the top of the hub
- Eyebrow: `PARALLAX RECORDS // INDEPENDENT LABEL`
- Bento cards now read in label language:
  - **Top 40 Radar** (was Audit)
  - **A-Side // Now Spinning** (was Active Production — keeps the spinning vinyl)
  - **Tour Trajectory** (was Career Path)
  - **The Stage** (was Studio — entry to the DAW)
  - **Press Desk** (was Intel Hub)
  - **Open Mic** (was Tha Spot)
  - **Press Visuals** (was Cinema)
- HUD strip: "STRATEGIC DECREE ISSUED" → "LABEL DECREE // SIGN THIS"
- Footer: "PARALLAX RECORDS // Independent Label Network v2.0"

## 🎤 Studio → "S.M.U.V.E. STAGE" (Concert-Stage Vibe)

- Brand: `S.M.U.V.E. / STAGE` (was "Composer")
- **NOW PERFORMING** strobing red pip in topbar (`@keyframes onAirPulse`)
- Scrolling stage marquee strip under the topbar (`★ S.M.U.V.E. STAGE ★ NOW PERFORMING LIVE ★`)
- LED-strip gradient edges sweep around brand mark and AI button (`@keyframes stageLightsSweep`)
- Tone: it's the artist's show, not a workstation — City Lights / Booth Floor Open

## ✨ New Utility Classes (`styles.css`)

| Class | Purpose |
|---|---|
| `.comp-now-performing` | ON-AIR strobing pill (topbar) |
| `.led-strip` | Animated gradient border (mask-composite trick) |
| `.stage-marquee` + `.stage-marquee-track` | CSS-only infinite ticker with multi-color text gradient |
| `.skyline-band` | City-skyline bottom edge pattern |
| `@keyframes onAirPulse` | ON-AIR red light pulse |
| `@keyframes stageLightsSweep` | LED color rotation |
| `@keyframes ledStrobe` | Two-state brightness flicker |
| `@keyframes marqueeScroll` | Horizontal infinite scroll |
| `@keyframes neonBreath` | Text glow breathing effect |

## 🎹 Piano Preserved

Piano white keys are now driven by a dedicated `--pr-white-key #E8EFF8` token so the piano metaphor isn't broken by the dark rebrand in either mode.

## 🌉 Cross-link Highlights → Pink + Violet Stage Glow

Previously teal — now neon pink + violet with multi-layered box-shadows to match the stage aesthetic.

## 📂 Files Touched

- `src/styles.css` — full palette + utility re-write (largest change)
- `src/app/hub/hub.component.html` — record-label branding refresh
- `src/app/studio/studio.component.html` — `STAGE` rename + NOW PERFORMING pip + stage marquee
- `src/app/studio/studio.component.css` — `.comp-stage-marquee` spacing

## ✅ QA

- `npm run build` → 0 TypeScript errors, 0 template binding errors (11s)
- All variable-name references across the codebase auto-updated to the new palette
- Dark-mode toggle still works (now flips to "Lights Out" extreme mode)
- Cross-link in Arrangement View / Drum Machine still highlights correctly with new pink/violet glow

## 🎯 What's Next

- Polish dark-mode per-component overrides for Piano Roll, DJ Deck, Mixer, Drum Machine, Performer  
- Animated city-skyline silhouette bg with beat-reactive windows lighting up
- New "Live Show" view for the Studio to broadcast a performance session to the Hub roster
