# Complete application guide coverage

The Settings **Complete Guide** now covers the whole application in 13 chapters.
This file records what the master video covers and which surfaces still need a
dedicated deep dive.

## Shipped deep dives

| Surface | Guide | Status |
| --- | --- | --- |
| S.M.U.V.E. assistant / chatbot | 9 chapters + `chat-music-manager-tutorial.mp4` | Shipped |
| Image & Video Lab | 9 chapters + `image-video-lab-tutorial.mp4` | Shipped |
| Studio | Masterclass tracks + surface atlas | Shipped |
| Tha Spot | `tha-spot-feature-tour.mp4` | Video exists; **not yet wired to in-app lessons** |
| Whole application | 13 chapters + `complete-app-guide.mp4` | Shipped in Settings |

## Master-guide chapters

1. Shell and navigation
2. Label Hub
3. Studio
4. Rhythm, performance and decks
5. Composition, AI Produce, Cowrite and learning
6. Image & Video Lab
7. Tha Spot, TV, radio and live
8. Career, strategy, analytics and Case File
9. Projects, release, business and rights
10. Assistant, Command Center, Neural Foundry and voice
11. Remix Arena, Cowrite, Inbox, Storefront and products
12. Profile, Journey, Cloud Vault, Timeline and Settings
13. End-to-end release workflow

The master guide is an orientation. It names each surface and the handoff, but
it does not replace a room-by-room operating manual.

## Remaining feature-specific video gaps

Priority order for the next pass:

1. **Tha Spot**: wire the existing feature tour into a Field Guide with chapters,
   SHOW ME targets, common mistakes and saved progress. The raw video already
   exists at `artifacts/tha-spot-video/tha-spot-feature-tour.mp4`.
2. **Hub**: a day-in-the-life walkthrough of the command center, next-move rail,
   release cards and cross-workspace handoffs.
3. **Studio beat tools**: separate deep dives for Drum Machine, Piano Roll,
   Sampler, Sound Pads, DJ, Performance and Vocal Suite. The Studio Masterclass
   covers them inside the larger path, but each deserves a focused chapter set.
4. **Composition Core / AI Produce**: brief design, genre constraints, generated
   steps, handoff into Studio, and the difference between a sketch and a record.
5. **Career and strategy**: Career Board, Intel Lab, Analytics, Artist
   Development, Adaptive Profile, Artist Coach and Case File as one evidence loop.
6. **Release and business**: Projects, Release Pipeline, Business Suite, Artist
   Toolkit, splits, royalties, contracts and the rights checklist.
7. **Community and commerce**: Remix Arena, Cowrite, Challenge Inbox, Storefront,
   Products and the public artist page, including permissions and ownership.
8. **Cloud and timeline**: Cloud Vault, Session Timeline, Sync Center, backup,
   restore and conflict recovery.
9. **Settings and security**: themes, HUD, performance mode, audio devices,
   permissions, 2FA, recovery codes and account safety.
10. **Command Center / Neural Foundry**: decrees, upgrade queue, workspace tools
    and how their recommendations differ from measured analytics.
11. **Profile and Journey**: identity, adaptive profile, questionnaire, archive,
    media and the difference between a draft and a committed profile.
12. **Music Academy / Practice**: program selection, drills, streaks, studio
    handoff and progress that survives a reload.

The next pass should start with Tha Spot because its video already exists and only
the guided lesson layer is missing. The other gaps are best produced in the same
order as the release workflow, so each video can hand off to the next.

## Rebuilding the video

The master is generated, not hand-edited. From a clean clone:

1. `npm ci` — application dependencies (Playwright is already a devDependency).
2. `npx playwright install --with-deps chromium` — the capture browser. The
   `--with-deps` flag installs the system libraries headless Chromium needs and
   wants sudo; on a host without root, provide the same libs locally and set
   `LD_LIBRARY_PATH`.
3. `npm run dev` (or `npm run preview` for a production build) — leaves the app
   on `http://127.0.0.1:4200` for the capture script to photograph.
4. `npm run guide:capture` — writes the 13 chapter screens to
   `artifacts/complete-app-guide/screens/` plus a `captures.json` receipt. Set
   `BASE_URL` when the app is served elsewhere. It exits non-zero unless all 13
   surfaces were captured, so a partial run cannot become a video.
5. `python3 -m pip install --target /tmp/tts edge-tts` and
   `npm install --prefix /tmp/smuve-media ffmpeg-static` — voice synthesis and
   encoding. `TTS_PATH` and `FFMPEG_PATH` override those locations.
6. `npm run guide:render` — synthesises any changed line, composes the chapter
   cards, encodes the 13 clips, and writes
   `artifacts/complete-app-guide/complete-app-guide.mp4` plus `chapters.json`,
   then copies the master over `src/assets/learn/complete-app-guide.mp4`.

The narrator is S.M.U.V.E. itself, and it shape-shifts sentence by sentence: `scripts/build-complete-app-guide.mjs` draws a voice from a 15-voice pool for every line, seeded by the line so a re-render keeps the same cast, and never repeats the previous voice. `GUIDE_VOICE_POOL`, `GUIDE_VOICE_SEED`, and `GUIDE_VOICE_RATE` override the pool, the seed, and the speaking rate; `voice-plan.json` records which voice and pitch spoke each line.

`npm run guide:rebuild` runs steps 4 and 6 back to back. Voice is cached per
sentence in `artifacts/complete-app-guide/build/voice/`, so a re-render only
synthesises lines whose text changed.

After a render, copy the `chapters[].start` values from
`artifacts/complete-app-guide/chapters.json` into `tutorialAt` in
`src/app/components/settings/complete-app-guide.lessons.ts`; that is where the
guide seeks when a chapter is watched from Settings, and it is the one number
the render cannot derive on its own.
