# Tha Spot modern browser-game review

Reviewed: 2026-10-03. Stack: Angular 21, TypeScript, standalone components/signals, Jest, Playwright.

## Added games

These are browser releases, not claims that downloadable console games can run in an iframe. Each addition has controls, objectives, genre/tags, a publisher destination, and a spotlight card. Ratings are provider snapshots on a five-point scale; live-player counts are not invented. Dates use provider structured metadata when available. PolyTrack's original release date is left unspecified rather than substituting its latest update date.

| Game | Source | Selection rationale |
| --- | --- | --- |
| PolyTrack | https://kodub.itch.io/polytrack | Developer-maintained 3D racing, track editor, community tracks; 2026 multiplayer update |
| Veck.io | https://www.crazygames.com/game/veck-io | December 2025 browser FPS with slide movement and private/team lobbies |
| SkillWarz | https://www.crazygames.com/game/skillwarz | 3D movement shooter, bot practice, teleports and multiple competitive modes |
| Hazmob FPS | https://www.crazygames.com/game/hazmob-fps-online-shooter | Desktop FPS with loadouts, custom matches and objective modes |
| Racing Limits | https://www.crazygames.com/game/racing-limits | 3D traffic racing, upgrades, career and time challenges |
| Rally Racer Dirt | https://www.crazygames.com/game/rally-racer-dirt | Tunable rally cars, drifting and real-time multiplayer |
| Vectaria.io | https://poki.com/en/g/vectaria-io | Multiplayer voxel building, crafting and optional-PvP survival |
| Super Liquid Soccer | https://poki.com/en/g/super-liquid-soccer | 3D football tournaments and ragdoll physics |
| Level Devil | https://poki.com/en/g/level-devil | Precision trap platforming and shared-device versus, not online multiplayer |

Additional independent developer checks:

- https://skillwarz.com/downloads.php links its browser release to CrazyGames.
- https://kodub.itch.io/polytrack documents controls, editor and 2026 multiplayer development logs.
- https://vectaria.io/ confirms the standalone building/crafting browser experience.
- https://playcanvas.com/explore was researched for browser-native 3D alternatives.
- https://docs.crazygames.com/faq/ distinguishes distribution rights from public accessibility: developers retain ownership.

All nine additions launch **externally with the existing domain confirmation**. Accessible pages and absent frame-blocking headers are not proof of permission to redistribute or embed games. No binaries, ROMs, SDKs, new service accounts, or broader iframe allowlists were added. Advertisements, publisher accounts, network availability, and device requirements remain under publisher control.

Rejected candidate: the proposed Poki Combat Online 2 path redirected to the Shooting category rather than the named game. Its separate domain advertises embedding, but ownership/affiliation was not established in this review, so it was not added.

## Catalogue artwork

- The JSON archive has 867 rows; 852 referenced one generic backdrop. Runtime curated additions previously brought the library to 931; this review adds nine for **940**.
- Normalization now supplies title-specific original SVG artwork for rows without verified covers. It is labeled **CATALOGUE TITLE ART**, not misrepresented as official box art or gameplay screenshots.
- `tha-spot-game-covers.ts` records source-page provenance for nine new and eighteen existing publisher covers. These are remote image references, not downloaded/rehosted assets.
- The existing premium art overrides are preserved. Local PNG/JPEG/WebP artwork is no longer rejected merely for being raster.
- Minecraft, GTA Online and Destiny 2 local SVGs had unescaped ampersands; these were invalid XML and are repaired.
- Minecraft Classic no longer inherits the modern Minecraft title banner.
- Error recovery uses the affected game's title, supports DOM reuse after filtering, and avoids repeated fallback requests. Cards, recent games and launch-preview images share the same resolver.
- Source extraction is title-checked: CrazyGames Tank Trouble and Soccer Physics paths returned Ragdoll Archers artwork, which was deliberately not assigned. Rate-limited or uncertain covers retain original title artwork rather than guessed CDN URLs.

## Reproducible checks

Managed development preview must be ready. The artwork audit uses an isolated Playwright context and a test-only login API response; it does not create accounts or write production data.

```sh
npm run audit:tha-spot-artwork -- --live --smoke
npm test -- --runInBand --runTestsByPath src/app/hub/game.service.spec.ts src/app/hub/game-art.spec.ts src/app/hub/tha-spot-feed.integrity.spec.ts src/app/components/tha-spot/tha-spot.component.spec.ts
bun tsc -b --noEmit
```

The audit decodes every unique runtime image in an actual browser, including local SVGs, remote covers and generated title images. The smoke path exercises all nine card → preview → domain confirmation → publisher target flows and checks rendered desktop/mobile geometry. Screenshots are written to `/tmp/tha-spot-1440.png` and `/tmp/tha-spot-390.png` for inspection, not committed.

Final checks: 940 runtime image sources decoded successfully (867 original title-art fallbacks); all nine card-to-publisher launch paths passed; the spotlight rendered nine loaded covers at 1440px and 390px without page overflow; six related Jest suites passed 149 tests; TypeScript passed.

Gameplay limitation: PolyTrack's actual Run game control was exercised on itch.io and loaded version 0.6.3, but this headless host could not create its WebGL renderer. Hardware-accelerated gameplay is therefore unverified, not counted as a pass. Publisher-page accessibility and launch routing do not prove completion of gameplay sessions, latency, multiplayer population, or long-term CDN availability. Most archive rows now have distinct original title artwork, **not authenticated official covers**. This was an artwork-wide audit, not a fresh playability or legal audit of every legacy cabinet. No production build, deployment, commit or push is part of this request.
